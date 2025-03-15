const { google } = require("googleapis");
const moment = require("moment");
const { transformEvent } = require("./date-format");
const { getGoogleServiceAccount } = require("./secrets-manager");

/**
 * Gets the Google Calendar API client.
 * @returns {Promise<Object>} - Google Calendar API client.
 */
const getCalendar = async () => {
    // Google Calendar authentication using a service account
    const credentials = await getGoogleServiceAccount();
    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/calendar"],
    });
    return google.calendar({ version: "v3", auth });
}


/**
 * Retrieves available time slots within a specified date range.
 * @param {string} calendarId - The Google Calendar ID.
 * @param {number} durationMinutes - Duration of the event in minutes.
 * @param {number} startHour - Start of the availability window (24-hour format).
 * @param {number} endHour - End of the availability window (24-hour format).
 * @param {string} searchRange - Search range ("week", "fortnight", or "month").
 * @returns {Promise<Array>} - List of available slots.
 */
const getAvailableSlots = async (calendarId, durationMinutes, startHour, endHour, searchRange) => {
    const now = moment().add(1, "hour").startOf("hour");
    let searchEnd;

    switch (searchRange) {
        case "week":
            searchEnd = moment().endOf("week"); // End of the current week
            break;
        case "fortnight":
            searchEnd = moment().add(15, "days").endOf("day"); // End of the next 15 days
            break;
        default:
            searchEnd = moment().add(1, "month").endOf("day"); // End of the current month
    }

    try {
        console.log(`🔍 Searching for available slots in range: ${searchRange}`);
        console.log(`📅 Checking between ${now.format("YYYY-MM-DD HH:mm")} and ${searchEnd.format("YYYY-MM-DD HH:mm")}`);

        // Fetch calendar events within the search range
        const calendar = await getCalendar();
        const response = await calendar.events.list({
            calendarId,
            timeMin: now.toISOString(),
            timeMax: searchEnd.toISOString(),
            singleEvents: true,
            orderBy: "startTime",
        });

        const events = response.data.items || [];
        let availableSlots = [];
        let currentTime = now.clone();

        // Loop through existing events and find available slots
        for (const event of events) {
            const eventStart = moment(event.start.dateTime || event.start.date);
            const eventEnd = moment(event.end.dateTime || event.end.date);

            while (currentTime.isBefore(eventStart)) {
                if (isValidSlot(currentTime, startHour, endHour)) {
                    availableSlots.push(formatSlot(currentTime, durationMinutes));
                }
                currentTime.add(1, "hour"); // Move to the next hour
            }

            currentTime = eventEnd.clone().minutes(0);
        }

        // Check remaining available slots until the end of the search range
        while (currentTime.isBefore(searchEnd)) {
            if (isValidSlot(currentTime, startHour, endHour)) {
                availableSlots.push(formatSlot(currentTime, durationMinutes));
            }
            currentTime.add(1, "hour");
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
const createEvent = async (eventData) => {
    const event = {
        summary: eventData.summary,
        location: eventData.location,
        description: eventData.description,
        start: {
            dateTime: eventData.startDateTime, // Format 'YYYY-MM-DDTHH:mm:ssZ'
            timeZone: eventData.timeZone,
        },
        end: {
            dateTime: eventData.endDateTime,
            timeZone: eventData.timeZone,
        },
        attendees: eventData.attendees?.map(email => ({ email })) || [],
        reminders: {
            useDefault: false,
            overrides: [{ method: "popup", minutes: 30 }], // Popup reminder 30 minutes before the event
        },
    };

    try {
        const calendar = await getCalendar();
        const response = await calendar.events.insert({
            calendarId: process.env.CALENDAR_ID, // Use an environment variable for flexibility
            resource: event,
        });
        console.log("✅ Event created:", response.data.htmlLink);
        return response.data;
    } catch (error) {
        console.error("❌ Error adding the event:", error);
        throw new Error("Failed to create event");
    }
};

/**
 * Helper function to check if a time slot falls within working hours.
 * @param {Object} time - Moment.js object representing the time slot.
 * @param {number} startHour - Start of available hours.
 * @param {number} endHour - End of available hours.
 * @returns {boolean} - True if the slot is valid, false otherwise.
 */
const isValidSlot = (time, startHour, endHour) => {
    const hour = time.hour();
    return hour >= startHour && hour < endHour;
};

/**
 * Helper function to format an available slot.
 * @param {Object} time - Moment.js object representing the start time.
 * @param {number} duration - Duration of the slot in minutes.
 * @returns {Object} - Formatted slot object.
 */
const formatSlot = (time, duration) => transformEvent({
    start: time.format(),
    end: time.clone().add(duration, "minutes").format(),
});


module.exports = { getAvailableSlots, createEvent };
