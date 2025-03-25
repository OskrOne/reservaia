const { OpenAI } = require('openai');
const threads = require('./threads');
const calendar = require('./calendar');
const businesses = require('./businesses');
const moment = require("moment-timezone");
moment.tz.setDefault("America/Mexico_City"); // This is not right, we should manage any timezone
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ASSISTANT_ID = process.env.ASSISTANT_ID;
const QUEUE_URL = process.env.APPOINTMENT_CONFIRMED_QUEUE_URL;

const sendNotification = async (notificationNumber, clientNumber, clientName, service, appointmentTime) => {
  const sqsClient = new SQSClient();

  const params = {
    QueueUrl: QUEUE_URL,
    MessageBody: JSON.stringify({
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
          if (toolCall.function.name === "guardar_reserva") {
            const argumentsObj = JSON.parse(toolCall.function.arguments);

            // Getting business by phone
            const business = await businesses.getBusinessByPhone(assistantNumber);

            // Creating event in Google Calendar
            await calendar.createEvent(business.calendarId.S, argumentsObj);

            // Sending notification
            console.log("Enviando notificación...", argumentsObj);
            await sendNotification(business.notificationsNumber.S, clientNumber, argumentsObj.clientName, argumentsObj.summary, argumentsObj.start.dateTime);
            
            console.log(JSON.stringify(toolCall, 2, null));
            console.log("Guardando reserva...");
            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: "reserva guardada",
            });
          }
          else if (toolCall.function.name === "consulta_espacios_disponibles") {
            const argumentsObj = JSON.parse(toolCall.function.arguments);
            const business = await businesses.getBusinessByPhone(assistantNumber);
            const availableSpots = await calendar.getAvailableSlots(business.calendarId.S, argumentsObj.event_duration, argumentsObj.start_time, argumentsObj.end_time);
            console.log(JSON.stringify(toolCall, 2, null));
            console.log(JSON.stringify(availableSpots, 2, null));
            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: JSON.stringify(availableSpots),
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