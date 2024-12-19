const express = require('express')
const bodyParser = require('body-parser')
const axios = require('axios')
const twilio = require('twilio')
require('dotenv').config();

const app = express()
app.use(bodyParser.json())
const port = process.env.PORT || 5000;

// Set up Twilio and HubSpot credentials
const isTestMode = process.env.TEST_MODE === 'true';
const twilioClient = require('twilio')(
    isTestMode ? process.env.TWILIO_TEST_ACCOUNT_SID : process.env.TWILIO_ACCOUNT_SID,
    isTestMode ? process.env.TWILIO_TEST_AUTH_TOKEN : process.env.TWILIO_AUTH_TOKEN
);
const HUBSPOT_API_URL = "https://api.hubapi.com";
const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;

//Start server
app.listen(port, () => console.log(`Server running on port ${port}`));

// Role to phone number mapping (dummy numbers for testing purposes)
const roleNumbers = {
    project_manager: "+15556667777",
    content_producer: "+14445558888",
};

// Map Twilio's status responses to custom statuses for HubSpot
const statusMapping = {
    queued: 'Pending',
    sent: 'Delivered',
    failed: 'Failed',
}

// Phone number mapping for masking
// Ex: {"client_number": {"masked": "masked_number", "role": "project_manager"}}
let phoneMapping = {};
const client_phone = process.env.CLIENT_PHONE;

const logSmsToHubSpot = async (contactId, dealId, smsDetails) => {
    try {
        if (!contactId) {
            console.error("Missing HubSpot contact ID for logging SMS.")
            return;
        }

        // Update Contact w/ SMS details
        await axios.patch(`${HUBSPOT_API_URL}/crm/v3/objects/contacts/${contactId}`, {
            properties: {
                sms_timestamp: smsDetails.timestamp,
                sms_status: smsDetails.status,
                sms_message_text: smsDetails.message,
                sms_sender: smsDetails.sender,
            }
        }, {
            headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}` }
        });

        // Update Deal w/ SMS details
        if (dealId) {
            // Fetch existing SMS messages involving this deal
            const dealUrl = `${HUBSPOT_API_URL}/crm/v3/objects/deals/${dealId}`;
            const { data: dealData } = await axios.get(`${dealUrl}?properties=sms_log`, {
                headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}` }
            });

            const existingLog = dealData.properties.sms_log || ''; // In case property is empty
            const newLogEntry = `${getFormattedTimestamp()} - ${smsDetails.sender}: ${smsDetails.message}\n`;
            // Append new SMS message to existing log
            const updatedLog = `${existingLog}${newLogEntry}`;

            await axios.patch(dealUrl, {
                properties: {
                    sms_timestamp__deal_: smsDetails.timestamp,
                    sms_status__cloned_: smsDetails.status,
                    sms_message_text__deals_: smsDetails.message,
                    sms_sender__cloned_: smsDetails.sender,
                    sms_log: updatedLog
                }
            }, {
                headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}` }
            });
        }
    } catch (error) {
        if (error.response) {
            console.error("HubSpot API Error:", error.response.status, error.response.data);
        } else {
            console.error("Error:", error.message);
        }
        throw new Error("Failed to log SMS in HubSpot");
    }
}

app.post('/send-sms', async (req, res) => {
    const { message, sender_role, contactId, dealId } = req.body;
    const masked_number = isTestMode ? process.env.TWILIO_TEST_PHONE_NUMBER : process.env.TWILIO_PHONE_NUMBER;

    if (!message || !sender_role) {
        return res.status(400).json({
            status: 'error',
            message: 'Missing required parameters (message, sender_role)'
        });
    }

    const sender_number = roleNumbers[sender_role];
    if (!sender_number) {
        return res.status(400).json({
            status: 'error',
            message: 'Invalid sender role'
        });
    }

    try {
        // Update the phone mapping
        mapNumbers(client_phone, masked_number, sender_role);

        // Send SMS via Twilio
        const response = await twilioClient.messages.create({
            from: masked_number,
            to: client_phone,
            body: message
        });

        // Save mapping for routing replies
        phoneMapping[client_phone] = { masked: masked_number, role: sender_role };

        // Log SMS in HubSpot
        await logSmsToHubSpot(contactId, dealId, {
            timestamp: getFormattedTimestamp(),
            status: statusMapping[response.status] || 'Pending', // Default to 'Pending' if Twilio status isn't mapped
            message,
            sender: sender_role,
        });

        res.status(200).json({
            status: 'success',
            message: 'SMS sent successfully',
            twilioResponse: response
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to send SMS',
            error: error.message
        });
    }

});

app.post('/receive-sms', async (req, res) => {
    try {
        // Twilio sends incoming message details in the request body
        const { From, Body, recipientRole, contactId, dealId} = req.body; // 'From' is the sender's phone number
        const masked_number = isTestMode ? process.env.TWILIO_TEST_PHONE_NUMBER : process.env.TWILIO_PHONE_NUMBER;

        // Validate incoming request
        if (!From || !Body || !recipientRole || !contactId || !dealId) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required parameters (From, Body, recipientRole, contactId, dealId)'
            });
        }

        mapNumbers(client_phone, masked_number, recipientRole)

        // Ensure client mapping exists
        const { role } = phoneMapping[From] || {};
        if (!role) {
            return res.status(404).json({
                status: 'error',
                message: 'Client number not found in mapping. Unable to determine role.'
            });
        }

        // Find the recipient number for the role
        const recipient_number = roleNumbers[role];
        if (!recipient_number) {
            return res.status(404).json({
                status: 'error',
                message: 'No recipient found for the specified role.'
            });
        }

        // Forward the received message to the appropriate recipient
        const response = await twilioClient.messages.create({
            from: masked_number,
            to: recipient_number,
            body: Body
        });

        // Log the received SMS in HubSpot
        await logSmsToHubSpot(contactId, dealId, {
            timestamp: getFormattedTimestamp(),
            // status: statusMapping[response.status] || 'Pending',
            status: 'Delivered',
            message: Body,
            sender: 'client'
        });

        res.status(200).json({
            status: 'success',
            message: 'Message received and forwarded successfully',
            twilioResponse: response
        });
    } catch (error) {
        console.error('Error processing received SMS:', error);

        res.status(500).json({
            status: 'error',
            message: 'Failed to process incoming SMS',
            error: error.message
        });
    }
});

// Custom masking system for anonymization
const mapNumbers = (clientPhone, maskedNumber, role) => {
    if (!clientPhone || !maskedNumber || !role) {
        throw new Error('Missing required parameters (clientPhone, maskedNumber, role');
    }

    phoneMapping[clientPhone] = { masked: maskedNumber, role };
    console.log(`Phone mapping updated: ${clientPhone} -> ${JSON.stringify(phoneMapping[clientPhone])}`);
}

// Using Twilio Proxy API
app.post('/proxy-sms', async (req, res) => {
    const { personOne, personTwo } = req.body;

    try {
        // Create proxy session in Twilio
        const session = await twilioClient.proxy.services('your_proxy_service_sid').session.create({
            uniqueName: `session-${Date.now()}`,
        });

        // Add people
        await twilioClient.proxy.services('your_proxy_service_sid').sessions(session.sid).participants.create({
            identifier: personTwo
        });

        res.status(200).send({ message: 'Proxy session created successfully', sessionId: session.sid });
    } catch (error) {
        console.error('Error creating proxy session:', error);
        res.status(500).send({ error: 'Failed to create proxy session' });
    }
});

// Fix timestamp
const getFormattedTimestamp = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Account for zero index
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
