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
        //keyFile: "service-account.json",
        scopes: ["https://www.googleapis.com/auth/calendar"],
    });

    return new calendar_v3.Calendar({ auth: calendarAuth });
}

/**
 * Retrieves available time slots within a specified date range.
 * @param {string} calendarId - The Google Calendar ID.
 * @param {number} duration - Duration of the event in minutes.
 * @param {number} startTime - Start of the availability window (timestamp).
 * @param {number} endTime - End of the availability window (timestamp).
 * @returns {Promise<Array>} - List of available slots.
 */
const getAvailableSlots = async (calendarId, duration, startTime, endTime) => {
    const startMoment = moment(startTime).minutes(0).add(duration, 'minutes');
    const endMoment = moment(endTime);

    try {
        console.log(`Searching for available slots between ${startMoment.format("YYYY-MM-DD HH:mm")} and ${endMoment.format("YYYY-MM-DD HH:mm")}`);

        // Fetch calendar events within the provided range
        const calendar = await getCalendar();
        const response = await calendar.events.list({
            calendarId,
            timeMin: startMoment.toISOString(),
            timeMax: endMoment.toISOString(),
            singleEvents: true,
            orderBy: "startTime"
        });

        const events = response.data.items || [];
        console.log("Events:", events);
        const availableSlots = [];

        let currentSlotStart = moment(startMoment);

        for (const event of events) {
            const eventStart = moment(event.start.dateTime || event.start.date);
            const eventEnd = moment(event.end.dateTime || event.end.date);

            // Adding time slots until the start of the event
            while (currentSlotStart.isBefore(eventStart)) {
                const currentSlotEnd = moment(currentSlotStart).add(duration, 'minutes');
                if (currentSlotEnd.isAfter(eventStart)) break; // Skip overlapping slots
                availableSlots.push({
                    start: currentSlotStart.format(),
                    end: currentSlotEnd.format(),
                });
                currentSlotStart = currentSlotEnd;
            }

            // Moving the current slot to the end of the event
            if (currentSlotStart.isBefore(eventEnd)) {
                currentSlotStart = eventEnd;
            }
        }

        // Adding remaining time slots after the last event
        while (currentSlotStart.isBefore(endMoment)) {
            const currentSlotEnd = moment(currentSlotStart).add(duration, 'minutes');
            if (currentSlotEnd.isAfter(endMoment)) break;
            availableSlots.push({
                start: currentSlotStart.format(),
                end: currentSlotEnd.format(),
            });
            currentSlotStart = currentSlotEnd;
        }

        return availableSlots;
    } catch (error) {
        console.error("❌ Error retrieving events:", error);
        return [];
    }
};


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
            resource: eventData,
        });
        console.log("✅ Event created:", response.data.htmlLink);
        return response.data;
    } catch (error) {
        console.error("❌ Error adding the event:", error);
        throw new Error("Failed to create event");
    }
};


module.exports = { getAvailableSlots, createEvent };
