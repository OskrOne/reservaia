const moment = require("moment-timezone");

const transformEvent = (event) => {
  // Convertir la fecha al formato correcto y establecer zona horaria
  const startTime = moment(event.start).tz("America/Mexico_City");
  const endTime = moment(event.end).tz("America/Mexico_City");

  // Obtener el día en español
  const fecha = startTime.toDate().toLocaleDateString("es-MX");

  // Formatear la hora en 12 horas con AM/PM
  const startHour = startTime.format("h:mm A");
  const endHour = endTime.format("h:mm A");

  return { fecha, horario: `${startHour} - ${endHour}` };
};

module.exports = { transformEvent };
