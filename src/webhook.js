const openai = require("./ai");

/**
 * Decodes the base64-encoded body from Twilio and converts it into a JSON object.
 * @param {string} base64Body - The base64-encoded body received from Twilio.
 * @returns {Object} - Parsed JSON object.
 */
const parseBody = (base64Body) => {
    try {
        // Step 1: Decode from Base64
        const decodedBody = Buffer.from(base64Body, "base64").toString("utf-8");

        // Step 2: Parse using URLSearchParams
        const params = new URLSearchParams(decodedBody);
        const parsedBody = Object.fromEntries(params.entries());

        return parsedBody;
    } catch (error) {
        console.error("❌ Error parsing request body:", error);
        return {};
    }
};

const handler = async (event) => {
    try {
        if (!event.isBase64Encoded || !event.body) {
            throw new Error("Invalid request body");
        }

        // Decode and parse WhatsApp message
        const whatsappData = parseBody(event.body);

        const response = await openai.getAIResponse(
            whatsappData.To,
            whatsappData.From,
            whatsappData.Body
        );

        return {
            statusCode: 200,
            body: response
        };
    } catch (error) {
        console.error("❌ Error handling WhatsApp message:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};

module.exports = { handler };
