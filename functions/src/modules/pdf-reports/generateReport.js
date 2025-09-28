// Importar las dependencias necesarias
const admin = require('firebase-admin');
const PDFDocument = require('pdfkit');
const { format, parseISO, isWithinInterval } = require('date-fns');
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
 * @param {string} [startDate] - Fecha de inicio del rango (opcional, formato ISO 8601: 'YYYY-MM-DD').
 * @param {string} [endDate] - Fecha de fin del rango (opcional, formato ISO 8601: 'YYYY-MM-DD').
 * @returns {Promise<Buffer>} Un Promise que resuelve con el Buffer del PDF generado.
 */
async function generateExtraordinaryServicesPdfReport(agentId, startDate, endDate) {
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
      // 1. Obtener los datos del agente
      let agentName = 'Agente Desconocido';
      const agentRef = db.collection('users').where('agentId', '==', agentId); // Asumiendo que 'agentId' en 'users' es el campo correcto
      const agentSnapshot = await agentRef.get();

      if (!agentSnapshot.empty) {
        // Asumimos que el primer documento es el correcto, o ajustamos si hay múltiples
        const agentData = agentSnapshot.docs[0].data();
        // Asumiendo que el nombre completo está en un campo 'name' o 'fullName'
        agentName = agentData.name || agentData.fullName || `Agente ID: ${agentId}`;
      }

      // 2. Obtener los servicios extraordinarios
      let servicesQuery = db.collection('extraordinaryServices').where('agentId', '==', agentId);
      const servicesSnapshot = await servicesQuery.get();
      let services = servicesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      // 3. Filtrar por rango de fechas si se proporcionan
      if (startDate && endDate) {
        const start = parseISO(startDate);
        const end = parseISO(endDate);

        services = services.filter((service) => {
          // Asegúrate de que service.date sea parseable. Tu imagen muestra 'date' como string.
          // parseISO puede manejar 'YYYY-MM-DD' o 'YYYY-MM-DDTHH:mm:ss.SSSZ'
          const serviceDate = parseISO(service.date);
          return isWithinInterval(serviceDate, { start, end });
        });
      }

      // 4. Ordenar los servicios por fecha para una mejor presentación
      services.sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());

      // --- Generación del Contenido del PDF ---

      doc.fontSize(20).text('Informe de Servicios Extraordinarios', { align: 'center' });
      doc.moveDown();

      doc.fontSize(12).text(`Agente Responsable: ${agentName}`);
      doc.text(
        `Periodo del Informe: ${startDate ? format(parseISO(startDate), 'dd/MM/yyyy', { locale: es }) : 'Inicio'} al ${endDate ? format(parseISO(endDate), 'dd/MM/yyyy', { locale: es }) : 'Fin'}`
      );
      doc.moveDown();

      // Cabeceras de la tabla
      doc
        .font('Helvetica-Bold')
        .text('Fecha', 50, doc.y, { width: 100, align: 'left' })
        .text('Tipo de Servicio', 150, doc.y, { width: 150, align: 'left' })
        .text('Horas', 300, doc.y, { width: 70, align: 'left' })
        .text('Precio', 370, doc.y, { width: 80, align: 'right' })
        .text('Total', 450, doc.y, { width: 80, align: 'right' }); // Agregamos columna para el total por servicio
      doc.moveDown(0.5);
      doc.strokeColor('#aaaaaa').lineWidth(0.5).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      let totalAcumuladoPeriodo = 0;

      // Contenido de la tabla
      doc.font('Helvetica');
      services.forEach((service) => {
        const serviceDateFormatted = format(parseISO(service.date), 'dd/MM/yyyy HH:mm', {
          locale: es,
        });
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
        .text(`Total Acumulado del Periodo: ${totalAcumuladoPeriodo.toFixed(2)}`, {
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
