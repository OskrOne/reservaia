const { OpenAI } = require('openai');
const threads = require('./threads');
const calendar = require('./calendar');
const business = require('./business');
const moment = require("moment-timezone");
moment.tz.setDefault("America/Mexico_City"); // This is not right, we should manage any timezone
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ASSISTANT_ID = process.env.ASSISTANT_ID;
const QUEUE_URL = process.env.APPOINTMENT_CONFIRMED_QUEUE_URL;

const sendNotification = async (assistantNumber, notificationNumber, clientNumber, clientName, service, appointmentTime) => {
  const sqsClient = new SQSClient();

  const params = {
    QueueUrl: QUEUE_URL,
    MessageBody: JSON.stringify({
      assistantNumber,
      notificationNumber,
      clientNumber,
      clientName,
      service,
      appointmentTime,
    }),
  };

  console.log("Enviando notificación...", params);

  try {

    const command = new SendMessageCommand(params);
    await sqsClient.send(command);;
    console.log(`Notification sent to ${notificationNumber}`);
  }
  catch (error) {
    console.error(`Failed to send notification to ${notificationNumber}:`, error);
  }
}

const getAIResponse = async (assistantNumber, clientNumber, body) => {
  try {

    // Get or create threadID
    let threadId = await threads.getThreadId(assistantNumber, clientNumber);
    if (!threadId) {
      const thread = await openai.beta.threads.create();
      await threads.createThreadId(assistantNumber, clientNumber, thread.id);
      threadId = thread.id;
    }

    console.log("Thread ID:", threadId);
    await openai.beta.threads.messages.create(threadId,
      {
        role: "assistant",
        content: "Hoy es " + moment().toLocaleString(),
      }
    );

    // Enviar mensaje al thread
    await openai.beta.threads.messages.create(threadId,
      {
        role: "user",
        content: body,
      }
    );

    // Ejecutar el asistente en el thread
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: ASSISTANT_ID,
    });

    // Esperar la respuesta del asistente
    let responseMessage = "";
    while (true) {

      const runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);

      if (runStatus.status === "requires_action") {

        const toolOutputs = [];
        for (const toolCall of runStatus.required_action.submit_tool_outputs.tool_calls) {

          console.log(JSON.stringify(toolCall, 2, null));
          const argumentsObj = JSON.parse(toolCall.function.arguments);
          const busi = await business.getBusinessByPhone(assistantNumber);
          console.log("argumentsObj", argumentsObj);
          if (toolCall.function.name === "guardar_reserva") {
            const employee = busi.employees.find((employee) => employee.name === argumentsObj.employee_name);

            // Creating event in Google Calendar
            await calendar.createEvent(employee.calendarId, argumentsObj); // Aqui hay que corregir

            // Sending notification
            await sendNotification(busi.assistantNumber, busi.notificationsNumber, clientNumber, argumentsObj.client_name, argumentsObj.summary, argumentsObj.start.dateTime);

            console.log("Guardando reserva...");
            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: "reserva guardada",
            });
          }
          else if (toolCall.function.name === "consulta_reservas_confirmadas") {
            const events = [];
            if (argumentsObj.employee_name) { // Get events for specific employee
              const employee = busi.employees.find((employee) => employee.name === argumentsObj.employee_name);
              if (employee) {
                events.push({
                  employee_name: employee.name,
                  events: await calendar.getEvents(employee.calendarId, argumentsObj.start_time, argumentsObj.end_time)
                });
              }
            } else {
              for (const employee of busi.employees) { // Get events for all employees
                events.push({
                  employee_name: employee.name,
                  events: await calendar.getEvents(employee.calendarId, argumentsObj.start_time, argumentsObj.end_time)
                });
              }
            }
            console.log("events", JSON.stringify(events, 2, null));

            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: JSON.stringify(events),
            });
          }
        }

        console.log("Tool outputs:", toolOutputs);

        await openai.beta.threads.runs.submitToolOutputs(threadId, run.id, {
          tool_outputs: toolOutputs,
        });
      }

      if (runStatus.status === "completed") {
        const messages = await openai.beta.threads.messages.list(threadId);
        console.log(JSON.stringify(messages.data[0], null, 2));
        responseMessage = messages.data[0].content[0].text.value;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log(`Mensaje para ${clientNumber}: ${responseMessage}`);

    return responseMessage;

  } catch (error) {
    console.error("Error al conectar con ChatGPT:", error);
    return "Lo siento, hubo un error al procesar tu mensaje.";
  }
};

module.exports = { getAIResponse };