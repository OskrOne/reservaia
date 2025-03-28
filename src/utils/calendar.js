const { auth, calendar_v3 } = require("@googleapis/calendar");
const moment = require("moment-timezone");
moment.tz.setDefault("America/Mexico_City"); // This is not right, we should manage any timezone
const { getGoogleServiceAccount } = require("./secrets-manager");

/**
 * Gets the Google Calendar API client.
 * @returns {Promise<Object>} - Google Calendar API client.
 */
const getCalendar = async () => {
    // Google Calendar authentication using a service account
    const credentials = await getGoogleServiceAccount();
    const calendarAuth = new auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/calendar"],
    });

    return new calendar_v3.Calendar({ auth: calendarAuth });
}

/**
 * Get events of a calendar within a specified date range.
 * @param {string} calendarId 
 * @param {string} startTime 
 * @param {string} endTime 
 * @returns 
 */
const getEvents = async (calendarId, startTime, endTime) => {
    const startMoment = moment(startTime);
    const endMoment = moment(endTime);

    try {
        const calendar = await getCalendar();
        const response = await calendar.events.list({
            calendarId,
            timeMin: startMoment.toISOString(),
            timeMax: endMoment.toISOString(),
            singleEvents: true,
            orderBy: "startTime"
        });

        return response.data.items || [];
    } catch (error) {
        console.error("❌ Error retrieving events:", error);
        return [];
    }
}


/**
 * Creates an event in Google Calendar.
 * @param {Object} eventData - Event details.
 * @returns {Promise<Object>} - The created event details.
 */
const createEvent = async (calendarId, eventData) => {
    try {
        const calendar = await getCalendar();
        const response = await calendar.events.insert({
            calendarId: calendarId,
            requestBody: eventData,
        });
        console.log("✅ Event created:", response.data);
        return response.data;
    } catch (error) {
        console.error("❌ Error adding the event:", error);
        throw new Error("Failed to create event");
    }
};


/**
 * Partially updates a Google Calendar event using PATCH
 * @param {string} calendarId - Calendar ID (usually "primary")
 * @param {string} eventId - ID of the event to update
 * @param {Object} updateData - Fields to update (summary, start, end, etc.)
 * @returns {Promise<Object>} - Updated event data
 */
const patchEvent = async (calendarId, eventId, updateData) => {
    const calendar = await getCalendar();
    try {
        const { data } = await calendar.events.patch({
            calendarId,
            eventId,
            requestBody: {
                ...updateData,
                status: 'confirmed' // Once an event is deleted in google calendar, is not deleted immediately, it remains the status 'canceled' for a shor period of time
            }
        });

        console.log('✅ Event updated:', data);
        return data;
    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.warn('Event not found. Creating a new one...');
            const { data } = await calendar.events.insert({
                calendarId: calendarId,
                requestBody: { 
                    ...updateData,
                    id: eventId
                }
            });
            console.log("✅ Event created:", response.data);
            return data;
        } else {
            console.error('Failed to update event:', error.message);
            throw error;
        }
    }
};

module.exports = { getEvents, createEvent, patchEvent };