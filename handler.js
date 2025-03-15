const openai = require("./ai");
const { getBusinessByPhone } = require("./businesses");
const { getAvailableSlots } = require("./calendar");;

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

const webhook = async (event) => {
    try {
        if (!event.isBase64Encoded || !event.body) {
            throw new Error("Invalid request body");
        }

        // Decode and parse WhatsApp message
        const whatsappData = parseBody(event.body);

        /*
        const response = await openai.getAIResponse(
            whatsappData.To,
            whatsappData.From,
            whatsappData.Body
        );
        */

        const business = await getBusinessByPhone(whatsappData.To);
        if (!business) {
            // Business not found
            return {
                statusCode: 404,
                body: JSON.stringify({ message: "Business not found" }),
            };
        }

        console.log(business);

        const availableSlots = await getAvailableSlots(business.calendarId, 60, 9, 18, "week");

        return {
            statusCode: 200,
            body: availableSlots
        };
    } catch (error) {
        console.error("❌ Error handling WhatsApp message:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};

module.exports = { webhook };


