const twilio = require("twilio");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

/**
 * Send a message without a template
 * @param {string} from 
 * @param {string} to 
 * @param {string} message 
 */
const sendMessage = async (from, to, message) => {
    try {
        await client.messages.create({
            body: message,
            from,
            to,
        });
        console.log(`Message sent to ${to}`);
    } catch (error) {
        console.error(`Failed to send message to ${to}:`, error);
    }
}

/**
 * Send a message without a template
 * @param {string} from 
 * @param {string} to 
 * @param {string} message 
 */
const sendNotificationOwner = async (from, to, payload) => {
    const TEMPLATE_SID = 'HX9b83233f3fd46ee828e1bee94f6fba8a';
    try {
        await client.messages.create({
            from,
            to,
            contentSid: TEMPLATE_SID,
            contentVariables: JSON.stringify({
                1: payload.service,
                2: payload.clientName,
                3: payload.clientNumber,
                4: payload.endTime,
                5: payload.startTime,
                7: payload.eid
            })
        });
        console.log(`Appointment scheduled notification sent to ${to}`);
    } catch (error) {
        console.error(`Failed to send message to ${to}:`, error);
    }
}


module.exports = { sendMessage, sendNotificationOwner };
