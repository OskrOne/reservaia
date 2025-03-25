const twilio = require("twilio");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

const sendMessage = async (assistantNumber, notificationNumber, message) => {
    try {
        const test = await client.messages.create({
            body: message,
            from: assistantNumber,
            to: notificationNumber,
        });
        console.log(`Message sent to ${notificationNumber}`);
    } catch (error) {
        console.error(`Failed to send message to ${notificationNumber}:`, error);
    }
}

module.exports = { sendMessage };
