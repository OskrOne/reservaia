const { OpenAI } = require('openai');
const { getThreadId, createThreadId } = require('./threads');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const assistantId = process.env.ASSISTANT_ID;

const getAIResponse = async (to, from, body) => {
    try {

        // Get or create threadID
        let threadId = await getThreadId(to, from);
        if(!threadId) {
            const thread = await openai.beta.threads.create();
            await createThreadId(to, from, thread.id);
            threadId = thread.id;
        }

        console.log("Thread ID:", threadId);

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

            console.log("Aqui voy", runStatus);

            if (runStatus.status === "requires_action") {
                console.log(runStatus.required_action.submit_tool_outputs, null, 2);
                for(let toolCall of runStatus.required_action.submit_tool_outputs.tool_calls) {
                    if (toolCall.function.name === "guardar_reserva") {
                        console.log(toolCall.function.arguments);
                    }
                }
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