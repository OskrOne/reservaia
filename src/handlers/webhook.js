const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const QUEUE_URL = process.env.MESSAGES_QUEUE_URL;

/**
 * Decodes the base64-encoded body from Twilio and converts it into a JSON object.
 * @param {string} base64Body - The base64-encoded body received from Twilio.
 * @returns {Object} - Parsed JSON object.
 */
const parseBody = (base64Body) => {
    try {
        // Decode from Base64
        const decodedBody = Buffer.from(base64Body, "base64").toString("utf-8");

        // Parse using URLSearchParams
        const params = new URLSearchParams(decodedBody);
        const parsedBody = Object.fromEntries(params.entries());

        return parsedBody;
    } catch (error) {
        console.error("❌ Error parsing request body:", error);
        return {};
    }
};

/**
 * Handler
 * @param {*} event 
 * @returns 
 */
const handler = async (event) => {
    try {
        if (!event.isBase64Encoded || !event.body) {
            throw new Error("Invalid request body");
        }

        // Decode and parse WhatsApp message
        const whatsappData = parseBody(event.body);

        // Send message to SQS
        const params = {
            QueueUrl: QUEUE_URL,
            MessageBody: JSON.stringify(whatsappData),
            MessageGroupId: whatsappData.From
        };
        const sqs = new SQSClient();
        const command = new SendMessageCommand(params);
        await sqs.send(command);;

        return {
            statusCode: 200
        };
    } catch (error) {
        console.error("Error handling WhatsApp message:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};

module.exports = { handler };
