const express = require('express')
const bodyParser = require('body-parser')
const axios = require('axios')
const twilio = require('twilio')
require('dotenv').config();

const app = express()
app.use(bodyParser.json())
const port = process.env.PORT || 5000;

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

//Start server
app.listen(port, () => console.log(`Server running on port ${port}`));

app.post('/send-sms', async (req, res) => {
    const { contactId, message } = req.body;

    try {
        // Fetch contact details from HubSpot
        const hubSpotResponse = await axios.get(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
            headers: { Authorization: `Bearer ${process.env.HUBSPOT_API_KEY}` },
        });

        const contact = hubSpotResponse.data;
        const phoneNumber = contact.properties.phone_number;

        // Send SMS using Twilio
        const smsResponse = await twilioClient.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phoneNumber,
        });

        // Log SMS details back to HubSpot
        await axios.patch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
            properties: {
                sms_timestamp: new Date().toISOString(),
                sms_status: 'Pending',
                sms_message_text: message,
                sms_sender: 'Beige Video',
            },
        }, {
            headers: { Authorization: `Bearer ${process.env.HUBSPOT_API_KEY}` },
        });

        res.status(200).send({ message: 'SMS sent succesfully', sid: smsResponse.sid });
    } catch (error) {
        console.error('Error sending SMS:', error);
        res.status(500).send({ error: 'Failed to send SMS' });
    }
});