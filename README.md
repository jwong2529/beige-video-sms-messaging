# SMS Messaging Application
This application integrates Twilio SMS messaging with HubSpot CRM to send and receive SMS messages while logging details into HubSpot properties. It supports role-based messaging (Client, Content Producer, Project Manager), SMS logging, and masked phone number communication.

*Note: This application was developed using test numbers, including my own phone number, for demonstration purposes.*

## Features
* Send SMS: Send SMS messages with Twilio, with role-based sender identification.
* Receive SMS: Handle incoming SMS messages and forward them to designated recipients.
* HubSpot integration: Automatically log SMS details (timestamp, message text, sender, delivery status) in HubSpot Contacts and Deals.
* Masked numbers: Use masked numbers for anonymized communication.
* Future features:
  * Integrate Twilio webhooks to alert HubSpot about SMS events in real time.
  * Add automation in HubSpot to send SMS information when deals are created or statuses are updated.

## Installation
Install Node.js and open a Twilio and HubSpot account. Create a ```.env``` file with the following variables:
```
PORT=<desired_port_number>
TWILIO_ACCOUNT_SID=<your_twilio_account_sid>
TWILIO_AUTH_TOKEN=<your_twilio_auth_token>
TWILIO_PHONE_NUMBER=<your_twilio_phone_number>
TWILIO_TEST_ACCOUNT_SID=<your_twilio_test_account_sid>
TWILIO_TEST_AUTH_TOKEN=<your_twilio_test_auth_token>
TWILIO_TEST_PHONE_NUMBER=<your_twilio_test_phone_number>
HUBSPOT_API_KEY=<your_hubspot_api_key>
TEST_MODE=true # Set to 'false' in production
CLIENT_PHONE=<hardcoded_client_phone_number> # For testing purposes
```
### Steps
1. Clone the repository.
2. Install dependencies:
    ```npm install```
3. Start the server:
    ```node server.js```

## API Reference
### Send SMS
* Endpoint: POST /send-sms
* Description: Sends an SMS message and logs it in HubSpot.   (System -> Client)
* Request Body:
```
{
  "message": "Hello client!",
  "sender_role": "project_manager",
  "contactId": <hubspot_contact_record_id>",
  "dealId": "hubspot_deal_record_id"
}
```
* Response:
```
{
  "status": "success",
  "message": "SMS sent successfully",
  "twilioResponse": { ... }
}
```
### Receive SMS
* Endpoint: POST /receive-sms
* Description: Handles incoming SMS messages, forwards them, and logs them in HubSpot. (Client -> System)
* Request Body:
```
{
  "From": "<sender_phone_number>",
  "Body": "Hello project manager!",
  "recipientRole": "project_manager",
  "contactId": "<hubspot_contact_record_id>",
  "dealId": "<hubspot_deal_record_id>"
}
```
* Response:
```
{
  "status": "success",
  "message": "Message received and forwarded successfully",
  "twilioResponse": { ... }  
}
```
### Proxy SMS
* Endpoint: POST /proxy-sms
* Description: Sets up a Twilio Proxy session for anonymized communication between two participants.
* Request Body:
```
{
  "personOne": "<phone_number_one>",
  "personTwo": "<phone_number_two>"
}
```
* Response:
```
{
  "message": "Proxy session created successfully",
  "sessionId": "<session_id>"
}
```
## Notes
* HubSpot SMS logging: SMS details are appended to the sms_log property for Deals. This is a custom property that must be configured in your HubSpot account.
* Testing Mode: When TEST_MODE is set to 'true', the application uses Twilio's test credentials and test numbers. Actual SMS messages cannot be sent in this mode.
