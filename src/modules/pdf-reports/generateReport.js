// Importar las dependencias necesarias
const admin = require('firebase-admin');
const PDFDocument = require('pdfkit');
const { format, isWithinInterval } = require('date-fns'); // parseISO ya no es necesario para Timestamps directamente
const { es } = require('date-fns/locale'); // Importa el locale español para date-fns

// Inicializar Firebase Admin SDK si aún no se ha hecho
// Es crucial asegurarse de que esto se haga solo una vez en tu aplicación principal (ej. en index.js de functions)
// Si ya lo inicializas en functions/index.js, puedes omitir esta línea o asegurarte de que solo se llame una vez.
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Genera un informe PDF de servicios extraordinarios.
 * @param {string} agentId - El ID del agente para filtrar los servicios.
 * @param {string} [startDateStr] - Fecha de inicio del rango (opcional, formato ISO 8601: 'YYYY-MM-DD').
 * @param {string} [endDateStr] - Fecha de fin del rango (opcional, formato ISO 8601: 'YYYY-MM-DD').
 * @returns {Promise<Buffer>} Un Promise que resuelve con el Buffer del PDF generado.
 */
async function generateExtraordinaryServicesPdfReport(agentId, startDateStr, endDateStr) {
  return new Promise(async (resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
    });

    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      resolve(Buffer.concat(buffers));
    });
    doc.on('error', reject);

    try {
      // 1. Obtener los datos del agente desde la colección 'agents'
      let agentName = 'Agente Desconocido';
      const agentDoc = await db.collection('agents').doc(agentId).get(); //

      if (agentDoc.exists) {
        const agentData = agentDoc.data();
        agentName = agentData.name || `Agente ID: ${agentId}`; // Asumiendo que el nombre está en campo 'name'
      }

      // 2. Obtener los servicios extraordinarios
      let servicesQuery = db.collection('extraordinaryServices').where('agentId', '==', agentId);
      const servicesSnapshot = await servicesQuery.get();
      let services = servicesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      // 3. Filtrar por rango de fechas si se proporcionan
      let startDate, endDate;
      if (startDateStr && endDateStr) {
        // parseISO sigue siendo útil si el input es un string ISO 8601
        startDate = new Date(startDateStr + 'T00:00:00Z'); // Asegurarse de que sea al inicio del día
        endDate = new Date(endDateStr + 'T23:59:59Z'); // Asegurarse de que sea al final del día

        services = services.filter((service) => {
          // Convertir Firestore Timestamp a Date para date-fns
          const serviceDate = service.date.toDate();
          return isWithinInterval(serviceDate, { start: startDate, end: endDate });
        });
      }

      // 4. Ordenar los servicios por fecha para una mejor presentación
      // Convertir Firestore Timestamp a Date para la comparación
      services.sort((a, b) => a.date.toDate().getTime() - b.date.toDate().getTime());

      // --- Generación del Contenido del PDF ---

      doc.fontSize(20).text('Informe de Servicios Extraordinarios', { align: 'center' });
      doc.moveDown();

      doc.fontSize(12).text(`Agente Responsable: ${agentName}`);
      let periodoTexto = 'Todo el periodo registrado';
      if (startDateStr && endDateStr) {
        periodoTexto = `del ${format(startDate, 'dd/MM/yyyy', { locale: es })} al ${format(endDate, 'dd/MM/yyyy', { locale: es })}`;
      }
      doc.text(`Periodo del Informe: ${periodoTexto}`);
      doc.moveDown();

      // Cabeceras de la tabla
      doc
        .font('Helvetica-Bold')
        .text('Fecha', 50, doc.y, { width: 100, align: 'left' })
        .text('Tipo de Servicio', 150, doc.y, { width: 150, align: 'left' })
        .text('Horas', 300, doc.y, { width: 70, align: 'left' })
        .text('Precio/Hora', 370, doc.y, { width: 80, align: 'right' })
        .text('Total €', 450, doc.y, { width: 80, align: 'right' });
      doc.moveDown(0.5);
      doc.strokeColor('#aaaaaa').lineWidth(0.5).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      let totalAcumuladoPeriodo = 0;

      // Contenido de la tabla
      doc.font('Helvetica');
      services.forEach((service) => {
        // Convertir Firestore Timestamp a Date para formatear
        const serviceDate = service.date.toDate();
        const serviceDateFormatted = format(serviceDate, 'dd/MM/yyyy HH:mm', { locale: es });
        const serviceTotal = service.price * service.hours; // Calcular el total por servicio
        totalAcumuladoPeriodo += serviceTotal;

        doc
          .text(serviceDateFormatted, 50, doc.y, { width: 100, align: 'left' })
          .text(service.type, 150, doc.y, { width: 150, align: 'left' })
          .text(service.hours.toString(), 300, doc.y, { width: 70, align: 'left' })
          .text(service.price.toFixed(2), 370, doc.y, { width: 80, align: 'right' })
          .text(serviceTotal.toFixed(2), 450, doc.y, { width: 80, align: 'right' });
        doc.moveDown(0.5);
      });

      doc.moveDown();
      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .text(`Total Acumulado del Periodo: ${totalAcumuladoPeriodo.toFixed(2)} €`, {
          align: 'right',
        });

      doc.end();
    } catch (error) {
      console.error('Error generating PDF report:', error);
      reject(error);
    }
  });
}

module.exports = {
  generateExtraordinaryServicesPdfReport,
};
