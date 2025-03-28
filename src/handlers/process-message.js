const { OpenAI } = require('openai');
const moment = require('moment-timezone');
moment.tz.setDefault('America/Mexico_City'); // This is not right, we should manage any timezone

// DB
const threads = require('../db/threads');
const business = require('../db/business');
const appointments = require('../db/appointments');

// Utils
const calendar = require('../utils/calendar');
const whatsapp = require('../utils/whatsapp');

// SQS
const { SQSClient, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const QUEUE_URL = process.env.MESSAGES_QUEUE_URL;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ASSISTANT_ID = process.env.ASSISTANT_ID;

const handler = async (event) => {
    for (const record of event.Records) {
        const body = JSON.parse(record.body);
        console.log("Empecemos", JSON.stringify(body, null, 2));

        const assistantNumber = body.To;
        const clientNumber = body.From;
        const message = body.Body;

        // Get or create threadID
        let threadId = await threads.getThreadId(assistantNumber, clientNumber);
        if (!threadId) {
            const thread = await openai.beta.threads.create();
            await threads.createThreadId(assistantNumber, clientNumber, thread.id);
            threadId = thread.id;
        }


        // Check if there is an active run, if so, wait it to finish
        const runs = await openai.beta.threads.runs.list(threadId);
        const terminalStatus = ['completed', 'failed', 'cancelled', 'expired'];

        const activeRun = runs.data.find(run => !terminalStatus.includes(run.status));

        if (activeRun) {
            console.log(`Hay un run activo (${activeRun.id}), esperando a que finalice...`);
            while (true) {
                const run = await openai.beta.threads.runs.retrieve(threadId, activeRun.id);
                if (terminalStatus.includes(run.status)) break;
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        // Create messages, 1 for context, the other one is the real message
        await openai.beta.threads.messages.create(threadId,
            {
                role: "assistant",
                content: "Hoy es " + moment().toLocaleString(),
            }
        );
        await openai.beta.threads.messages.create(threadId,
            {
                role: "user",
                content: message,
            }
        );

        // Create a new run
        const run = await openai.beta.threads.runs.create(threadId, {
            assistant_id: ASSISTANT_ID,
        });

        // Wait the answer
        let responseMessage = "";
        while (true) {
            const runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
            if (runStatus.status === "requires_action") {
                console.log("requires_action");
                console.log(JSON.stringify(runStatus.required_action, null, 2));
                const toolOutputs = [];

                // Review which action to process and process it
                for (const toolCall of runStatus.required_action.submit_tool_outputs.tool_calls) {
                    const argumentsObj = JSON.parse(toolCall.function.arguments);

                    if (toolCall.function.name === "guardar_reserva") {
                        await whatsapp.sendMessage(assistantNumber, clientNumber, "Estoy guardando la reserva, dame un momento");
                        await saveEvent(assistantNumber, clientNumber, argumentsObj);
                        toolOutputs.push({
                            tool_call_id: toolCall.id,
                            output: "reserva guardada",
                        });
                    } else if (toolCall.function.name === "consulta_reservas_confirmadas") {
                        await whatsapp.sendMessage(assistantNumber, clientNumber, "Estoy consultando la disponibilidad, dame un momento");
                        toolOutputs.push({
                            tool_call_id: toolCall.id,
                            output: JSON.stringify(await getEvents(assistantNumber, argumentsObj))
                        });
                    } else if (toolCall.function.name === "cancelar_reserva") {
                        toolOutputs.push({
                            tool_call_id: toolCall.id,
                            output: "reserva cancelada",
                        });
                    }
                }

                // Submit responses
                await openai.beta.threads.runs.submitToolOutputs(threadId, run.id, {
                    tool_outputs: toolOutputs,
                });

            } else if (runStatus.status === "completed") {
                const messages = await openai.beta.threads.messages.list(threadId);
                responseMessage = messages.data[0].content[0].text.value;
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
        }

        // Send message to whatsapp
        await whatsapp.sendMessage(assistantNumber, clientNumber, responseMessage);
        await deleteQueueMessage(record);
    }

    return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Messages processed' }),
    };
};


const deleteQueueMessage = async (record) => {

    const sqs = new SQSClient();

    await sqs.send(
        new DeleteMessageCommand({
            QueueUrl: QUEUE_URL,
            ReceiptHandle: record.receiptHandle,
        })
    );
}


/**
 * Get events already scheduled
 * @param {string} assistantNumber 
 * @param {Object} argumentsObj 
 * @returns 
 */
const getEvents = async (assistantNumber, argumentsObj) => {
    try {
        const busi = await business.getBusinessByPhone(assistantNumber);
        if (!busi || !busi.employees) {
            console.error('Business not found or has no employees.');
            return [];
        }

        const { employee_name, start_time, end_time } = argumentsObj;

        if (employee_name) {
            const employee = busi.employees.find(e => e.name === employee_name);
            if (!employee) {
                console.warn(`Employee not found: ${employee_name}`);
                return [];
            }

            try {
                const employeeEvents = await calendar.getEvents(employee.calendarId, start_time, end_time);
                return [{
                    employee_name: employee.name,
                    events: employeeEvents,
                }];
            } catch (err) {
                console.error(`Failed to fetch events for ${employee.name}:`, err);
                return [{
                    employee_name: employee.name,
                    events: [],
                }];
            }
        }

        // Fetch events for all employees in parallel
        const events = await Promise.all(
            busi.employees.map(async (employee) => {
                try {
                    const evts = await calendar.getEvents(employee.calendarId, start_time, end_time);
                    return {
                        employee_name: employee.name,
                        events: evts,
                    };
                } catch (err) {
                    console.error(`Failed to fetch events for ${employee.name}:`, err);
                    return {
                        employee_name: employee.name,
                        events: [],
                    };
                }
            })
        );

        return events;
    } catch (error) {
        console.error('Unexpected error while fetching events:', error);
        return [];
    }
}

/**
 * Save appointment
 * @param {string} assistantNumber 
 * @param {sting} clientNumber 
 * @param {Object} payload 
 */
const saveEvent = async (assistantNumber, clientNumber, payload) => {
    try {
        const busi = await business.getBusinessByPhone(assistantNumber);
        const apps = await appointments.getAppointment(assistantNumber, clientNumber);
    
        if (!busi || !busi.employees) {
            console.error("Business or employees not found.");
            return;
        }
    
        const employee = busi.employees.find(e => e.name === payload.employee_name);
        if (!employee) {
            console.error(`Employee not found: ${payload.employee_name}`);
            return;
        }
    
        payload.service_name ||= payload.summary;
    
        const existingAppointments = apps?.appointments?.[payload.client_name];
        const existingAppointment = existingAppointments?.find(app => app.service === payload.service_name);
    
        if (existingAppointment) {
            // Update existing calendar event
            try {
                await calendar.patchEvent(employee.calendarId, existingAppointment.eventId, payload);
                console.log(`Updated appointment for ${payload.client_name} - ${payload.service_name}`);
            } catch (err) {
                console.error("Failed to update calendar event:", err);
                return;
            }
        } else {
            // Create new calendar event
            let eventCalendar;
            try {
                eventCalendar = await calendar.createEvent(employee.calendarId, payload);
            } catch (err) {
                console.error("Failed to create calendar event:", err);
                return;
            }
    
            if (!apps?.appointments) {
                // First appointment for this client
                const newApps = {
                    appointments: {
                        [payload.client_name]: [{
                            service: payload.service_name,
                            eventId: eventCalendar.id,
                            employeeName: payload.employee_name,
                        }]
                    }
                };
    
                try {
                    await appointments.putAppointment(assistantNumber, clientNumber, newApps);
                    console.log("Stored first appointment for client.");
                } catch (err) {
                    console.error("Failed to save new appointment:", err);
                    return;
                }
            } else {
                // Add to existing client
                apps.appointments[payload.client_name] ||= [];
                apps.appointments[payload.client_name].push({
                    service: payload.service_name,
                    eventId: eventCalendar.id,
                    employeeName: payload.employee_name,
                });
    
                try {
                    await appointments.putAppointment(assistantNumber, clientNumber, apps);
                    console.log("Stored new appointment for existing client.");
                } catch (err) {
                    console.error("Failed to update existing appointments:", err);
                    return;
                }
            }
        }
    
        // Send confirmation message
        const message = '📅 Cita confirmada:\n\n' +
            `*Service*: ${payload.service_name}\n` +
            `*Client*: ${payload.client_name}\n` +
            `*Client phone*: ${clientNumber.replace("whatsapp:", "")}\n` +
            `*Start time*: ${new Date(payload.start.dateTime).toLocaleString('es-MX', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: 'numeric', minute: '2-digit', hour12: true,
                timeZone: 'America/Mexico_City'
            })}\n` +
            `*End time*: ${new Date(payload.end.dateTime).toLocaleString('es-MX', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: 'numeric', minute: '2-digit', hour12: true,
                timeZone: 'America/Mexico_City'
            })}`;
    
        try {
            await whatsapp.sendMessage(assistantNumber, busi.notificationsNumber, message);
            console.log("Confirmation message sent.");
        } catch (err) {
            console.error("Failed to send WhatsApp message:", err);
        }
    
    } catch (error) {
        console.error("Unexpected error during appointment handling:", error);
    }    
}

module.exports = { handler };
