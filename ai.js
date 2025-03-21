const { OpenAI } = require('openai');
const threads = require('./threads');
const calendar = require('./calendar');
const businesses = require('./businesses');
const moment = require("moment-timezone");
moment.tz.setDefault("America/Mexico_City"); // This is not right, we should manage any timezone

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const assistantId = process.env.ASSISTANT_ID;

const getAIResponse = async (to, from, body) => {
  try {

    // Get or create threadID
    let threadId = await threads.getThreadId(to, from);
    if (!threadId) {
      const thread = await openai.beta.threads.create();
      await threads.createThreadId(to, from, thread.id);
      threadId = thread.id;
    }

    console.log("Thread ID:", threadId);
    await openai.beta.threads.messages.create(threadId,
      {
        role: "assistant",
        content: "Hoy es" + moment(),
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
      assistant_id: assistantId,
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
            const business = await businesses.getBusinessByPhone(to);
            await calendar.createEvent(business.calendarId.S, argumentsObj);
            console.log(JSON.stringify(toolCall, 2, null));
            console.log("Guardando reserva...");
            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: "reserva guardada",
            });
          }
          else if (toolCall.function.name === "consulta_espacios_disponibles") {
            const argumentsObj = JSON.parse(toolCall.function.arguments);
            const business = await businesses.getBusinessByPhone(to);
            const availableSpots = await calendar.getAvailableSlots(business.calendarId.S, argumentsObj.event_duration, argumentsObj.start_time, argumentsObj.end_time);
            console.log(JSON.stringify(toolCall, 2, null));
            console.log("Consultando espacios disponibles...");
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

    console.log(`Mensaje para ${from}: ${responseMessage}`);

    return responseMessage;

  } catch (error) {
    console.error("Error al conectar con ChatGPT:", error);
    return "Lo siento, hubo un error al procesar tu mensaje.";
  }
};

module.exports = { getAIResponse };