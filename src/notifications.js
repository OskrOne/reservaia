const whatsapp = require('./whatsapp');

const handler = async (event) => {
    for (const record of event.Records) {
        try {
            const appointment = JSON.parse(record.body);

            const message = '📅 Cita confirmada:\n\n' +
                `*Servicio*: ${appointment.service}\n` +
                `*Cliente*: ${appointment.clientName}\n` +
                `*Teléfono del cliente*: ${appointment.clientNumber.replace("whatsapp:", "")}\n` +
                `*Fecha y hora*: ${new Date(appointment.appointmentTime).toLocaleString('es-MX', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                    timeZone: 'America/Mexico_City'
                })}`;

            await whatsapp.sendMessage(appointment.assistantNumber, appointment.notificationNumber, message);

            console.log(`Notification sent to ${appointment.notificationNumber}`);
        } catch (error) {
            console.error('Failed to process appointment notification:', error);
        }
    }

    return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Notifications processed' }),
    };
};

module.exports = { handler };
