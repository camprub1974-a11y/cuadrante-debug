// Archivo: functions/index.js
// Plantilla con patrón de inicialización perezosa y dinámica
// VERSIÓN COMPLETA Y CORREGIDA (21/07/2025) - Con geolocalización en checklist

// --- Dependencias Ligeras (se mantienen estáticas) ---

import functions from 'firebase-functions';
import admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import {
  format,
  parseISO,
  addDays,
  startOfMonth,
  endOfMonth,
  subMonths,
  isSameMonth,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { toZonedTime, formatInTimeZone } from 'date-fns-tz';
import { Storage } from '@google-cloud/storage';
import { defineSecret } from 'firebase-functions/params';
import puppeteer from 'puppeteer';
import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';

const BREVO_USER = defineSecret('BREVO_USER');
const BREVO_PASS = defineSecret('BREVO_PASS');
const AGENT_SENIORITY_ORDER = ['4684', '4687', '5281', '5605', '8498'];

// (Asegúrate de que esta constante esté definida al principio de tu archivo)
const documentTypePrefixes = {
  // Documentos de Salida
  informe: 'I', acta: 'A', atestado: 'AT', oficio: 'O', estadillo: 'E',
  // Documentos de Entrada
  oficio_judicial: 'OJ', req_administracion: 'RA', sol_aseguradora: 'SA',
  instancia_general: 'IG', comunicacion_interna: 'CI',
};

if (!admin.apps.length) {
  admin.initializeApp();
}

let db;
const getDb = () => {
  if (!db) db = admin.firestore();
  return db;
};

let storage;
const getStorage = () => {
  if (!storage) storage = new Storage();
  return storage;
};

const MADRID_TIMEZONE = 'Europe/Madrid';
const BUCKET_NAME = admin.app().options.storageBucket;
const LOGO_PATH_IN_STORAGE = 'logo-ayto.png';
const EXTRA_SERVICE_TYPES = {
  diurno: { name: 'Diurno', price: 25 },
  nocturno: { name: 'Nocturno', price: 32 },
  festivo: { name: 'Festivo', price: 35 },
  festivo_nocturno: { name: 'Festivo Nocturno', price: 38 },
};

// --- Funciones de utilidad ---

async function getAgentNameById(agentId) {
  if (!agentId) return '';
  // Llama a getDb() para asegurar que la instancia de la base de datos está inicializada
  const agentDoc = await getDb().collection('agents').doc(String(agentId)).get();
  return agentDoc.exists ? agentDoc.data().name : `ID ${agentId}`;
}

function unescapeHtml(safe) {
  if (!safe) return '';
  return safe.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
}

function getDateStringInMadridTimezone(dateObj) {
  return formatInTimeZone(dateObj, MADRID_TIMEZONE, 'yyyy-MM-dd', { locale: es });
}

function getMonthNameInMadridTimezone(dateObj) {
  return formatInTimeZone(dateObj, MADRID_TIMEZONE, 'MMMM', { locale: es }).toLowerCase();
}

async function downloadLogoFromStorage() {
  try {
    const bucket = getStorage().bucket(BUCKET_NAME);
    const file = bucket.file(LOGO_PATH_IN_STORAGE);
    const [exists] = await file.exists();
    if (!exists) {
      logger.error(`El archivo '${LOGO_PATH_IN_STORAGE}' no existe en el bucket: ${BUCKET_NAME}`);
      return null;
    }
    const [logoBuffer] = await file.download();
    return logoBuffer;
  } catch (error) {
    logger.error('Error al descargar el logo:', error);
    return null;
  }
}

// --- REGISTRO DE HELPERS DE HANDLEBARS ---
// Esto le enseña a Handlebars a entender {{#if}}, {{#each}}, etc.

Handlebars.registerHelper('if', function(conditional, options) {
  if (conditional) {
    return options.fn(this);
  } else {
    return options.inverse(this);
  }
});

Handlebars.registerHelper('unless', function(conditional, options) {
    if (!conditional) {
        return options.fn(this);
    } else {
        return options.inverse(this);
    }
});

Handlebars.registerHelper('each', function(context, options) {
  let ret = "";
  if (context && context.length > 0) {
    for (let i = 0; i < context.length; i++) {
      ret = ret + options.fn(context[i], { data: { index: i } });
    }
  }
  return ret;
});

Handlebars.registerHelper('inc', function(value) {
    return parseInt(value, 10) + 1;
});

function safeConvertToDate(dateValue, docId) {
  if (!dateValue) return null;
  if (typeof dateValue.toDate === 'function') return dateValue.toDate();
  if (typeof dateValue === 'string') {
    try {
      const parsedDate = parseISO(dateValue);
      if (!isNaN(parsedDate)) return parsedDate;
    } catch (e) {
      /* Ignorar */
    }
  }
  logger.error(`Documento ${docId} tiene un formato de fecha inválido.`, dateValue);
  return null;
}

async function updateScheduleForPermissionRequest(solicitudId) {
  const solicitudDoc = await getDb().collection('solicitudes').doc(solicitudId).get();
  if (!solicitudDoc.exists) return;
  const solicitudData = solicitudDoc.data();
  const permissionTypeDoc = await getDb()
    .collection('permissionTypes')
    .doc(solicitudData.typeId)
    .get();
  if (!permissionTypeDoc.exists) return;
  const initialQuadrantSymbol = permissionTypeDoc.data().initial_quadrant;
  const agentId = String(solicitudData.agentId);
  let currentDay = solicitudData.startDate.toDate();
  const endDate = solicitudData.endDate.toDate();
  while (currentDay <= endDate) {
    const dateString = getDateStringInMadridTimezone(currentDay);
    const scheduleId = `cuadrante_${getMonthNameInMadridTimezone(currentDay)}_${formatInTimeZone(currentDay, MADRID_TIMEZONE, 'yyyy')}`;
    const scheduleRef = getDb().collection('schedules').doc(scheduleId);
    try {
      const scheduleDoc = await scheduleRef.get();
      if (!scheduleDoc.exists) {
        logger.warn(`Documento de cuadrante ${scheduleId} no existe al intentar actualizar.`);
        return;
      }
      const scheduleData = scheduleDoc.data();
      for (const weekKey in scheduleData.weeks) {
        for (const dayKey in scheduleData.weeks[weekKey].days) {
          if (scheduleData.weeks[weekKey].days[dayKey]?.date === dateString) {
            const shifts = scheduleData.weeks[weekKey].days[dayKey].shifts || {};
            const shiftKeyToUpdate = Object.keys(shifts).find(
              (key) => String(shifts[key].agentId) === agentId
            );
            const updatePath = `weeks.${weekKey}.days.${dayKey}.shifts.${shiftKeyToUpdate || `solicitud_${Date.now()}`}`;
            await scheduleRef.update({
              [updatePath]: { agentId: agentId, shiftType: initialQuadrantSymbol },
            });
          }
        }
      }
    } catch (error) {
      logger.error(`Error al actualizar cuadrante ${scheduleId}:`, error);
    }
    currentDay = addDays(currentDay, 1);
  }
}

async function findAndReplaceShiftInSchedule(dateObj, agentIdToUpdate, newShiftType) {
  if (!(dateObj instanceof Date) || isNaN(dateObj)) return;
  const dateString = getDateStringInMadridTimezone(dateObj);
  const scheduleId = `cuadrante_${getMonthNameInMadridTimezone(dateObj)}_${formatInTimeZone(dateObj, MADRID_TIMEZONE, 'yyyy')}`;
  const scheduleRef = getDb().collection('schedules').doc(scheduleId);
  try {
    const scheduleDoc = await scheduleRef.get();
    if (!scheduleDoc.exists) {
      logger.warn(
        `Documento de cuadrante ${scheduleId} no existe al intentar encontrar y reemplazar turno.`
      );
      return;
    }
    const scheduleData = scheduleDoc.data();
    for (const weekKey in scheduleData.weeks) {
      for (const dayKey in scheduleData.weeks[weekKey].days) {
        if (scheduleData.weeks[weekKey].days[dayKey]?.date === dateString) {
          const shifts = scheduleData.weeks[weekKey].days[dayKey].shifts || {};
          const shiftKey = Object.keys(shifts).find(
            (k) => String(shifts[k].agentId) === String(agentIdToUpdate)
          );
          if (newShiftType === 'N') continue;
          const updatePath = `weeks.${weekKey}.days.${dayKey}.shifts.${shiftKey || `agente_${Date.now()}`}`;
          await scheduleRef.update({
            [updatePath]: { agentId: String(agentIdToUpdate), shiftType: newShiftType },
          });
          return;
        }
      }
    }
  } catch (error) {
    logger.error(`Error al actualizar turno en ${scheduleId}:`, error);
  }
}

// [SOLUCIÓN] 'PDFDocument' se importa dinámicamente aquí
// Pega este bloque completo en tu functions/index.js, reemplazando la función existente.
async function generateReportPdfContent(reportData, logoBuffer, userRole = 'guard') {
  const PDFDocument = (await import('pdfkit')).default;

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const PADDING = 30;
      const X_START = PADDING;
      const FONT_NORMAL = 'Helvetica';
      const FONT_BOLD = 'Helvetica-Bold';
      
      const { servicesByAgent, periodStartDateObj, periodEndDateObj } = reportData;

      let headerY = doc.y;
      if (logoBuffer) doc.image(logoBuffer, X_START, headerY, { width: 70 });
      doc.font(FONT_BOLD).fontSize(10).text('JEFATURA DE POLICIA LOCAL', X_START + 80, headerY + 10);
      doc.font(FONT_NORMAL).fontSize(8).text('e-mail: policialocal@chauchina.es', X_START + 80, headerY + 25);
      doc.text('Fax: 958 45 51 21', X_START + 80, headerY + 35);
      doc.y = Math.max(headerY + 70, doc.y);
      
      const monthNameStart = formatInTimeZone(periodStartDateObj, MADRID_TIMEZONE, 'MMMM', { locale: es });
      const monthNameEnd = formatInTimeZone(periodEndDateObj, MADRID_TIMEZONE, 'MMMM', { locale: es });
      const yearStart = formatInTimeZone(periodStartDateObj, MADRID_TIMEZONE, 'yyyy');
      const yearEnd = formatInTimeZone(periodEndDateObj, MADRID_TIMEZONE, 'yyyy');
      
      let asuntoText = ` Remuneración servicios extraordinarios `;
      if (isSameMonth(periodStartDateObj, periodEndDateObj) && yearStart === yearEnd) {
        asuntoText += `${monthNameStart} ${yearStart}`;
      } else {
        asuntoText += `${monthNameStart}-${monthNameEnd} ${yearStart}`;
      }
      
      doc.font(FONT_BOLD).fontSize(10).text('Asunto:', X_START, doc.y, { continued: true }).font(FONT_NORMAL).text(asuntoText);
      doc.moveDown(0.5);
      doc.font(FONT_BOLD).fontSize(10).text('Destinatario:', X_START, doc.y, { continued: true }).font(FONT_NORMAL).text(' Recursos humanos');
      doc.moveDown(1);
      
      const introTextEndDate = formatInTimeZone(periodEndDateObj, MADRID_TIMEZONE, "dd 'de' MMMM 'de' yyyy", { locale: es });
      doc.font(FONT_NORMAL).fontSize(10).text(
          `Por medio del presente oficio, se comunican los servicios extraordinarios realizados por policías de esta Jefatura de Policía Local en funciones de seguridad ciudadana y tráfico hasta el ${introTextEndDate}.`,
          { align: 'justify' }
      ).moveDown(1.5);
      
      doc.font(FONT_BOLD).fontSize(10).text('Descripción de servicios extraordinarios', { underline: true }).moveDown();

      const col1X = X_START;       const col1Width = 80;
      const col2X = col1X + col1Width + 10; const col2Width = 230;
      const col3X = col2X + col2Width + 10; const col3Width = 100;
      const col4X = col3X + col3Width + 10; const col4Width = 50;

      function drawTableHeader() {
        doc.font(FONT_BOLD).fontSize(9);
        doc.text('DÍA', col1X, doc.y, { width: col1Width });
        doc.text('EVENTO', col2X, doc.y, { width: col2Width });
        doc.text('MODALIDAD', col3X, doc.y, { width: col3Width });
        doc.text('TOTAL', col4X, doc.y, { width: col4Width, align: 'right' });
        doc.moveDown(0.5);
        doc.lineWidth(0.5).moveTo(X_START, doc.y).lineTo(doc.page.width - PADDING, doc.y).stroke().moveDown(0.5);
      }
      
      function drawTableRow(row) {
          const evento = row.notes && row.notes.trim() !== '' ? row.notes : 'Servicio sin descripción';
          const rowHeight = doc.heightOfString(evento, { width: col2Width }) + 10;

          if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
              doc.addPage();
              drawTableHeader();
          }
          
          const y = doc.y;
          doc.font(FONT_NORMAL).fontSize(9);
          doc.text(formatInTimeZone(row.dateObj, MADRID_TIMEZONE, 'dd/MM/yyyy'), col1X, y, { width: col1Width });
          doc.text(evento, col2X, y, { width: col2Width });
          doc.text(EXTRA_SERVICE_TYPES[row.type]?.name || row.type, col3X, y, { width: col3Width });
          doc.text(String(row.hours), col4X, y, { width: col4Width, align: 'right' });
          doc.y += rowHeight;
      }
      
      const sortedAgentIds = Object.keys(servicesByAgent).sort();

      for (const agentId of sortedAgentIds) {
        const agentData = servicesByAgent[agentId];
        if (!agentData || agentData.services.length === 0) continue;
        const agentTotalHoursByType = { diurno: 0, nocturno: 0, festivo: 0, festivo_nocturno: 0 };
        if (doc.y > doc.page.height - 150) doc.addPage();
        doc.font(FONT_BOLD).fontSize(10).text(`AGENTE Y T.I.P: ${agentData.name} (${agentId})`).moveDown(0.5);
        drawTableHeader();
        const validServices = agentData.services
            .map(s => ({ ...s, dateObj: safeConvertToDate(s.date, s.id) }))
            .filter(s => s.dateObj)
            .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
        validServices.forEach(service => {
          if (agentTotalHoursByType.hasOwnProperty(service.type)) {
            agentTotalHoursByType[service.type] += service.hours || 0;
          }
          drawTableRow(service);
        });
        const totalAgentHours = validServices.reduce((sum, s) => sum + (s.hours || 0), 0);
        if (totalAgentHours > 0) {
            doc.moveDown(0.5);
            doc.lineWidth(0.5).moveTo(col4X, doc.y).lineTo(col4X + col4Width, doc.y).stroke().moveDown(0.5);
            doc.font(FONT_BOLD).fontSize(10).text(String(totalAgentHours), col4X, doc.y, { width: col4Width, align: 'right' });
        }
        if (doc.y > doc.page.height - 100) doc.addPage();
        doc.moveDown(1.5);
        const summaryY = doc.y;
        doc.font(FONT_BOLD).fontSize(10).text('Desglose Horas por Modalidad:', X_START, summaryY, { underline: true });
        const summaryTableTop = summaryY + 25;
        const summaryColWidth = 120;
        doc.font(FONT_BOLD).fontSize(9);
        doc.text('Ordinarias Diurnas', X_START, summaryTableTop);
        doc.text('Ordinarias Nocturnas', X_START + summaryColWidth, summaryTableTop);
        doc.text('Festivas Diurnas', X_START + summaryColWidth * 2, summaryTableTop);
        doc.text('Festivas Nocturnas', X_START + summaryColWidth * 3, summaryTableTop);
        doc.font(FONT_NORMAL).fontSize(10);
        doc.text(String(agentTotalHoursByType.diurno), X_START, summaryTableTop + 15, { width: summaryColWidth });
        doc.text(String(agentTotalHoursByType.nocturno), X_START + summaryColWidth, summaryTableTop + 15, { width: summaryColWidth });
        doc.text(String(agentTotalHoursByType.festivo), X_START + summaryColWidth * 2, summaryTableTop + 15, { width: summaryColWidth });
        doc.text(String(agentTotalHoursByType.festivo_nocturno), X_START + summaryColWidth * 3, summaryTableTop + 15, { width: summaryColWidth });
        doc.moveDown(3);
      }

      if (doc.y > doc.page.height - 180) doc.addPage();
      doc.font(FONT_NORMAL).fontSize(10).text(`Lo que se extiende para su conocimiento y efectos oportunos.`, X_START, doc.y, { align: 'left' }).moveDown(2);
      if (userRole === 'admin') {
         const col1SignatureX = X_START + 50;
         const col2SignatureX = doc.page.width / 2 + 50;
         const colSignatureWidth = (doc.page.width - 2 * PADDING) / 2 - 50;
         let currentSignatureY = doc.y;
         doc.font(FONT_BOLD).fontSize(10).text('V.B°. ALCALDIA', col1SignatureX, currentSignatureY, { width: colSignatureWidth, align: 'left' });
         doc.font(FONT_NORMAL).fontSize(10).text('Jesús Fernández', col1SignatureX, doc.y + 15, { width: colSignatureWidth, align: 'left' });
         doc.text('Moreno', col1SignatureX, doc.y + 12, { width: colSignatureWidth, align: 'left' });
         doc.y = currentSignatureY;
         doc.font(FONT_BOLD).fontSize(10).text('Oficial de Policía Local', col2SignatureX, currentSignatureY, { width: colSignatureWidth, align: 'right' });
         doc.font(FONT_NORMAL).fontSize(9).text('TIP 4684', col2SignatureX, doc.y + 15, { width: colSignatureWidth, align: 'right' });
      } else {
         const agentId = sortedAgentIds[0];
         const agentData = servicesByAgent[agentId];
         doc.font(FONT_BOLD).fontSize(10).text('El Agente,', X_START, doc.y);
         doc.font(FONT_NORMAL).fontSize(10).text(`${agentData.name} (T.I.P: ${agentId})`, X_START, doc.y + 15);
      }

      doc.end();
    } catch (error) {
      logger.error('Error catastrófico durante la generación del PDF:', error);
      reject(error);
    }
  });
}


// =========================================================================================
// === COMIENZO DE NUEVAS FUNCIONES PARA ÓRDENES Y PARTES DE SERVICIO ===
// =========================================================================================
export const createServiceOrder = onCall({ region: 'us-central1' }, async (request) => {
  if (request.auth?.token?.role !== 'admin' && request.auth?.token?.role !== 'supervisor') {
    throw new HttpsError(
      'permission-denied',
      'Solo los mandos o administradores pueden crear órdenes de servicio.'
    );
  }

  const { title, service_date, service_shift, description, checklist } = request.data;
  if (!title || !service_date || !service_shift) {
    throw new HttpsError(
      'invalid-argument',
      "Los campos 'título', 'fecha de servicio' y 'turno' son requeridos."
    );
  }

  try {
    const db = getDb();
    const serviceDateObject = parseISO(service_date); // Convierte el string 'YYYY-MM-DD' a un objeto Date

    // ✅ PASO 1: Llamamos a la función de ayuda para generar el número de registro.
    const regNumber = await generateNextRegNumber(db, serviceDateObject);

    // ✅ PASO 2: Añadimos el 'order_reg_number' al objeto que vamos a guardar.
    const newOrder = {
      title,
      service_date: admin.firestore.Timestamp.fromDate(serviceDateObject),
      service_shift,
      description: description || '',
      checklist: Array.isArray(checklist) ? checklist : [],
      order_reg_number: regNumber, // Se añade el número aquí
      status: 'draft',
      created_by_user_id: request.auth.uid,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      assigned_agents: [],
    };

    const docRef = await db.collection('serviceOrders').add(newOrder);
    return { success: true, message: 'Orden de servicio creada con éxito.', orderId: docRef.id };
  } catch (error) {
    logger.error('Error al crear la orden de servicio:', error);
    throw new HttpsError('internal', 'No se pudo crear la orden de servicio.');
  }
});

/**
 * Genera el siguiente número de registro correlativo para una orden de servicio
 * dentro de un mes y año específicos. Formato: XXX/MM/YYYY
 */
export const generateNextOrderNumber = onCall({ region: 'us-central1' }, async (request) => {
  if (request.auth?.token?.role !== 'admin' && request.auth?.token?.role !== 'supervisor') {
    throw new HttpsError('permission-denied', 'Acceso denegado.');
  }

  const { service_date } = request.data;
  if (!service_date) {
    throw new HttpsError('invalid-argument', 'Se requiere la fecha del servicio.');
  }

  // ✅ Se añade el bloque 'try' que faltaba aquí
  try {
    const date = new Date(service_date);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const prefix = `/${month}/${year}`;

    const db = getDb();
    const ordersRef = db.collection('serviceOrders');

    const q = ordersRef
      .where('order_reg_number', '>=', `000${prefix}`)
      .where('order_reg_number', '<=', `999${prefix}`)
      .orderBy('order_reg_number', 'desc')
      .limit(1);

    const querySnapshot = await q.get();
    let nextNumber = 1;

    if (!querySnapshot.empty) {
      const lastOrder = querySnapshot.docs[0].data();
      const lastNumber = parseInt(lastOrder.order_reg_number.split('/')[0], 10);
      nextNumber = lastNumber + 1;
    }

    const formattedNumber = `${String(nextNumber).padStart(3, '0')}${prefix}`;
    return { success: true, order_reg_number: formattedNumber };
  } catch (error) {
    // Este bloque 'catch' ahora es válido
    logger.error('Error generando el número de orden:', error);
    throw new HttpsError('internal', 'No se pudo generar el número de registro.');
  }
});

// =================================================================
// === ✅ NUEVAS FUNCIONES DEL AGENTE IA AUTOMÁTICO ===
// =================================================================

/**
 * AGENTE AUTOMÁTICO DE MAÑANA: Se ejecuta todos los días a las 08:00.
 * Si la función está activada, hay un turno de mañana y no se ha creado una orden,
 * la genera y asigna automáticamente.
 */
// REEMPLAZA TU FUNCIÓN autoGenerateMorningOrder CON ESTA VERSIÓN
export const autoGenerateMorningOrder = onSchedule(
  {
    schedule: 'every day 08:00',
    timeZone: 'Europe/Madrid',
  },
  async (event) => {
    // --- INICIO DE LA CORRECCIÓN ---
    const db = getDb(); // Se añade esta línea para obtener la conexión a la base de datos.
    // --- FIN DE LA CORRECCIÓN ---

    const configDoc = await db.collection('configuration').doc('automation').get();
    if (!configDoc.exists || configDoc.data().autoGenerateOrders !== true) {
      logger.info('La generación automática de órdenes está desactivada.');
      return null;
    }
    try {
      await processAutoGeneration(db, new Date(), 'Mañana', false);
    } catch (error) {
      logger.error('Error en la función autoGenerateMorningOrder:', error.message);
    }
    return null;
  }
);

/**
 * AGENTE AUTOMÁTICO DE TARDE: Se ejecuta todos los días a las 18:00.
 */
export const autoGenerateAfternoonOrder = onSchedule(
  {
    schedule: 'every day 18:00',
    timeZone: 'Europe/Madrid',
  },
  async (event) => {
    // Se mantiene la conexión a la base de datos para asegurar robustez.
    const db = getDb();
    const configDoc = await db.collection('configuration').doc('automation').get();
    if (!configDoc.exists || configDoc.data().autoGenerateOrders !== true) {
      logger.info(
        'La generación automática de órdenes está desactivada. No se tomará ninguna acción.'
      );
      return null;
    }

    const today = new Date();
    const shiftType = 'Tarde';

    try {
      await processAutoGeneration(db, today, shiftType, false);
    } catch (error) {
      logger.error('Error en la función autoGenerateAfternoonOrder:', error);
    }
    return null;
  }
);

// --- ✅ FUNCIÓN DE AYUDA CORREGIDA ---
async function processAutoGeneration(db, date, shiftType, isManualCall = false) {
  const dateString = format(date, 'yyyy-MM-dd');
  const startOfDay = new Date(`${dateString}T00:00:00`);
  const endOfDay = new Date(`${dateString}T23:59:59`);

  const existingOrdersQuery = db
    .collection('serviceOrders')
    .where('service_date', '>=', startOfDay)
    .where('service_date', '<=', endOfDay)
    .where('service_shift', '==', shiftType);
  const existingOrdersSnap = await existingOrdersQuery.get();

  if (!existingOrdersSnap.empty) {
    const message = `Ya existe una orden para ${dateString} ${shiftType}.`;
    logger.info(message);
    if (isManualCall)
      throw new HttpsError(
        'already-exists',
        `Ya existe una orden para el turno de ${shiftType} en esa fecha.`
      );
    return; // Termina silenciosamente para la automatización
  }

  const monthName = format(date, 'MMMM', { locale: es }).toLowerCase();
  const year = date.getFullYear();
  const monthId = `cuadrante_${monthName}_${year}`;
  const scheduleDoc = await db.collection('schedules').doc(monthId).get();

  // ✅ CORRECCIÓN DE SINTAXIS: Se usa .exists (sin paréntesis)
  if (!scheduleDoc.exists) {
    const message = `No se encontró cuadrante para ${monthId}.`;
    logger.warn(message);
    if (isManualCall)
      throw new HttpsError(
        'not-found',
        `No se encontró el cuadrante para ${monthName} de ${year}.`
      );
    return;
  }

  const scheduleData = scheduleDoc.data();
  const agentsOnShift = findAgentsOnShiftInSchedule(dateString, shiftType, scheduleData);

  if (agentsOnShift.length === 0) {
    const message = `No hay agentes de turno de ${shiftType} para hoy.`;
    logger.info(message);
    if (isManualCall)
      throw new HttpsError(
        'not-found',
        `No hay agentes de ${shiftType} asignados en el cuadrante para esa fecha.`
      );
    return;
  }

  logger.info(`Generando orden para ${shiftType} con agentes: ${agentsOnShift.join(', ')}`);
  await createOrderFromTemplate(db, date, shiftType, agentsOnShift);
}

async function createOrderFromTemplate(db, date, shiftType, agentIds) {
  const templateSnap = await db
    .collection('defaultOrderTemplates')
    .where('shift', '==', shiftType)
    .limit(1)
    .get();
  if (templateSnap.empty) {
    throw new Error(`No se encontró plantilla por defecto para el turno ${shiftType}`);
  }
  const templateData = templateSnap.docs[0].data();

  const seniorAgentOnShift =
    AGENT_SENIORITY_ORDER.find((id) => agentIds.includes(id)) || agentIds[0];
  const regNumber = await generateNextRegNumber(db, date);

  const newOrderData = {
    title: templateData.title || 'Orden Genérica',
    description: templateData.description || '',
    service_date: admin.firestore.Timestamp.fromDate(date),
    service_shift: shiftType,
    status: 'assigned',
    assigned_agents: agentIds,
    checklist: Array.isArray(templateData.checklist) ? templateData.checklist : [],
    created_by_user_id: 'AUTOMATIC_AGENT',
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
    order_reg_number: regNumber,
    shift_manager_id: seniorAgentOnShift,
    autoGenerated: true,
  };
  await db.collection('serviceOrders').add(newOrderData);
}

/**
 * Obtiene una lista de Órdenes de Servicio aplicando filtros de forma robusta.
 * Esta versión está optimizada para recibir un filtro de fecha como 'YYYY-MM-DD'
 * y construir una consulta que Firestore pueda resolver eficientemente con el índice correcto.
 */
export const getServiceOrders = onCall({ region: 'us-central1' }, async (request) => {
  // --- LOG DE DEPURACIÓN 1: Ver los filtros exactos que llegan ---
  logger.info("getServiceOrders_FiltrosRecibidos:", request.data);

  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes estar autenticado para ver las órdenes.');
  }

  const { status, date, service_shift } = request.data;
  const userRole = request.auth.token.role;
  const userAgentId = request.auth.token.agentId;
  let queryRef = getDb().collection('serviceOrders');

  if (date) {
    const startDate = new Date(`${date}T00:00:00.000Z`);
    const endDate = new Date(`${date}T23:59:59.999Z`);
    
    // --- LOG DE DEPURACIÓN 2: Ver el rango de fechas que se está usando ---
    logger.info("getServiceOrders_RangoDeFechas:", { 
      fecha_inicio: startDate.toISOString(), 
      fecha_fin: endDate.toISOString() 
    });

    queryRef = queryRef.where('service_date', '>=', startDate)
                       .where('service_date', '<=', endDate);
  }

  if (status && status !== 'all') {
    queryRef = queryRef.where('status', '==', status);
  }
  if (service_shift && service_shift !== 'all') {
    queryRef = queryRef.where('service_shift', '==', service_shift);
  }
  if (userRole !== 'admin' && userRole !== 'supervisor') {
    queryRef = queryRef.where('assigned_agents', 'array-contains', userAgentId);
  }

  queryRef = queryRef.orderBy('service_date', 'desc');

  try {
    const snapshot = await queryRef.get();
    
    // --- LOG DE DEPURACIÓN 3: Ver cuántos documentos ha encontrado la consulta ---
    logger.info(`getServiceOrders_ResultadosEncontrados: ${snapshot.size} documentos.`);

    const orders = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        service_date: data.service_date.toDate().toISOString(),
        created_at: data.created_at.toDate().toISOString(),
      };
    });
    return { success: true, orders: orders };
  } catch (error) {
    logger.error(`Error al obtener las órdenes de servicio: ${error.message}`, error);
    throw new HttpsError('internal', 'No se pudieron obtener las órdenes de servicio.');
  }
});
/**
 * Asigna agentes y un responsable a una Orden de Servicio.
 */
export const assignResourcesToOrder = onCall({ region: 'us-central1' }, async (request) => {
  const userRole = request.auth?.token?.role;
  if (userRole !== 'admin' && userRole !== 'supervisor') {
    throw new new HttpsError(
      'permission-denied',
      'Solo los administradores o supervisores pueden asignar recursos.'
    )();
  }

  const { orderId, agentIds, shiftManagerId } = request.data;

  if (!orderId || !Array.isArray(agentIds)) {
    throw new new HttpsError(
      'invalid-argument',
      'Se requiere un ID de orden y una lista de IDs de agentes.'
    )();
  }

  if (agentIds.length > 0 && !shiftManagerId) {
    throw new new HttpsError(
      'invalid-argument',
      'Debe seleccionar un responsable para el turno si hay agentes asignados.'
    )();
  }

  try {
    const orderRef = getDb().collection('serviceOrders').doc(orderId);

    const agentIdsAsString = agentIds.map(String);
    const managerIdAsString = shiftManagerId ? String(shiftManagerId) : null;

    await orderRef.update({
      assigned_agents: agentIdsAsString,
      shift_manager_id: managerIdAsString, // ✅ Se guarda el responsable
      status: 'assigned',
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, message: 'Recursos asignados y orden actualizada con éxito.' };
  } catch (error) {
    logger.error('Error al asignar recursos a la orden:', error);
    throw new new HttpsError('internal', 'Ocurrió un error al intentar asignar los recursos.')();
  }
});

/**
 * Inicia una Orden de Servicio, cambiando su estado y creando un Parte de Servicio asociado.
 * AÑADIDA VERIFICACIÓN para asegurar que solo se ejecuta en órdenes con estado 'assigned'.
 */
export const startServiceOrder = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado.');
  }

  const { orderId } = request.data;
  if (!orderId) {
    throw new HttpsError('invalid-argument', 'Se requiere un ID de orden.');
  }

  const userAgentId = request.auth.token.agentId;
  if (!userAgentId) {
    throw new HttpsError('permission-denied', 'El usuario no tiene un ID de agente asociado.');
  }

  const db = getDb();
  const orderRef = db.collection('serviceOrders').doc(orderId);
  const reportRef = db.collection('serviceReports').doc();

  try {
    logger.info(`Iniciando transacción para la orden: ${orderId} por el agente ${userAgentId}`);

    const reportId = await db.runTransaction(async (transaction) => {
      const orderDoc = await transaction.get(orderRef);

      if (!orderDoc.exists) {
        throw new HttpsError('not-found', 'La orden de servicio no existe.');
      }

      const orderData = orderDoc.data();
      logger.info(
        `Estado actual de la orden ${orderId} antes de la transacción: ${orderData.status}`
      );

      // ✅ VERIFICACIÓN CLAVE: Si la orden ya no está en estado 'assigned', la transacción falla.
      // Esto previene la creación de partes duplicados.
      if (orderData.status !== 'assigned') {
        throw new HttpsError(
          'failed-precondition',
          `La orden ya no está en estado 'assigned'. Estado actual: ${orderData.status}. No se creará un nuevo parte.`
        );
      }

      if (!orderData.assigned_agents || !orderData.assigned_agents.includes(userAgentId)) {
        throw new HttpsError(
          'permission-denied',
          'No tienes permiso para iniciar esta orden de servicio.'
        );
      }

      // Actualizamos el estado de la orden
      transaction.update(orderRef, {
        status: 'in_progress',
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Creamos el nuevo parte de servicio
      const newReport = {
        order_id: orderId,
        status: 'open',
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        assigned_agents: orderData.assigned_agents,
        created_by_user_id: request.auth.uid,
      };
      transaction.set(reportRef, newReport);

      logger.info(
        `Transacción para la orden ${orderId} completada con éxito. Nuevo parte ID: ${reportRef.id}`
      );
      return reportRef.id;
    });

    return { success: true, message: 'Servicio iniciado correctamente.', reportId: reportId };
  } catch (error) {
    logger.error(`FALLO en la transacción para la orden ${orderId}:`, error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', 'Ocurrió un error en el servidor al iniciar el servicio.');
  }
});

/**
 * Completa una Orden de Servicio, cambiando su estado a 'completed' y cerrando el Parte de Servicio asociado.
 * Requiere que el usuario sea uno de los agentes asignados a la orden.
 */
export const completeServiceOrder = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado.');
  }

  const { orderId, reportId, completionNotes } = request.data;
  if (!orderId || !reportId) {
    throw new HttpsError('invalid-argument', 'Se requiere un ID de orden y un ID de parte.');
  }

  const userAgentId = request.auth.token.agentId;
  if (!userAgentId) {
    throw new HttpsError('permission-denied', 'El usuario no tiene un ID de agente asociado.');
  }

  const db = getDb();
  const orderRef = db.collection('serviceOrders').doc(orderId);
  const reportRef = db.collection('serviceReports').doc(reportId);

  try {
    await db.runTransaction(async (transaction) => {
      const orderDoc = await transaction.get(orderRef);
      const reportDoc = await transaction.get(reportRef);

      if (!orderDoc.exists) {
        throw new HttpsError('not-found', 'La orden de servicio no existe.');
      }
      if (!reportDoc.exists) {
        throw new HttpsError('not-found', 'El parte de servicio asociado no existe.');
      }

      const orderData = orderDoc.data();
      const reportData = reportDoc.data();

      if (
        !orderData.assigned_agents ||
        (!orderData.assigned_agents.includes(userAgentId) &&
          request.auth.token.role !== 'admin' &&
          request.auth.token.role !== 'mando')
      ) {
        throw new HttpsError(
          'permission-denied',
          'No tienes permiso para completar esta orden de servicio.'
        );
      }

      if (orderData.status !== 'in_progress' && orderData.status !== 'assigned') {
        throw new HttpsError(
          'failed-precondition',
          `La orden no puede ser completada. Estado actual: ${orderData.status}.`
        );
      }

      transaction.update(orderRef, {
        status: 'completed',
        completion_notes: completionNotes || '',
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        completed_by_user_id: request.auth.uid,
      });

      transaction.update(reportRef, {
        status: 'closed',
        closed_at: admin.firestore.FieldValue.serverTimestamp(),
        completion_notes: completionNotes || reportData.completion_notes || '',
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { success: true, message: 'Orden de servicio completada y parte cerrado con éxito.' };
  } catch (error) {
    logger.error(`Error al completar la orden ${orderId} y parte ${reportId}:`, error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', 'Ocurrió un error en el servidor al completar el servicio.');
  }
});

/**
 * Añade una nueva entrada (novedad) a un Parte de Servicio existente.
 * Requiere que el usuario sea uno de los agentes asignados al parte.
 */
export const addReportEntry = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado.');
  }

  const { reportId, description } = request.data;
  if (!reportId || !description || description.trim() === '') {
    throw new HttpsError(
      'invalid-argument',
      'Se requiere un ID del parte y una descripción válida.'
    );
  }

  const userAgentId = request.auth.token.agentId;
  const db = getDb();
  const reportRef = db.collection('serviceReports').doc(reportId);
  const entryRef = reportRef.collection('reportEntries').doc();

  try {
    // --- Verificación de Permisos ---
    const reportDoc = await reportRef.get();
    if (!reportDoc.exists) {
      throw new HttpsError('not-found', 'El parte de servicio no existe.');
    }
    const reportData = reportDoc.data();
    if (!reportData.assigned_agents || !reportData.assigned_agents.includes(userAgentId)) {
      throw new HttpsError(
        'permission-denied',
        'No tienes permiso para añadir novedades a este parte.'
      );
    }
    // --- Fin de la Verificación ---

    const newRequerimientoRef = reportRef.collection('requerimientos').doc();

    await newRequerimientoRef.set({
      description: description,
      isResolved: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: userAgentId,
    });

    logger.info(
      `Nuevo requerimiento ${newRequerimientoRef.id} añadido al parte ${reportId} por el agente ${userAgentId}`
    );
    return { success: true, id: newRequerimientoRef.id };
  } catch (error) {
    logger.error(`Error al añadir requerimiento al parte ${reportId}:`, error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'No se pudo añadir el requerimiento.');
  }
});

/**
 * Busca y devuelve el ID del Parte de Servicio asociado a una Orden de Servicio.
 */
export const getReportForOrder = onCall({ region: 'us-central1', cors: true }, async (request) => {
  if (!request.auth || !request.auth.token.agentId) {
    throw new HttpsError(
      'unauthenticated',
      'El usuario debe estar autenticado y tener un ID de agente.'
    );
  }

  const { orderId } = request.data;
  if (!orderId) {
    throw new HttpsError('invalid-argument', 'Se requiere proporcionar un ID de orden (orderId).');
  }

  logger.info(
    `Buscando parte de servicio para la orden: ${orderId} por el agente: ${request.auth.token.agentId}`
  );

  try {
    const db = getDb();
    const reportsRef = db.collection('serviceReports');

    const snapshot = await reportsRef.where('order_id', '==', orderId).limit(1).get();

    if (snapshot.empty) {
      logger.warn(`No se encontró un parte de servicio para la orden: ${orderId}`);
      throw new HttpsError(
        'not-found',
        'No se encontró un parte de servicio asociado a esta orden.'
      );
    }

    const reportDoc = snapshot.docs[0];
    logger.info(`Parte de servicio encontrado con ID: ${reportDoc.id} para la orden: ${orderId}`);

    return { success: true, reportId: reportDoc.id };
  } catch (error) {
    logger.error(`Error catastrófico buscando el parte para la orden ${orderId}:`, error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError(
      'internal',
      'Ocurrió un error inesperado en el servidor al buscar el parte de servicio.'
    );
  }
});

/**
 * Finaliza y envía un Parte de Servicio para su revisión.
 */
export const submitServiceReport = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado.');
  }
  const { reportId } = request.data;
  if (!reportId) {
    throw new HttpsError('invalid-argument', 'Se requiere un ID del parte de servicio.');
  }

  const db = getDb();
  const reportRef = db.collection('serviceReports').doc(reportId);

  try {
    await reportRef.update({
      status: 'pending_review',
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true, message: 'Parte de servicio enviado para revisión.' };
  } catch (error) {
    logger.error(`Error al enviar el parte ${reportId}:`, error);
    throw new HttpsError('internal', 'No se pudo enviar el parte para revisión.');
  }
});

/**
 * Permite a un mando validar o devolver un Parte de Servicio.
 * ✅ AHORA TAMBIÉN ACTUALIZA LA ORDEN DE SERVICIO A 'completed' SI SE VALIDA.
 */
export const validateServiceReport = onCall({ region: 'us-central1' }, async (request) => {
  if (
    !request.auth ||
    (request.auth.token.role !== 'admin' && request.auth.token.role !== 'supervisor')
  ) {
    throw new HttpsError('permission-denied', 'Solo los mandos pueden validar partes de servicio.');
  }

  const { reportId, newStatus, comments } = request.data;
  if (!reportId || !newStatus || !['validated', 'returned'].includes(newStatus)) {
    throw new HttpsError(
      'invalid-argument',
      "Se requiere un ID de parte y un nuevo estado válido ('validated' o 'returned')."
    );
  }

  const db = getDb();
  const reportRef = db.collection('serviceReports').doc(reportId);

  try {
    const reportDoc = await reportRef.get();

    // ✅ SINTAXIS CORREGIDA: Se usa .exists en lugar de .exists()
    if (!reportDoc.exists) {
      throw new HttpsError('not-found', 'El parte de servicio no existe.');
    }

    const updateData = {
      status: newStatus,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      validated_by_user_id: request.auth.uid,
    };

    if (newStatus === 'returned' && comments) {
      updateData.validation_comments = comments;
    }

    await reportRef.update(updateData);

    // Si el parte se ha validado, actualizamos también la orden principal
    if (newStatus === 'validated') {
      const orderId = reportDoc.data().order_id;
      if (orderId) {
        const orderRef = db.collection('serviceOrders').doc(orderId);
        await orderRef.update({
          status: 'completed',
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        logger.info(`Orden ${orderId} marcada como 'completed' tras la validación del parte.`);
      }
    }

    return { success: true, message: 'El estado del parte ha sido actualizado.' };
  } catch (error) {
    logger.error(`[ERROR FATAL] La función validateServiceReport ha fallado:`, error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      'internal',
      'No se pudo actualizar el estado del parte. Revisa los logs de la función.'
    );
  }
});

/**
 * [MODIFICADO] Obtiene una lista de Partes de Servicio con filtros opcionales.
 * Asegura que la descripción se envíe sin escapar los saltos de línea.
 */
export const getServiceReports = onCall({ region: 'us-central1', cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado.');
  }

  // Se leen todos los filtros, incluyendo mes y año
  const { status, agentId, keyword, year, month } = request.data;
  const userRole = request.auth.token.role;
  const userAgentId = request.auth.token.agentId;
  const db = getDb();

  let reportIdsFromKeywordSearch = null;

  if (keyword && keyword.length > 0) {
    reportIdsFromKeywordSearch = new Set();
    const requerimientosRef = db.collectionGroup('requerimientos');
    // NOTA: Esta consulta puede requerir un índice en Firestore.
    const keywordQuery = query(
      requerimientosRef,
      where('motivo', '>=', keyword),
      where('motivo', '<=', keyword + '\uf8ff')
    );
    const keywordSnap = await keywordQuery.get();

    keywordSnap.forEach((doc) => {
      reportIdsFromKeywordSearch.add(doc.ref.parent.parent.id);
    });

    if (reportIdsFromKeywordSearch.size === 0) {
      return { success: true, reports: [] };
    }
  }

  let reportsQuery = db.collection('serviceReports');

  // --- Filtros de Rol y Estado (sin cambios) ---
  if (userRole === 'admin' || userRole === 'supervisor') {
    if (status && status !== 'all') reportsQuery = reportsQuery.where('status', '==', status);
    if (agentId && agentId !== 'all')
      reportsQuery = reportsQuery.where('assigned_agents', 'array-contains', agentId);
  } else {
    reportsQuery = reportsQuery.where('assigned_agents', 'array-contains', userAgentId);
    if (status && status !== 'all') reportsQuery = reportsQuery.where('status', '==', status);
  }

  // ✅ SOLUCIÓN: SE AÑADE LA LÓGICA DE FILTRADO POR FECHA QUE FALTABA
  if (year && year !== 'all') {
    const yearInt = parseInt(year);
    let startDate, endDate;

    if (month && month !== 'all') {
      // Si se especifica un mes, el rango es ese mes completo
      const monthInt = parseInt(month) - 1; // Convertir 1-12 a 0-11 para Date
      startDate = new Date(yearInt, monthInt, 1);
      endDate = new Date(yearInt, monthInt + 1, 0, 23, 59, 59, 999);
    } else {
      // Si no se especifica mes, el rango es el año completo
      startDate = new Date(yearInt, 0, 1);
      endDate = new Date(yearInt, 11, 31, 23, 59, 59, 999);
    }

    // Se aplica el filtro de fecha a la consulta
    reportsQuery = reportsQuery
      .where('created_at', '>=', startDate)
      .where('created_at', '<=', endDate);
  }

  // Filtro por palabra clave (sin cambios)
  if (reportIdsFromKeywordSearch) {
    reportsQuery = reportsQuery.where(
      admin.firestore.FieldPath.documentId(),
      'in',
      Array.from(reportIdsFromKeywordSearch)
    );
  }

  reportsQuery = reportsQuery.orderBy('created_at', 'desc');

  try {
    const snapshot = await reportsQuery.get();
    const reports = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const reportData = doc.data();
        const report = {
          id: doc.id,
          ...reportData,
          created_at: reportData.created_at.toDate().toISOString(),
          order_title: 'Orden no encontrada',
          service_shift: 'N/A',
          order_reg_number: '---',
        };
        if (reportData.order_id) {
          try {
            const orderDoc = await db.collection('serviceOrders').doc(reportData.order_id).get();
            if (orderDoc.exists) {
              const orderData = orderDoc.data();
              report.order_title = orderData.title;
              report.service_shift = orderData.service_shift;
              report.order_reg_number = orderData.order_reg_number || '---';
            }
          } catch (orderError) {
            logger.warn(`No se pudo obtener la orden ${reportData.order_id}`);
          }
        }
        return report;
      })
    );
    return { success: true, reports: reports };
  } catch (error) {
    logger.error('[ERROR FATAL] La función getServiceReports ha fallado:', error);
    throw new HttpsError('internal', 'No se pudieron obtener los partes. Revisa los logs.');
  }
});

/**
 * Crea órdenes desde una plantilla, buscando los agentes de turno en el cuadrante,
 * asignándolos automáticamente y estableciendo al más veterano como responsable.
 */
export const createDefaultServiceOrders = onCall({ region: 'us-central1' }, async (request) => {
  // 1. Verificación de permisos
  if (
    !request.auth ||
    (request.auth.token.role !== 'admin' && request.auth.token.role !== 'supervisor')
  ) {
    throw new HttpsError(
      'permission-denied',
      'Solo los administradores o supervisores pueden realizar esta acción.'
    );
  }

  const { date, templateShiftType } = request.data;
  if (!date || !templateShiftType) {
    throw new HttpsError('invalid-argument', 'Se requiere una fecha y un tipo de turno.');
  }

  const db = getDb();
  // AGENT_SENIORITY_ORDER ya está definido en el ámbito global del archivo.

  try {
    // --- Paso 1: Obtener la plantilla ---
    const templateSnapshot = await db
      .collection('defaultOrderTemplates')
      .where('shift', '==', templateShiftType)
      .limit(1)
      .get();

    if (templateSnapshot.empty) {
      throw new HttpsError(
        'not-found',
        `No se encontró una plantilla para el turno: ${templateShiftType}.`
      );
    }
    const templateData = templateSnapshot.docs[0].data();

    // --- Paso 2: Buscar agentes de turno en el cuadrante ---
    const serviceDate = new Date(date + 'T12:00:00'); // Usar mediodía para evitar problemas de UTC
    const monthName = format(serviceDate, 'MMMM', { locale: es }).toLowerCase();
    const year = serviceDate.getFullYear();
    const monthId = `cuadrante_${monthName}_${year}`;

    const scheduleDoc = await db.collection('schedules').doc(monthId).get();
    if (!scheduleDoc.exists) {
      throw new HttpsError(
        'not-found',
        `No se encontró el cuadrante para ${monthName} de ${year}. Asigna los turnos primero.`
      );
    }

    const scheduleData = scheduleDoc.data();
    // Se pasa el texto de la fecha (YYYY-MM-DD) a la función de búsqueda para evitar errores de zona horaria
    const agentsOnShift = findAgentsOnShiftInSchedule(date, templateShiftType, scheduleData);

    if (agentsOnShift.length === 0) {
      // Si no hay agentes, se devuelve un mensaje claro y no se crea la orden.
      return {
        success: false,
        message: `No se generó la orden porque no hay agentes de ${templateShiftType} para el ${date}.`,
      };
    }

    // --- Paso 3: Determinar el responsable por antigüedad ---
    // Busca el primer ID en el orden de antigüedad que también esté en la lista de agentes de turno.
    // Si no encuentra ninguno (caso raro), asigna al primer agente de la lista.
    const seniorAgentOnShift =
      AGENT_SENIORITY_ORDER.find((id) => agentsOnShift.includes(id)) || agentsOnShift[0];

    // --- Paso 4: Generar el número de registro ---
    const month = (serviceDate.getMonth() + 1).toString().padStart(2, '0');
    const prefix = `/${month}/${year}`;

    const ordersRef = db.collection('serviceOrders');
    // ✅ CORREGIDO: Usar los métodos directamente desde la referencia de la colección
    const q = ordersRef
      .where('order_reg_number', '>=', `000${prefix}`)
      .where('order_reg_number', '<=', `999${prefix}`)
      .orderBy('order_reg_number', 'desc')
      .limit(1);

    const querySnapshot = await q.get(); // ✅ CORREGIDO: get() se llama directamente sobre el objeto query 'q'
    let nextNumber = 1;

    if (!querySnapshot.empty) {
      const lastOrder = querySnapshot.docs[0].data();
      const lastNumber = parseInt(lastOrder.order_reg_number.split('/')[0], 10);
      nextNumber = lastNumber + 1;
    }
    const formattedNumber = `${String(nextNumber).padStart(3, '0')}${prefix}`;

    // --- Paso 5: Crear el nuevo objeto de la orden con todos los datos ---
    const serviceDateTimestamp = admin.firestore.Timestamp.fromDate(parseISO(date));
    const newOrderData = {
      title: templateData.title || 'Orden Genérica',
      description: templateData.description || '',
      service_date: serviceDateTimestamp,
      service_shift: templateData.shift,
      status: 'assigned', // Se crea directamente como 'assigned'
      assigned_agents: agentsOnShift, // Se asignan los agentes de turno
      checklist: Array.isArray(templateData.checklist) ? templateData.checklist : [],
      requiresGeolocation: templateData.requiresGeolocation || false,
      created_by_user_id: request.auth.uid,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      order_reg_number: formattedNumber,
      shift_manager_id: seniorAgentOnShift, // Se asigna el responsable
    };

    // Logs de depuración movidos aquí, dentro de la función y después de la definición
    logger.info(`Senior Agent On Shift (Responsable): ${seniorAgentOnShift}`);
    logger.info(`New Order Data being added, shift_manager_id: ${newOrderData.shift_manager_id}`);

    await db.collection('serviceOrders').add(newOrderData);

    return {
      success: true,
      message: `Se creó y asignó 1 orden genérica para ${templateShiftType}.`,
    };
  } catch (error) {
    logger.error(`[ERROR FATAL] La función createDefaultServiceOrders ha fallado:`, error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      'internal',
      'No se pudieron crear las órdenes por defecto. Revisa los logs de la función.'
    );
  }
});

// ✅ FUNCIÓN DE AYUDA CORREGIDA: AHORA ACEPTA LA FECHA COMO TEXTO
// functions/index.js

// ✅ REEMPLAZA LA FUNCIÓN COMPLETA CON ESTA VERSIÓN
/**
 * Función de ayuda corregida para encontrar agentes en un turno específico del cuadrante.
 * Ahora maneja correctamente las fechas guardadas como Timestamps de Firestore.
 */
function findAgentsOnShiftInSchedule(dateString, shiftFullName, schedule) {
  const shiftNameMap = { mañana: 'M', tarde: 'T', noche: 'N' };
  const shiftShortCode = shiftNameMap[shiftFullName.toLowerCase()];
  if (!shiftShortCode || !schedule || !schedule.weeks) return [];

  const agentIds = [];
  for (const weekKey in schedule.weeks) {
    for (const dayKey in schedule.weeks[weekKey].days) {
      const day = schedule.weeks[weekKey].days[dayKey];
      if (!day || !day.date) continue; // Salta si el día o su fecha no existen

      // --- Lógica de comparación de fecha robusta ---
      let dayDateString = '';
      if (typeof day.date === 'string') {
        dayDateString = day.date; // La fecha ya está como 'YYYY-MM-DD'
      } else if (day.date && typeof day.date.toDate === 'function') {
        // Si es un Timestamp de Firestore, lo convierte a 'YYYY-MM-DD'
        const dateObj = day.date.toDate();
        dayDateString = format(dateObj, 'yyyy-MM-dd');
      }
      // --- Fin de la lógica de comparación ---

      if (dayDateString === dateString) {
        for (const shiftKey in day.shifts) {
          const shiftInfo = day.shifts[shiftKey];
          if (shiftInfo.shiftType?.toUpperCase() === shiftShortCode.toUpperCase()) {
            agentIds.push(String(shiftInfo.agentId));
          }
        }
        // Una vez que encontramos el día correcto, podemos detener la búsqueda.
        return agentIds;
      }
    }
  }
  return agentIds; // Devuelve los agentes encontrados (o un array vacío)
}

/**
 * ✅ FUNCIÓN DE AYUDA QUE FALTABA
 * Genera el siguiente número de registro para una orden de servicio.
 */
async function generateNextRegNumber(db, date) {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const prefix = `/${month}/${year}`;
  const ordersRef = db.collection('serviceOrders');
  const q = ordersRef
    .where('order_reg_number', '>=', `000${prefix}`)
    .where('order_reg_number', '<=', `999${prefix}`)
    .orderBy('order_reg_number', 'desc')
    .limit(1);
  const lastOrderSnap = await q.get();
  let nextNumber = 1;
  if (!lastOrderSnap.empty) {
    const lastNum = parseInt(lastOrderSnap.docs[0].data().order_reg_number.split('/')[0], 10);
    nextNumber = lastNum + 1;
  }
  return `${String(nextNumber).padStart(3, '0')}${prefix}`;
}

/**
 * Permite a un administrador o supervisor actualizar los detalles de una Orden de Servicio.
 * Esta función no tiene restricciones de fecha o estado para los roles de mando.
 */
export const updateServiceOrder = onCall({ region: 'us-central1' }, async (request) => {
  // 1. Verificación de permisos: Solo admin o supervisor pueden ejecutarla.
  const userRole = request.auth?.token?.role;
  if (userRole !== 'admin' && userRole !== 'supervisor') {
    throw new HttpsError(
      'permission-denied',
      'Solo los administradores o supervisores pueden editar órdenes.'
    );
  }

  // 2. Validación de los datos recibidos desde el frontend.
  const { orderId, updateData } = request.data;
  if (!orderId || !updateData) {
    throw new HttpsError(
      'invalid-argument',
      'Se requiere un ID de orden y los datos a actualizar.'
    );
  }

  const db = getDb();
  const orderRef = db.collection('serviceOrders').doc(orderId);

  try {
    // 3. Preparamos los datos para la actualización.
    // Convertimos la fecha de texto a Timestamp de Firestore.
    const finalUpdateData = {
      ...updateData,
      service_date: admin.firestore.Timestamp.fromDate(parseISO(updateData.service_date)),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    // 4. Ejecutamos la actualización en la base de datos.
    await orderRef.update(finalUpdateData);

    logger.info(`La orden ${orderId} fue actualizada por un ${userRole}.`);
    return { success: true, message: 'Orden de servicio actualizada con éxito.' };
  } catch (error) {
    logger.error(`Error al actualizar la orden ${orderId}:`, error);
    throw new HttpsError('internal', 'No se pudo actualizar la orden de servicio.');
  }
});

/**
 * Elimina una Orden de Servicio.
 * Solo puede ser ejecutado por un admin o supervisor.
 */
export const deleteServiceOrder = onCall({ region: 'us-central1' }, async (request) => {
  const userRole = request.auth?.token?.role;
  if (userRole !== 'admin' && userRole !== 'supervisor') {
    throw new HttpsError(
      'permission-denied',
      'Solo los administradores o supervisores pueden eliminar órdenes.'
    );
  }

  const { orderId } = request.data;
  if (!orderId) {
    throw new HttpsError('invalid-argument', 'Se requiere un ID de orden para eliminarla.');
  }

  const db = getDb();
  const orderRef = db.collection('serviceOrders').doc(orderId);

  try {
    // Opcional: Aquí se podría añadir lógica para borrar también los partes de servicio asociados.
    // Por ahora, solo eliminamos la orden.

    await orderRef.delete();

    logger.info(`La orden ${orderId} fue eliminada por un ${userRole}.`);
    return { success: true, message: 'Orden de servicio eliminada con éxito.' };
  } catch (error) {
    logger.error(`Error al eliminar la orden ${orderId}:`, error);
    throw new HttpsError('internal', 'No se pudo eliminar la orden de servicio.');
  }
});

// ==================================================================
// === FUNCIÓN CON LA CORRECCIÓN FINAL PARA EL ERROR 500 ============
// ==================================================================
/**
 * Permite a un agente o mando actualizar el estado y la geolocalización de un ítem del checklist.
 * Almacena la ubicación y la marca de tiempo del servidor cuando un ítem se marca como completado.
 */
export const updateChecklistItemStatus = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado.');
  }

  // Se leen los nuevos parámetros: newStatus y comment
  const { reportId, orderId, itemIndex, newStatus, comment, geolocation } = request.data;

  // Se valida que los parámetros necesarios estén presentes
  if (!reportId || !orderId || itemIndex === undefined || !newStatus) {
    throw new HttpsError(
      'invalid-argument',
      'Faltan datos requeridos (reportId, orderId, itemIndex, newStatus).'
    );
  }

  if (
    geolocation &&
    (typeof geolocation.latitude !== 'number' || typeof geolocation.longitude !== 'number')
  ) {
    throw new HttpsError('invalid-argument', "El objeto 'geolocation' es inválido.");
  }

  const userAgentId = request.auth.token.agentId;
  const db = getDb();
  const orderRef = db.collection('serviceOrders').doc(orderId);

  try {
    await db.runTransaction(async (transaction) => {
      const orderDoc = await transaction.get(orderRef);
      if (!orderDoc.exists) {
        throw new HttpsError('not-found', 'La orden de servicio asociada no existe.');
      }

      const orderData = orderDoc.data();
      const isAssigned = orderData.assigned_agents?.includes(userAgentId);
      if (!isAssigned) {
        throw new HttpsError(
          'permission-denied',
          'No tienes permiso para modificar este checklist.'
        );
      }

      const checklist = orderData.checklist || [];
      if (itemIndex < 0 || itemIndex >= checklist.length) {
        throw new HttpsError('out-of-range', 'El índice del ítem del checklist es inválido.');
      }

      const updatedChecklist = [...checklist];
      const itemToUpdate = updatedChecklist[itemIndex];

      // ✅ SE ACTUALIZAN LOS CAMPOS CON LA NUEVA ESTRUCTURA
      itemToUpdate.status = newStatus; // 'pendiente' o 'realizado'
      itemToUpdate.comment = comment || ''; // Se guarda el comentario o un texto vacío
      itemToUpdate.completed = newStatus === 'realizado'; // Se mantiene por compatibilidad

      if (newStatus === 'realizado') {
        itemToUpdate.completed_at = new Date(); // Usar la fecha del servidor es más robusto
        if (geolocation) {
          itemToUpdate.completed_location = new admin.firestore.GeoPoint(
            geolocation.latitude,
            geolocation.longitude
          );
        }
      } else {
        // Si vuelve a "pendiente", se eliminan los datos de finalización
        delete itemToUpdate.completed_at;
        delete itemToUpdate.completed_location;
      }

      transaction.update(orderRef, {
        checklist: updatedChecklist,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    logger.info(`Checklist item [${itemIndex}] en orden ${orderId} actualizado a '${newStatus}'.`);
    return { success: true, message: 'Checklist actualizado correctamente.' };
  } catch (error) {
    logger.error(`Error al actualizar ítem del checklist en orden ${orderId}:`, error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'No se pudo actualizar el ítem del checklist.');
  }
});

// ✅ Cloud Function updateRequerimientoStatus (versión final y limpia)
/**
 * Cloud Function para actualizar el estado y/o el comentario de un requerimiento.
 * Recibe reportId, orderId, requerimientoId, newStatus, comment (opcional), geolocation (opcional).
 *
 * Confiamos en los custom claims del token de autenticación para rol y agentId.
 */
export const updateRequerimientoStatus = onCall({ region: 'us-central1' }, async (request) => {
  logger.info('--- Inicio de updateRequerimientoStatus (VERSION FINAL Y LIMPIA) ---');

  // 1. Verificación de Autenticación (Ahora funcionará al recibir el token correctamente)
  if (!request.auth) {
    logger.warn('Intento de llamada a updateRequerimientoStatus sin autenticación.');
    throw new HttpsError(
      'unauthenticated',
      'Solo usuarios autenticados pueden actualizar requerimientos.'
    );
  }

  // 2. Obtener los datos del usuario directamente del token de autenticación (Custom Claims)
  const userId = request.auth.uid;
  const userRole = request.auth.token.role;
  const userAgentId = request.auth.token.agentId; // Este es el agentId del usuario logeado

  logger.info(`Usuario UID: ${userId}, Rol: ${userRole}, AgentId: ${userAgentId}`);

  // Validar que el userAgentId exista en el token (es un claim crítico para permisos)
  if (!userAgentId) {
    logger.error(`Usuario ${userId} no tiene un agentId en el token de autenticación.`);
    throw new HttpsError(
      'permission-denied',
      'Tu cuenta de usuario no tiene un ID de agente asociado. Contacta con soporte.'
    );
  }

  // 3. Validación de datos de entrada
  const { reportId, orderId, requerimientoId, newStatus, comment, geolocation } = request.data;
  if (!reportId || !orderId || !requerimientoId || !newStatus) {
    logger.error('Faltan datos requeridos para updateRequerimientoStatus.', {
      reportId,
      orderId,
      requerimientoId,
      newStatus,
    });
    throw new HttpsError(
      'invalid-argument',
      'Faltan datos requeridos (reportId, orderId, requerimientoId, newStatus).'
    );
  }

  if (newStatus !== 'pendiente' && newStatus !== 'realizado') {
    logger.error(`Estado de requerimiento inválido recibido: ${newStatus}`);
    throw new HttpsError(
      'invalid-argument',
      'El estado del requerimiento no es válido. Debe ser "pendiente" o "realizado".'
    );
  }

  // Validación de geolocalización, si se proporciona
  if (
    geolocation &&
    (typeof geolocation.latitude !== 'number' || typeof geolocation.longitude !== 'number')
  ) {
    logger.error('Objeto "geolocation" inválido.', geolocation);
    throw new HttpsError('invalid-argument', "El objeto 'geolocation' es inválido.");
  }

  const db = getDb(); // Obtener la instancia de Firestore

  // Referencias a los documentos
  const requerimientoRef = db
    .collection('serviceReports')
    .doc(reportId)
    .collection('requerimientos')
    .doc(requerimientoId);
  const orderRef = db.collection('serviceOrders').doc(orderId);
  const reportRef = db.collection('serviceReports').doc(reportId);

  try {
    await db.runTransaction(async (transaction) => {
      // Obtener los documentos de la orden y el parte dentro de la transacción
      const orderSnap = await transaction.get(orderRef);
      const reportSnap = await transaction.get(reportRef);

      // Verificar si los documentos existen
      if (!orderSnap.exists) {
        logger.error(`Orden de servicio no encontrada: ${orderId}`);
        throw new HttpsError('not-found', 'Orden de servicio asociada no encontrada.');
      }
      if (!reportSnap.exists) {
        logger.error(`Parte de servicio no encontrado: ${reportId}`);
        throw new HttpsError('not-found', 'Parte de servicio no encontrado.');
      }

      const orderData = orderSnap.data();
      const reportData = reportSnap.data();

      // 4. Verificación de permisos y roles:
      // Usamos userAgentId y userRole directamente del token.
      const isResponsibleAgent = orderData.shift_manager_id === userAgentId; // Revisa si es el responsable del turno de la orden
      const isAssignedAgent = orderData.assigned_agents?.includes(userAgentId); // Revisa si es un agente asignado a la orden
      const isAdminOrSupervisor = userRole === 'admin' || userRole === 'supervisor';

      if (!isResponsibleAgent && !isAssignedAgent && !isAdminOrSupervisor) {
        logger.warn(
          `Permiso denegado para el usuario ${userId} (Agente: ${userAgentId}, Rol: ${userRole}) para actualizar el requerimiento ${requerimientoId}.`
        );
        throw new HttpsError(
          'permission-denied',
          'No tienes permiso para actualizar este requerimiento.'
        );
      }

      // 5. Verificar que el parte esté en estado 'open' o 'returned' para poder modificar el requerimiento
      if (reportData.status !== 'open' && reportData.status !== 'returned') {
        logger.warn(
          `Intento de actualizar requerimiento en un parte con estado no modificable: ${reportData.status}`
        );
        throw new HttpsError(
          'failed-precondition',
          `No se puede actualizar un requerimiento de un parte en estado '${reportData.status}'.`
        );
      }

      // 6. Preparar los datos de actualización para el requerimiento
      const updatePayload = {
        status: newStatus,
        comment: comment || '', // Asegura que el comentario sea una cadena vacía si es null/undefined
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (newStatus === 'realizado') {
        updatePayload.isResolved = true; // Campo existente para compatibilidad
        updatePayload.resolvedAt = admin.firestore.FieldValue.serverTimestamp();
        if (geolocation) {
          // Crea un GeoPoint de Firestore si hay datos de geolocalización válidos
          updatePayload.resolvedLocation = new admin.firestore.GeoPoint(
            geolocation.latitude,
            geolocation.longitude
          );
        }
        updatePayload.resolvedBy = userId; // ID del usuario que lo resolvió
      } else {
        // Si el estado vuelve a 'pendiente'
        updatePayload.isResolved = false;
        // Eliminar campos relacionados con la resolución si se vuelve a pendiente
        updatePayload.resolvedAt = admin.firestore.FieldValue.delete();
        updatePayload.resolvedLocation = admin.firestore.FieldValue.delete();
        updatePayload.resolvedBy = admin.firestore.FieldValue.delete();
      }

      // 7. Ejecutar la actualización del requerimiento dentro de la transacción
      transaction.update(requerimientoRef, updatePayload);
      logger.info(`Requerimiento ${requerimientoId} actualizado a estado '${newStatus}'.`);

      // 8. Actualizar el campo 'updatedAt' del parte principal para reflejar el cambio
      transaction.update(reportRef, {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      logger.info(`Parte ${reportId} updatedAt actualizado.`);
    });

    logger.info('Transacción de actualización de requerimiento completada con éxito.');
    return { success: true, message: 'Estado del requerimiento actualizado correctamente.' };
  } catch (error) {
    logger.error("Error en la Cloud Function 'updateRequerimientoStatus':", error);
    // Re-lanzar HttpsError si ya es una instancia de HttpsError
    if (error instanceof HttpsError) {
      throw error;
    }
    // Para cualquier otro error, lanzar un HttpsError genérico 'internal'
    throw new HttpsError('internal', 'Error al actualizar el requerimiento.', error.message);
  }
});

/**
 * Actualiza el objeto de resumen de actuaciones de un parte de servicio.
 * Requiere que el usuario sea uno de los agentes asignados.
 */
export const updateReportSummary = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado.');
  }

  const { reportId, summaryData } = request.data;
  if (!reportId || typeof summaryData !== 'object') {
    throw new HttpsError('invalid-argument', 'Se requiere un ID de parte y un objeto de resumen.');
  }

  const userAgentId = request.auth.token.agentId;
  const db = getDb();
  const reportRef = db.collection('serviceReports').doc(reportId);

  try {
    const reportDoc = await reportRef.get();
    if (!reportDoc.exists) {
      throw new HttpsError('not-found', 'El parte de servicio no existe.');
    }

    const reportData = reportDoc.data();
    if (!reportData.assigned_agents || !reportData.assigned_agents.includes(userAgentId)) {
      throw new HttpsError('permission-denied', 'No tienes permiso para modificar este parte.');
    }

    // Limpieza de datos: Asegurarse de que solo guardamos números
    const cleanSummary = {};
    for (const key in summaryData) {
      const value = Number(summaryData[key]);
      if (typeof value === 'number' && !isNaN(value) && value >= 0) {
        cleanSummary[key] = value;
      }
    }

    await reportRef.update({
      summary: cleanSummary,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, message: 'Resumen guardado correctamente.' };
  } catch (error) {
    logger.error(`Error al actualizar el resumen para el parte ${reportId}:`, error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', 'Ocurrió un error al guardar el resumen.');
  }
});

// --- Cloud Functions (EXISTENTES) ---
/**
 * Añade un nuevo requerimiento a la subcolección de un parte de servicio.
 * Verifica que el usuario que lo añade esté asignado al parte.
 */
export const addRequerimiento = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado.');
  }

  // ✅ CAMBIO 1: Se espera recibir 'data' en lugar de 'description'
  const { reportId, data } = request.data;

  // ✅ CAMBIO 2: La validación ahora comprueba 'data' y 'data.motivo'
  if (!reportId || !data || !data.motivo || data.motivo.trim() === '') {
    throw new HttpsError(
      'invalid-argument',
      'Se requiere un ID del parte y un motivo válido en los datos.'
    );
  }

  const userAgentId = request.auth.token.agentId;
  const db = getDb();
  const reportRef = db.collection('serviceReports').doc(reportId);

  try {
    // --- Verificación de Permisos (se mantiene igual) ---
    const reportDoc = await reportRef.get();
    if (!reportDoc.exists) {
      throw new HttpsError('not-found', 'El parte de servicio no existe.');
    }
    const reportData = reportDoc.data();
    if (!reportData.assigned_agents || !reportData.assigned_agents.includes(userAgentId)) {
      throw new HttpsError(
        'permission-denied',
        'No tienes permiso para añadir requerimientos a este parte.'
      );
    }
    // --- Fin de la Verificación ---

    const newRequerimientoRef = reportRef.collection('requerimientos').doc();

    // ✅ CAMBIO 3: Se guarda el objeto 'data' completo, no solo la descripción.
    // También se añaden campos estándar.
    await newRequerimientoRef.set({
      ...data, // Guarda todos los campos: hora, tipoContacto, telefono, requirente, motivo
      status: 'pendiente', // Estado inicial
      comment: '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByAgentId: userAgentId,
    });

    logger.info(
      `Nuevo requerimiento ${newRequerimientoRef.id} añadido al parte ${reportId} por el agente ${userAgentId}`
    );
    return { success: true, id: newRequerimientoRef.id };
  } catch (error) {
    logger.error(`Error al añadir requerimiento al parte ${reportId}:`, error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'No se pudo añadir el requerimiento.');
  }
});

/**
 * [NUEVA FUNCIÓN DE SOLUCIÓN]
 * Obtiene todos los detalles combinados de un Parte de Servicio y su Orden asociada.
 * Prepara los datos para que el frontend los pueda consumir directamente.
 */
export const getServiceReportDetails = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado.');
  }

  const { reportId } = request.data;
  if (!reportId) {
    throw new HttpsError('invalid-argument', 'Se requiere un ID de parte (reportId).');
  }

  const db = getDb();

  try {
    const reportRef = db.collection('serviceReports').doc(reportId);
    const reportSnap = await reportRef.get();

    if (!reportSnap.exists) {
      throw new HttpsError('not-found', 'El parte de servicio no fue encontrado.');
    }

    const reportData = { id: reportSnap.id, ...reportSnap.data() };

    // 1. Unir los datos de la Orden de Servicio
    if (reportData.order_id) {
      const orderRef = db.collection('serviceOrders').doc(reportData.order_id);
      const orderSnap = await orderRef.get();
      if (orderSnap.exists) {
        const orderData = orderSnap.data();
        // ✅ **LA CLAVE DE LA SOLUCIÓN**: Convertimos Timestamps a ISO strings
        // y combinamos los datos de la orden con el parte.
        reportData.order = {
          id: orderSnap.id,
          ...orderData,
          service_date: orderData.service_date.toDate().toISOString(),
          created_at: orderData.created_at.toDate().toISOString(),
        };
      }
    }

    // 2. Unir los datos de la subcolección de Requerimientos
    const requerimientosRef = reportRef.collection('requerimientos');
    const requerimientosSnap = await requerimientosRef.orderBy('createdAt', 'asc').get();
    reportData.requerimientos = requerimientosSnap.docs.map((doc) => {
      const reqData = doc.data();
      return {
        id: doc.id,
        ...reqData,
        createdAt: reqData.createdAt.toDate().toISOString(),
      };
    });

    // 3. Devolver el objeto completo y listo para usar
    return { success: true, report: reportData };
  } catch (error) {
    logger.error(`Error al obtener los detalles del parte ${reportId}:`, error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'No se pudieron obtener los detalles completos del parte.');
  }
});

/**
 * Cambia el estado (resuelto/no resuelto) de un requerimiento específico.
 */
export const toggleRequerimientoStatus = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado.');
  }

  const { reportId, requerimientoId, isResolved } = request.data;
  if (!reportId || !requerimientoId || typeof isResolved !== 'boolean') {
    throw new HttpsError(
      'invalid-argument',
      'Faltan parámetros requeridos (reportId, requerimientoId, isResolved).'
    );
  }

  const db = getDb();
  const requerimientoRef = db
    .collection('serviceReports')
    .doc(reportId)
    .collection('requerimientos')
    .doc(requerimientoId);

  try {
    await requerimientoRef.update({
      isResolved: isResolved,
      resolvedAt: isResolved
        ? admin.firestore.FieldValue.serverTimestamp()
        : admin.firestore.FieldValue.delete(),
    });

    logger.info(`Estado del requerimiento ${requerimientoId} cambiado a ${isResolved}`);
    return { success: true };
  } catch (error) {
    logger.error(`Error al cambiar estado del requerimiento ${requerimientoId}:`, error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'No se pudo actualizar el estado del requerimiento.');
  }
});

export const setCustomUserClaims = onDocumentUpdated(
  { document: 'users/{userId}', region: 'us-central1' },
  async (event) => {
    const afterData = event.data?.after.data();
    if (!afterData) return;
    const userRole = afterData.role || 'guard';
    const agentId = String(afterData.agentId || '');
    try {
      await admin.auth().setCustomUserClaims(event.params.userId, { role: userRole, agentId });
    } catch (error) {
      logger.error(`Error al establecer claims para ${event.params.userId}:`, error);
    }
  }
);

export const addAgentCallable = onCall({ region: 'us-central1' }, async (request) => {
  if (request.auth?.token?.role !== 'admin')
    throw new HttpsError('permission-denied', 'Solo administradores.');
  const { id, name, active } = request.data;
  if (!name) throw new HttpsError('invalid-argument', 'El nombre es requerido.');
  try {
    const agentRef = getDb().collection('agents').doc(String(id));
    if (!(await agentRef.get()).exists)
      throw new HttpsError('already-exists', `El ID ${id} ya existe.`);
    await agentRef.set({ name, active, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    return { success: true, agentId: agentRef.id };
  } catch (error) {
    throw new HttpsError('internal', error.message);
  }
});

export const updateAgentCallable = onCall({ region: 'us-central1' }, async (request) => {
  if (request.auth?.token?.role !== 'admin')
    throw new HttpsError('permission-denied', 'Solo administradores.');
  const { agentId, updateData } = request.data;
  if (!agentId || !updateData) throw new HttpsError('invalid-argument', 'Faltan datos.');
  try {
    await getDb().collection('agents').doc(String(agentId)).update(updateData);
    return { success: true };
  } catch (error) {
    throw new HttpsError('internal', error.message);
  }
});

export const deleteAgentCallable = onCall({ region: 'us-central1' }, async (request) => {
  if (request.auth?.token?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo administradores.');
  }
  const { agentId } = request.data;
  if (!agentId) {
    throw new HttpsError('invalid-argument', 'Falta el ID del agente.');
  }

  try {
    await getDb().collection('agents').doc(String(agentId)).delete();
    return { success: true };
  } catch (error) {
    // Este es el bloque 'catch' correcto y funcional
    logger.error('Error al eliminar agente:', error);
    if (error instanceof HttpsError) {
      throw error; // Re-lanzar el HttpsError original si ya es uno
    }
    // Para cualquier otro tipo de error, crea un HttpsError nuevo
    throw new HttpsError(
      'internal',
      'Ocurrió un error en el servidor al intentar eliminar el agente.'
    );
  }
});

export const setSupervisorRole = onCall({ region: 'us-central1' }, async (request) => {
  if (request.auth?.token?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo un administrador puede asignar roles.');
  }
  const email = request.data.email;
  if (!email) {
    throw new HttpsError('invalid-argument', 'El email es requerido.');
  }
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { role: 'supervisor' });
    logger.info(
      `Rol 'supervisor' asignado a ${email} (UID: ${user.uid}) por el admin ${request.auth.uid}`
    );
    return { result: `Rol 'supervisor' asignado correctamente a ${email}` };
  } catch (error) {
    logger.error('Error al asignar rol de supervisor:', error);
    if (error.code === 'auth/user-not-found') {
      throw new HttpsError('not-found', 'No se encontró ningún usuario con ese email.');
    }
    throw new HttpsError('internal', 'Ocurrió un error interno al intentar asignar el rol.');
  }
});

export const initializeMonth = onCall({ region: 'us-central1' }, async (request) => {
  if (request.auth?.token?.role !== 'admin')
    throw new HttpsError('permission-denied', 'Solo administradores.');
  const { monthId, year, monthIndex, peopleToInitialize } = request.data;
  if (!monthId || !Array.isArray(peopleToInitialize))
    throw new HttpsError('invalid-argument', 'Faltan datos.');
  const scheduleRef = getDb().collection('schedules').doc(monthId);
  return getDb().runTransaction(async (transaction) => {
    // Corregida la condición: Comprobamos si el documento NO EXISTE para poder crearlo
    if ((await transaction.get(scheduleRef)).exists) {
      logger.info(`Documento de cuadrante ${monthId} ya existe. No se inicializará de nuevo.`);
      return { status: 'already_exists', message: 'El mes ya ha sido inicializado.' };
    }

    const firstDay = toZonedTime(new Date(year, monthIndex, 1), MADRID_TIMEZONE);
    const startOffset = (firstDay.getDay() + 6) % 7; // Lunes = 0, Domingo = 6
    let currentDay = addDays(firstDay, -startOffset);
    const initialWeeksData = {};

    for (let w = 0; w < 6; w++) {
      // Un mes puede extenderse en 6 semanas
      const weekDays = {};
      for (let d = 0; d < 7; d++) {
        // 7 días a la semana
        weekDays[d] = {
          date: getDateStringInMadridTimezone(currentDay),
          name: format(currentDay, 'EEE', { locale: es }), // Ej. 'lun', 'mar'
          number: format(currentDay, 'd'), // Ej. '1', '15'
          isCurrentMonth: currentDay.getMonth() === monthIndex,
          shifts: Object.fromEntries(
            peopleToInitialize.map((id) => [
              `agent_${id}`,
              { agentId: String(id), shiftType: 'Libre' },
            ])
          ),
        };
        currentDay = addDays(currentDay, 1);
      }
      initialWeeksData[`week${w}`] = { days: weekDays };
    }

    const agentDocs = await getDb()
      .collection('agents')
      .where(admin.firestore.FieldPath.documentId(), 'in', peopleToInitialize.map(String))
      .get();
    const peopleMap = Object.fromEntries(
      agentDocs.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }])
    );

    transaction.set(scheduleRef, {
      weeks: initialWeeksData,
      people: peopleMap,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { status: 'success', message: 'Mes inicializado correctamente.' };
  });
});

export const updateShiftV2 = onCall({ region: 'us-central1' }, async (request) => {
  if (request.auth?.token?.role !== 'admin')
    throw new HttpsError('permission-denied', 'Solo administradores.');
  const { monthId, weekKey, dayKey, agentId, newShiftType } = request.data;
  if (!monthId || !weekKey || !dayKey || !agentId)
    throw new HttpsError('invalid-argument', 'Faltan datos.');
  try {
    const scheduleRef = getDb().collection('schedules').doc(monthId);
    const dayShiftsPath = `weeks.${weekKey}.days.${dayKey}.shifts`;
    const scheduleDoc = await scheduleRef.get();
    if (!scheduleDoc.exists) {
      logger.warn(`Documento de cuadrante ${monthId} no existe al intentar actualizar turno.`);
      return;
    }
    const shifts = scheduleDoc.data().weeks[weekKey].days[dayKey].shifts || {};
    const shiftKey =
      Object.keys(shifts).find((k) => String(shifts[k].agentId) === String(agentId)) ||
      `agent_${agentId}`;
    if (newShiftType && newShiftType !== '-') {
      await scheduleRef.update({
        [`${dayShiftsPath}.${shiftKey}`]: { agentId: String(agentId), shiftType: newShiftType },
      });
    } else {
      await scheduleRef.update({
        [`${dayShiftsPath}.${shiftKey}`]: admin.firestore.FieldValue.delete(),
      });
    }
    return { success: true };
  } catch (error) {
    throw new HttpsError('internal', error.message);
  }
});

export const updateSolicitudStatus = onCall({ region: 'us-central1' }, async (request) => {
  if (request.auth?.token?.role !== 'admin')
    throw new HttpsError('permission-denied', 'Solo administradores.');
  const { solicitudId, newStatus } = request.data;
  try {
    await getDb().collection('solicitudes').doc(solicitudId).update({ status: newStatus });
    if (newStatus === 'Aprobado') await updateScheduleForPermissionRequest(solicitudId);
    return { success: true };
  } catch (error) {
    throw new HttpsError('internal', error.message);
  }
});

export const addShiftChangeRequest = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticación requerida.');
  const { requesterAgentId, targetAgentId, requesterShiftDate, targetShiftDate } = request.data;
  if (!requesterAgentId || !targetAgentId || !requesterShiftDate || !targetShiftDate)
    throw new HttpsError('invalid-argument', 'Faltan datos.');
  try {
    await getDb()
      .collection('solicitudes_cambio_turno')
      .add({
        ...request.data,
        requesterShiftDate: admin.firestore.Timestamp.fromDate(parseISO(requesterShiftDate)),
        targetShiftDate: admin.firestore.Timestamp.fromDate(parseISO(targetShiftDate)),
        status: 'Pendiente_Target',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    return { success: true };
  } catch (error) {
    throw new HttpsError('internal', error.message);
  }
});

export const respondToShiftChangeRequest = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticación requerida.');
  const { changeId, newStatus } = request.data;
  const requestRef = getDb().collection('solicitudes_cambio_turno').doc(changeId);
  const requestDoc = await requestRef.get();
  if (!requestDoc.exists) throw new HttpsError('not-found', 'Solicitud no encontrada.');
  await requestRef.update({
    status: newStatus,
    adminNotified: newStatus.startsWith('Aprobado') ? false : admin.firestore.FieldValue.delete(),
  });
  if (newStatus === 'Aprobado_Ambos') {
    const d = requestDoc.data();
    await findAndReplaceShiftInSchedule(
      d.requesterShiftDate.toDate(),
      d.requesterAgentId,
      d.targetShiftType
    );
    await findAndReplaceShiftInSchedule(
      d.targetShiftDate.toDate(),
      d.targetAgentId,
      d.requesterShiftType
    );
  }
  return { success: true };
});

export const getShiftChangeRequestsCallable = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticación requerida.');
  const { status, agentId } = request.data;
  const ref = getDb().collection('solicitudes_cambio_turno');
  let queries = [];
  if (request.auth.token.role === 'admin' && agentId && agentId !== 'all') {
    queries.push(ref.where('requesterAgentId', '==', String(agentId)).get());
    queries.push(ref.where('targetAgentId', '==', String(agentId)).get());
  } else if (request.auth.token.role === 'admin') {
    queries.push(ref.orderBy('createdAt', 'desc').get());
  } else {
    queries.push(ref.where('requesterAgentId', '==', String(request.auth.token.agentId)).get());
    queries.push(ref.where('targetAgentId', '==', String(request.auth.token.agentId)).get());
  }
  const snapshots = await Promise.all(queries);
  const results = Array.from(
    new Map(snapshots.flatMap((s) => s.docs).map((d) => [d.id, { id: d.id, ...d.data() }])).values()
  );
  const filteredResults = status ? results.filter((r) => r.status === status) : results;
  return {
    success: true,
    data: filteredResults.map((d) => ({
      ...d,
      createdAt: d.createdAt.toDate().toISOString(),
      requesterShiftDate: d.requesterShiftDate.toDate().toISOString(),
      targetShiftDate: d.targetShiftDate.toDate().toISOString(),
    })),
  };
});

export const markShiftChangeNotificationAsSeen = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticación requerida.');
    await getDb()
      .collection('solicitudes_cambio_turno')
      .doc(request.data.changeId)
      .update({ adminNotified: true });
    return { success: true };
  }
);

export const addMarkedDateCallable = onCall({ region: 'us-central1' }, async (request) => {
  if (request.auth?.token?.role !== 'admin')
    throw new HttpsError('permission-denied', 'Solo administradores.');
  const { date, type, title } = request.data;
  if (!date || !type || !title) throw new HttpsError('invalid-argument', 'Faltan datos.');
  await getDb()
    .collection('markedDates')
    .add({ ...request.data, date: admin.firestore.Timestamp.fromDate(parseISO(date)) });
  return { success: true };
});

export const migrateAgentIdsInSolicitudes = onCall({ region: 'us-central1' }, async (request) => {
  if (request.auth?.token?.role !== 'admin')
    throw new HttpsError('permission-denied', 'Solo para administradores.');
  const batch = getDb().batch();
  const solicitudesRef = getDb().collection('solicitudes');
  let processed = 0,
    updated = 0;
  try {
    const snapshot = await solicitudesRef.get();
    snapshot.forEach((doc) => {
      processed++;
      if (doc.data().agentId && typeof doc.data().agentId === 'number') {
        batch.update(doc.ref, { agentId: String(doc.data().agentId) });
        updated++;
      }
    });
    await batch.commit();
    return { success: true, message: 'Migración completada.', processed, updated };
  } catch (error) {
    logger.error('Error en migración:', error);
    throw new HttpsError('internal', error.message);
  }
});

// --- FUNCIÓN QUE USA PDFKIT (Importación dinámica) ---
export const generatePdfReport = onCall({ region: 'us-central1' }, async (request) => {
  // [SOLUCIÓN] Importación dinámica de PDFDocument DENTRO de la función
  const PDFDocument = (await import('pdfkit')).default;

  if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticación requerida.');
  const agentId = request.data.agentId;
  if (!agentId) throw new HttpsError('invalid-argument', 'Falta ID del agente.');
  try {
    // Instancia PDFDocument solo cuando la función se ejecuta
    const doc = new PDFDocument();
    // ... el resto de tu lógica para generar el PDF
    const pdfBuffer = Buffer.from('PDF de ejemplo para un agente.'); // Placeholder
    return { success: true, pdfBase64: pdfBuffer.toString('base64') };
  } catch (error) {
    logger.error('Error en generatePdfReport:', error);
    throw new HttpsError('internal', error.message);
  }
});

export const generarInformeManualPDF = onCall(
  { region: 'us-central1', cors: true, memory: '1GB', timeoutSeconds: 120 },
  async (request) => {
    
    // --- LOG 1: PUNTO DE ENTRADA Y DATOS RECIBIDOS ---
    // Esto nos muestra exactamente qué datos llegan desde la aplicación web.
    logger.info("--- Invocando generarInformeManualPDF ---", { data: request.data });

    if (!request.auth) {
      logger.error("Intento de ejecución sin autenticación.");
      throw new HttpsError('unauthenticated', 'Autenticación requerida.');
    }

    const userRole = request.auth.token.role || 'guard';
    
    // --- LOG 2: VERIFICACIÓN DE ROL Y USUARIO ---
    logger.info(`Ejecución por usuario con rol: ${userRole}, Agent ID: ${request.auth.token.agentId}`);

    const { startDate, endDate, agentIds, allAgents } = request.data;
    
    // Verificamos que las fechas y los agentes lleguen correctamente
    if (!startDate || !endDate) {
        logger.error("Error: Faltan startDate o endDate en la solicitud.", request.data);
        throw new HttpsError('invalid-argument', 'Se requieren fechas de inicio y fin.');
    }

    let finalAgentIds = [];
    if (userRole === 'admin' || userRole === 'supervisor') {
        if (allAgents) {
            const agentsSnapshot = await getDb().collection('agents').get();
            finalAgentIds = agentsSnapshot.docs.map((doc) => doc.id);
        } else {
            finalAgentIds = agentIds;
        }
    } else {
        finalAgentIds = [request.auth.token.agentId];
    }

    // --- LOG 3: AGENTES A PROCESAR ---
    // Crucial para saber si estamos buscando los datos de los agentes correctos.
    logger.info('Generando informe para los siguientes agentIds:', finalAgentIds);

    if (!finalAgentIds || finalAgentIds.length === 0) {
      logger.error('Error: No se especificaron agentes para el informe.');
      throw new HttpsError('invalid-argument', 'No se especificaron agentes.');
    }

    try {
      const servicesSnap = await getDb()
        .collection('extraordinaryServices')
        .where('agentId', 'in', finalAgentIds)
        .where('date', '>=', parseISO(startDate))
        .where('date', '<=', parseISO(endDate))
        .get();

      // --- LOG 4: RESULTADO DE LA CONSULTA A LA BASE DE DATOS ---
      // Si esto es 0, el problema está en los filtros de fecha o los IDs de agente.
      logger.info(`Consulta a Firestore encontró ${servicesSnap.size} servicios.`);

      if (servicesSnap.empty) {
        logger.warn('No se encontraron servicios para el rango y agentes especificados. Devolviendo PDF vacío.');
        return { pdfBase64: null, message: 'No se encontraron servicios.' };
      }

      const agentsQuery = await getDb().collection('agents').get();
      const agentsMap = new Map(
        agentsQuery.docs.map((doc) => [doc.id, doc.data().name])
      );
      
      const servicesByAgent = {};
      
      servicesSnap.forEach((doc) => {
        const service = { id: doc.id, ...doc.data() };
        const agentId = service.agentId;
        
        if (!servicesByAgent[agentId]) {
          servicesByAgent[agentId] = { 
              name: agentsMap.get(agentId) || `Agente Desconocido (${agentId})`, 
              services: [] 
            };
        }
        servicesByAgent[agentId].services.push(service);
      });

      // --- LOG 5: ESTRUCTURA DE DATOS FINAL ---
      // Este es el log más importante. Nos muestra la estructura de datos que se enviará al generador de PDF.
      // Aquí podremos ver si las horas, tipos, etc., son correctos.
      logger.info('Estructura de datos procesada (servicesByAgent):', JSON.stringify(servicesByAgent, null, 2));

      // --- LOG 6: INICIO DE GENERACIÓN DE PDF ---
      logger.info('Iniciando la llamada a generateReportPdfContent...');
      
      const pdfBuffer = await generateReportPdfContent(
        {
          servicesByAgent,
          periodStartDateObj: parseISO(startDate),
          periodEndDateObj: parseISO(endDate),
        },
        await downloadLogoFromStorage(),
        userRole
      );

      // --- LOG 7: ÉXITO ---
      logger.info('PDF generado con éxito. Devolviendo respuesta al cliente.');

      return { pdfBase64: pdfBuffer.toString('base64'), message: 'Informe generado.' };

    } catch (error) {
        logger.error("Error catastrófico en generarInformeManualPDF:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError('internal', 'Ocurrió un error interno al generar el informe.', error.message);
    }
  }
);

/**
 * Genera el informe mensual de servicios extraordinarios en PDF y lo envía
 * creando un documento en la colección 'mail' para la extensión Trigger Email.
 */
export const generarYEnviarInformeServiciosExtra = onSchedule(
  {
    region: 'us-central1',
    schedule: '0 10 1 * *',
    timeZone: 'Europe/Madrid',
  },
  async () => {
    logger.info('Iniciando la generación del informe mensual de servicios extraordinarios.');
    const db = getDb();

    try {
      const start = startOfMonth(subMonths(new Date(), 1));
      const end = endOfMonth(subMonths(new Date(), 1));
      const servicesSnap = await db
        .collection('extraordinaryServices')
        .where('date', '>=', start)
        .where('date', '<=', end)
        .get();

      if (servicesSnap.empty) {
        logger.info(
          'No hay servicios extraordinarios para el mes anterior. No se enviará informe.'
        );
        return null;
      }

      const agentsMap = new Map(
        (await db.collection('agents').get()).docs.map((doc) => [doc.id, doc.data().name])
      );
      const servicesByAgent = {};
      servicesSnap.forEach((doc) => {
        const s = doc.data();
        if (!servicesByAgent[s.agentId])
          servicesByAgent[s.agentId] = { name: agentsMap.get(s.agentId), services: [] };
        servicesByAgent[s.agentId].services.push(s);
      });

      // La generación del PDF no cambia
      const pdfBuffer = await generateReportPdfContent(
        { servicesByAgent, periodStartDateObj: start, periodEndDateObj: end },
        await downloadLogoFromStorage()
      );

      const monthYear = format(start, 'MMMM yyyy', { locale: es });
      const supervisorEmailsDoc = await db.collection('configuration').doc('notifications').get();
      const emails = supervisorEmailsDoc.data()?.supervisorEmails || ['ejemplo@tu-dominio.com']; // Fallback por si no está configurado

      // ✅ LÓGICA MODIFICADA: Creamos el documento para la extensión Trigger Email
      await db.collection('mail').add({
        to: emails, // La extensión permite enviar a un array
        message: {
          subject: `Informe de Servicios Extraordinarios - ${monthYear}`,
          html: `<p>Adjunto se encuentra el informe mensual de servicios extraordinarios para ${monthYear}.</p><p>Este correo ha sido generado automáticamente.</p>`,
          attachments: [
            {
              filename: `informe_servicios_extra_${monthYear}.pdf`,
              content: pdfBuffer.toString('base64'), // El PDF se envía como base64
              encoding: 'base64',
            },
          ],
        },
      });

      logger.info(`Documento de correo para el informe mensual de ${monthYear} creado con éxito.`);
      return null;
    } catch (error) {
      logger.error(
        'Error al generar o enviar el informe mensual de servicios extraordinarios:',
        error
      );
      return null;
    }
  }
);

export const getAdminDashboardStats = onCall({ region: 'us-central1' }, async (request) => {
  if (request.auth?.token?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Acceso denegado.');
  }

  const { startDate, endDate } = request.data;
  if (!startDate || !endDate) {
    throw new HttpsError('invalid-argument', 'Se requieren fechas de inicio y fin.');
  }

  const db = getDb();
  const reportsRef = db.collection('serviceReports');

  // Ajustado para el SDK de Admin: usar Timestamp.fromDate para las fechas
  const querySnapshot = await reportsRef
    .where('created_at', '>=', admin.firestore.Timestamp.fromDate(new Date(startDate)))
    .where('created_at', '<=', admin.firestore.Timestamp.fromDate(new Date(endDate)))
    .get();

  let stats = {
    totalReports: querySnapshot.size,
    requerimientosRecibidos: 0,
    requerimientosResueltos: 0,
    actuaciones: {},
    // ✅ AÑADIMOS LAS NUEVAS LISTAS
    pendingRequerimientos: [],
    resolvedRequerimientos: [],
  };

  for (const reportDoc of querySnapshot.docs) {
    const reportData = reportDoc.data();

    // 1. Sumamos las actuaciones del campo "summary"
    if (reportData.summary) {
      for (const [key, value] of Object.entries(reportData.summary)) {
        stats.actuaciones[key] = (stats.actuaciones[key] || 0) + value;
      }
    }

    // 2. Contamos los requerimientos de la subcolección y los clasificamos
    const reqsRef = reportDoc.ref.collection('requerimientos');
    const reqsSnap = await reqsRef.get();

    reqsSnap.forEach((reqDoc) => {
      stats.requerimientosRecibidos++;
      const reqData = {
        id: reqDoc.id,
        reportId: reportDoc.id, // ID del parte al que pertenece
        reportTitle: reportData.order_title || 'N/A', // Asumiendo que order_title está en reportData
        description: reqDoc.data().description,
        isResolved: reqDoc.data().isResolved,
        createdAt: reqDoc.data().createdAt ? reqDoc.data().createdAt.toDate().toISOString() : null,
        resolvedAt: reqDoc.data().resolvedAt
          ? reqDoc.data().resolvedAt.toDate().toISOString()
          : null,
      };

      if (reqData.isResolved) {
        stats.requerimientosResueltos++;
        stats.resolvedRequerimientos.push(reqData);
      } else {
        stats.pendingRequerimientos.push(reqData);
      }
    });
  }

  return { success: true, stats };
});

/**
 * Se activa cuando un parte de servicio se actualiza. Si el estado cambia a 'pending_review',
 * recopila los datos y CREA UN DOCUMENTO en la colección 'mail' para la extensión
 * "Trigger Email".
 */
export const onReportSubmittedForReview = onDocumentUpdated(
  'serviceReports/{reportId}',
  async (event) => {
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();

    // Nos aseguramos de que la función solo se ejecute cuando el estado cambia A 'pending_review'
    if (beforeData.status === afterData.status || afterData.status !== 'pending_review') {
      logger.info(
        `El estado del parte ${event.params.reportId} no cambió a 'pending_review'. No se creará documento de correo.`
      );
      return null;
    }

    logger.info(
      `El parte ${event.params.reportId} ha sido enviado a revisión. Creando documento para Trigger Email.`
    );
    const db = getDb();

    try {
      // 1. Obtener la lista de correos de los supervisores desde la configuración
      const configDoc = await db.collection('configuration').doc('notifications').get();
      const supervisorEmails = configDoc.data()?.supervisorEmails;

      if (!supervisorEmails || supervisorEmails.length === 0) {
        logger.warn(
          "No hay correos de supervisores configurados en 'configuration/notifications'. No se puede crear el correo."
        );
        return null;
      }

      // 2. Recopilar todos los datos necesarios para el correo
      const orderDoc = await db.collection('serviceOrders').doc(afterData.order_id).get();
      const orderData = orderDoc.data();

      const entriesSnap = await db
        .collection('serviceReports')
        .doc(event.params.reportId)
        .collection('reportEntries')
        .orderBy('entry_time')
        .get();
      const entries = entriesSnap.docs.map((doc) => doc.data());

      // 3. Formatear el cuerpo del correo en HTML
      let emailBody = `
            <h1>Revisión de Parte de Servicio</h1>
            <p>El siguiente parte de servicio ha sido completado y requiere su validación.</p>
            <h2>Detalles de la Orden</h2>
            <ul>
                <li><strong>Nº Registro:</strong> ${orderData.order_reg_number || 'N/A'}</li>
                <li><strong>Título:</strong> ${orderData.title}</li>
                <li><strong>Fecha del Servicio:</strong> ${format(orderData.service_date.toDate(), 'dd/MM/yyyy', { locale: es })}</li>
                <li><strong>Turno:</strong> ${orderData.service_shift}</li>
            </ul>
            <h2>Novedades Registradas</h2>
        `;

      if (entries.length > 0) {
        emailBody +=
          '<table border="1" cellpadding="5" style="border-collapse: collapse; width: 100%;">';
        emailBody +=
          '<thead><tr><th>Hora</th><th>Agente</th><th>Descripción</th></tr></thead><tbody>';
        entries.forEach((entry) => {
          emailBody += `<tr>
                    <td>${format(entry.entry_time.toDate(), 'HH:mm:ss', { locale: es })}</td>
                    <td>${entry.created_by_agent_id}</td>
                    <td>${entry.description.replace(/\n/g, '<br>')}</td>
                </tr>`;
        });
        emailBody += '</tbody></table>';
      } else {
        emailBody += '<p>No se registraron novedades.</p>';
      }

      // 4. ✅ Crear el documento en la colección 'mail' que la extensión está escuchando
      await db.collection('mail').add({
        to: supervisorEmails, // La extensión permite enviar a un array
        message: {
          subject: `Nuevo Parte de Servicio para Revisar: ${orderData.title}`,
          html: emailBody,
        },
      });

      logger.info(`Documento de correo para el parte ${event.params.reportId} creado con éxito.`);
      return null;
    } catch (error) {
      logger.error(
        `Error al crear el documento de correo para el parte ${event.params.reportId}:`,
        error
      );
      return null;
    }
  }
);

// =========================================================================================
// === ✅ FASE A: NUEVAS FUNCIONES PARA EL MÓDULO DE REGISTRO ELECTRÓNICO ===
// =========================================================================================

/**
 * Crea un nuevo documento de registro, genera un número de registro único con prefijo,
 * y opcionalmente crea un PDF a partir de una plantilla que se guarda en Cloud Storage.
 *
 * @param {object} data - Objeto que contiene los datos enviados desde el cliente.
 * @param {string} data.documentType - El tipo de documento a crear (ej. 'informe', 'oficio_judicial').
 * @param {object} data.data - Objeto con los detalles del registro a guardar.
 * @param {string} context - Información de autenticación del usuario que realiza la llamada.
 * @returns {Promise<{success: boolean, id: string, registration_number: string}>}
 * Un objeto indicando el éxito, el ID del nuevo documento y su número de registro.
 */
export const createRegistro = onCall(
  {
    region: 'us-central1',
    memory: '1GB',
    timeoutSeconds: 300,
  },
  async (request) => {
    // 1. Validación (se mantiene igual)
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado.');
    }
    const { documentType, data: registroData } = request.data;
    if (!documentType || !registroData || !registroData.direction) {
      throw new HttpsError('invalid-argument', 'Faltan datos requeridos (documentType, data, direction).');
    }

    // 2. Preparación de Recursos (se mantiene igual)
    const db = getDb();
    const year = new Date().getFullYear();
    const agentId = request.auth.token.agentId;

    try {
      // =======================================================================
      // == INICIO: LÓGICA DE GENERACIÓN DE NÚMERO CORRELATIVO (MODIFICADA)  ==
      // =======================================================================
      const registration_number = await db.runTransaction(async (transaction) => {
        let counterRef;
        let prefix;

        if (registroData.direction === 'entrada') {
          // --- LÓGICA PARA REGISTROS DE ENTRADA (UN SOLO CONTADOR ANUAL) ---
          counterRef = db.collection('counters').doc(`registros_entrada_${year}`);
          prefix = `${year}-`; // Prefijo simple para todas las entradas

        } else { // Asumimos que es 'salida'
          // --- LÓGICA PARA REGISTROS DE SALIDA (UN CONTADOR POR TIPO DE DOCUMENTO) ---
          counterRef = db.collection('counters').doc(`registros_salida_${documentType}_${year}`);
          const typePrefix = documentTypePrefixes[documentType] || 'DOC';
          prefix = `${typePrefix}-${year}-`;
        }

        const counterDoc = await transaction.get(counterRef);
        let nextNumber = 1;
        if (counterDoc.exists) {
          nextNumber = counterDoc.data().count + 1;
        }
        transaction.set(counterRef, { count: nextNumber }, { merge: true });

        return `${prefix}${String(nextNumber).padStart(4, '0')}`;
      });
      // =======================================================================
      // == FIN: LÓGICA DE GENERACIÓN DE NÚMERO CORRELATIVO                 ==
      // =======================================================================

      if (!registration_number) {
        throw new HttpsError('internal', 'No se pudo generar el número de registro en la transacción.');
      }
      
      const newDocument = {
        ...registroData,
        registrationNumber: registration_number, // Usamos el nombre de campo consistente
        documentType,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdByAgentId: agentId,
        createdByUid: request.auth.uid,
        pdfUrl: '',
      };
      const docRef = await db.collection('registros').add(newDocument);

      // 5. Preparación y Generación del PDF (Solo si se usó una plantilla)
      // Para los registros de entrada, es posible que no se genere un PDF en este paso,
      // sino que simplemente se adjunte el documento original.
      // Este código se ejecutará si 'templateUsed' viene en los datos.
      if (registroData.templateUsed) {
        const templateSnap = await db.collection('documentTemplates').doc(registroData.templateUsed).get();
        if (!templateSnap.exists) {
          throw new HttpsError('not-found', 'La plantilla para el PDF no fue encontrada.');
        }
        let htmlContent = unescapeHtml(templateSnap.data().content);

        const fechaActual = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: es });
        const signingAgentTips = (registroData.details.AGENTES_FIRMANTES || []).join(', ');
        
        const dataForHandlebars = {
          ...registroData.details,
          NUM_REGISTRO: registration_number,
          FECHA_ACTUAL: fechaActual,
          AGENTES_FIRMANTES: signingAgentTips,
        };

        if (dataForHandlebars.agentes && Array.isArray(dataForHandlebars.agentes)) {
            dataForHandlebars.agentes = dataForHandlebars.agentes.map(agente => ({
                ...agente,
                tramos_html: (agente.tramos || '').split('\n').map(s => `<li>${s.trim()}</li>`).join('')
            }));
        }

        const compiledTemplate = Handlebars.compile(htmlContent);
        const renderedBodyHtml = compiledTemplate(dataForHandlebars);

        const logoBuffer = await downloadLogoFromStorage();
        const logoBase64 = logoBuffer ? `data:image/png;base64,${logoBuffer.toString('base64')}` : '';

        const headerTemplate = `
          <div style="width: 100%; font-family: Arial, sans-serif; font-size: 12px; display: flex; justify-content: space-between; align-items: center; padding: 10px 1.5cm 0; box-sizing: border-box;">
              <img src="${logoBase64}" style="width: 75px; height: auto;">
              <div style="text-align: right; line-height: 1.5;">
                  <strong style="font-size: 14px;">Ayuntamiento de Chauchina</strong><br>
                  Jefatura de Policía Local
              </div>
          </div>
        `;
        const footerTemplate = `
          <div style="width: 100%; font-family: Arial, sans-serif; font-size: 9px; text-align: center; color: #555; padding: 0 1.5cm; box-sizing: border-box; border-top: 1px solid #ccc; padding-top: 5px;">
              Plaza Constitución, 12, Chauchina, 18330 (Granada) | Página <span class="pageNumber"></span> de <span class="totalPages"></span>
          </div>
        `;
        
        const fullPageHtml = `<html><head><meta charset="UTF-8"></head><body>${renderedBodyHtml}</body></html>`;

        const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.setContent(fullPageHtml, { waitUntil: 'networkidle0' });

        const pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          displayHeaderFooter: true,
          headerTemplate: headerTemplate,
          footerTemplate: footerTemplate,
          margin: { top: '3.5cm', bottom: '2cm', right: '1.5cm', left: '1.5cm' },
        });
        await browser.close();

        // 6. Guardado en Storage y actualización del documento
        const filePath = `registros/${documentType}/${registration_number}.pdf`;
        const file = bucket.file(filePath);
        await file.save(pdfBuffer, { metadata: { contentType: 'application/pdf' } });

        const [pdfUrl] = await file.getSignedUrl({ action: 'read', expires: '03-09-2491' });
        await docRef.update({ pdfUrl: pdfUrl });
      }

      // 7. Retorno Exitoso
      return { success: true, id: docRef.id, registration_number };
    } catch (error) {
      logger.error(`Error al crear el registro y PDF:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'No se pudo crear el documento de registro.', error.message);
    }
  }
);

/**
 * Actualiza un documento de registro existente.
 * Permite la edición a administradores o al agente que creó el registro.
 */
export const updateRegistro = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado.');
  }
  const { recordId, updateData } = request.data;
  if (!recordId || !updateData) {
    throw new HttpsError(
      'invalid-argument',
      'Faltan el ID del registro o los datos para actualizar.'
    );
  }

  const db = getDb();
  const recordRef = db.collection('registros').doc(recordId);

  try {
    const docSnap = await recordRef.get();
    if (!docSnap.exists) {
      throw new HttpsError('not-found', 'El registro no fue encontrado.');
    }

    const record = docSnap.data();
    const userRole = request.auth.token.role;
    const userAgentId = request.auth.token.agentId;

    // Comprobación de permisos: O eres admin, o eres el dueño del registro.
    if (userRole !== 'admin' && record.createdByAgentId !== userAgentId) {
      throw new HttpsError('permission-denied', 'No tienes permiso para editar este registro.');
    }

    // Añadimos campos de auditoría
    const finalUpdateData = {
      ...updateData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedByAgentId: userAgentId,
    };

    await recordRef.update(finalUpdateData);
    logger.info(`Registro ${recordId} actualizado por agente ${userAgentId}.`);
    return { success: true, id: recordId };
  } catch (error) {
    logger.error(`Error al actualizar el registro ${recordId}:`, error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'No se pudo actualizar el documento de registro.');
  }
});

/**
 * Realiza una eliminación suave (soft delete) de un registro.
 * En lugar de borrarlo, lo actualiza con un estado 'eliminado' y un motivo.
 * Acción restringida solo a administradores.
 */
export const markRegistroAsDeleted = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado.');
  }
  const { recordId, reason } = request.data;
  if (!recordId || !reason) {
    throw new HttpsError(
      'invalid-argument',
      'Se requiere el ID del registro y un motivo para la eliminación.'
    );
  }

  const userRole = request.auth.token.role;
  const userAgentId = request.auth.token.agentId;

  // Comprobación de permisos estricta: Solo admins pueden eliminar.
  if (userRole !== 'admin') {
    throw new HttpsError('permission-denied', 'No tienes permiso para eliminar registros.');
  }

  const db = getDb();
  const recordRef = db.collection('registros').doc(recordId);

  try {
    const updatePayload = {
      status: 'eliminado',
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      deletedByAgentId: userAgentId,
      deletionReason: reason,
    };

    await recordRef.update(updatePayload);

    logger.warn(
      `Registro ${recordId} marcado como eliminado por admin ${userAgentId}. Motivo: ${reason}`
    );
    return { success: true };
  } catch (error) {
    logger.error(`Error al marcar como eliminado el registro ${recordId}:`, error);
    throw new HttpsError('internal', 'No se pudo actualizar el estado del registro.');
  }
});

/**
 * Crea una nueva plantilla de documento en la colección 'documentTemplates'.
 * Solo para administradores.
 */
export const createDocumentTemplate = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth || request.auth.token.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo los administradores pueden crear plantillas.');
  }

  const templateData = request.data;
  if (!templateData || !templateData.templateName || !templateData.content) {
    throw new HttpsError('invalid-argument', 'Faltan datos requeridos para la plantilla.');
  }

  const db = getDb();
  try {
    const newTemplate = {
      ...templateData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByAgentId: request.auth.token.agentId,
    };
    const docRef = await db.collection('documentTemplates').add(newTemplate);
    logger.info(`Nueva plantilla creada por ${request.auth.token.agentId} con ID: ${docRef.id}`);
    return { success: true, id: docRef.id };
  } catch (error) {
    logger.error('Error al crear la plantilla:', error);
    throw new HttpsError('internal', 'No se pudo crear la plantilla.');
  }
});

/**
 * Actualiza una plantilla de documento existente.
 * Solo para administradores.
 */
export const updateDocumentTemplate = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth || request.auth.token.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo los administradores pueden editar plantillas.');
  }

  const { templateId, updateData } = request.data;
  if (!templateId || !updateData) {
    throw new HttpsError('invalid-argument', 'Faltan el ID o los datos de la plantilla.');
  }

  const db = getDb();
  const templateRef = db.collection('documentTemplates').doc(templateId);

  try {
    const finalUpdateData = {
      ...updateData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedByAgentId: request.auth.token.agentId,
    };
    await templateRef.update(finalUpdateData);
    logger.info(`Plantilla ${templateId} actualizada por ${request.auth.token.agentId}`);
    return { success: true, id: templateId };
  } catch (error) {
    logger.error(`Error al actualizar la plantilla ${templateId}:`, error);
    throw new HttpsError('internal', 'No se pudo actualizar la plantilla.');
  }
});

/**
 * Actualiza los datos de un registro de croquis existente.
 * Solo el creador original o un administrador pueden editar.
 */
export const updateSketch = onCall(
  {
    region: 'us-central1',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado.');
    }

    const { sketchId, updateData } = request.data;
    if (!sketchId || !updateData) {
      throw new HttpsError(
        'invalid-argument',
        'Faltan el ID del croquis o los datos para actualizar.'
      );
    }

    const db = getDb();
    const sketchRef = db.collection('sketches').doc(sketchId);

    try {
      const docSnap = await sketchRef.get();
      if (!docSnap.exists) {
        throw new HttpsError('not-found', 'El croquis no fue encontrado.');
      }

      const sketch = docSnap.data();
      const userRole = request.auth.token.role;
      const userUid = request.auth.uid;

      // Comprobación de permisos: O eres admin, o eres el dueño del registro.
      if (userRole !== 'admin' && sketch.createdByUid !== userUid) {
        throw new HttpsError('permission-denied', 'No tienes permiso para editar este croquis.');
      }

      // --- ✅ INICIO DE LA CORRECCIÓN ---

      // Copiamos los datos para poder modificarlos de forma segura.
      const finalUpdateData = { ...updateData };

      // Si 'fechaSuceso' viene como texto (string), la convertimos a un objeto Date.
      // El SDK de Admin de Firestore se encargará de convertir el objeto Date a Timestamp al guardar.
      if (finalUpdateData.fechaSuceso && typeof finalUpdateData.fechaSuceso === 'string') {
        finalUpdateData.fechaSuceso = new Date(finalUpdateData.fechaSuceso);
      }

      // Añadimos los campos de auditoría.
      finalUpdateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      finalUpdateData.updatedByUid = userUid;

      // --- FIN DE LA CORRECCIÓN ---

      await sketchRef.update(finalUpdateData);
      return { success: true, id: sketchId };
    } catch (error) {
      console.error(`Error al actualizar el croquis ${sketchId}:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'No se pudo actualizar el croquis.');
    }
  }
);

export const generateSketchPdf = onCall(
  {
    region: 'us-central1',
    memory: '1GB',
    timeoutSeconds: 120,
  },
  async (request) => {
    // 1. --- VERIFICACIÓN DE PERMISOS Y DATOS DE ENTRADA ---
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'El usuario debe estar autenticado para generar el PDF.'
      );
    }
    const { sketchId } = request.data;
    if (!sketchId) {
      throw new HttpsError(
        'invalid-argument',
        'Falta el ID del croquis (sketchId) en la solicitud.'
      );
    }

    logger.info(`Iniciando generación de PDF para el croquis: ${sketchId}`);
    const db = getDb();

    // 2. --- OBTENCIÓN DE DATOS DEL CROQUIS ---
    const sketchDoc = await db.collection('sketches').doc(sketchId).get();
    if (!sketchDoc.exists) {
      throw new HttpsError(
        'not-found',
        'El croquis solicitado no fue encontrado en la base de datos.'
      );
    }
    const sketchData = sketchDoc.data();

    // 3. --- PREPARACIÓN DE ACTIVOS (IMAGEN DEL CROQUIS Y LOGO) ---
    let imageHtml = '<p class="no-image">[No se adjuntó imagen de croquis]</p>';
    if (sketchData.imageUrl) {
      try {
        const bucket = getStorage().bucket(BUCKET_NAME);
        const filePath = decodeURIComponent(sketchData.imageUrl.split('/o/')[1].split('?')[0]);
        logger.info(`Descargando imagen del croquis desde: ${filePath}`);

        const file = bucket.file(filePath);
        const [imageBuffer] = await file.download();
        const imageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
        imageHtml = `<img src="${imageBase64}" alt="Croquis del accidente" class="croquis-image">`;
      } catch (imgError) {
        logger.error(`Fallo al descargar la imagen del croquis ${sketchId}:`, imgError.message);
        imageHtml =
          '<p class="no-image">[Error al cargar la imagen del croquis. Verifique los permisos del bucket.]</p>';
      }
    }

    const logoBuffer = await downloadLogoFromStorage();
    const logoBase64 = logoBuffer ? `data:image/png;base64,${logoBuffer.toString('base64')}` : '';

    // 4. --- FORMATEO DE DATOS PARA EL HTML ---
    let fechaFormateada = 'No especificada';
    if (sketchData.fechaSuceso && typeof sketchData.fechaSuceso.toDate === 'function') {
      const dateInMadrid = toZonedTime(sketchData.fechaSuceso.toDate(), MADRID_TIMEZONE);
      fechaFormateada = format(dateInMadrid, 'dd/MM/yyyy HH:mm', { locale: es });
    }

    let leyendaHtml = '';
    if (sketchData.leyenda && sketchData.leyenda.trim().length > 0) {
      const leyendaItems = sketchData.leyenda
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      if (leyendaItems.length > 0) {
        leyendaHtml = `
                <div class="leyenda-section">
                    <h3>LEYENDA</h3>
                    <div class="leyenda-grid">
                        ${leyendaItems.map((item) => `<div class="leyenda-item">${item}</div>`).join('')}
                    </div>
                </div>
            `;
      }
    }

    // 5. --- DEFINICIÓN DEL CSS Y LA PLANTILLA HTML ---
    const css = `<style>
        body { font-family: Arial, Helvetica, sans-serif; margin: 0; font-size: 12px; color: #333; }
        .page-container { margin: 2cm; }
        .header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 15px; border-bottom: 2px solid #000; }
        .header img { width: 80px; }
        .header-info { text-align: right; font-size: 10px; color: #555; }
        h1 { text-align: center; margin: 40px 0; font-size: 18px; text-transform: uppercase; }
        .info-grid { display: grid; grid-template-columns: 150px auto; gap: 8px 10px; margin-bottom: 30px; font-size: 13px; }
        .info-grid p { margin: 0; }
        .info-grid strong { font-weight: bold; color: #000; }
        .croquis-section { margin-top: 20px; page-break-inside: avoid; }
        .croquis-image { max-width: 100%; height: auto; border: 1px solid #ddd; margin-top: 10px; }
        .leyenda-section { margin-top: 30px; border-top: 1px solid #ccc; padding-top: 15px; page-break-inside: avoid; }
        .leyenda-section h3 { text-align: center; margin-bottom: 15px; font-size: 14px; }
        .leyenda-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 5px 20px; }
        .leyenda-item { padding: 2px 0; }
        .no-image { color: #888; text-align: center; margin-top: 20px; font-style: italic; }
    </style>`;

    const html = `
        <html><head><meta charset="UTF-8">${css}</head><body>
            <div class="page-container">
                <div class="header">
                    ${logoBase64 ? `<img src="${logoBase64}" alt="Logo del Ayuntamiento">` : ''}
                    <div class="header-info">
                        <strong>POLICÍA LOCAL</strong><br>
                        Jefatura de Chauchina
                    </div>
                </div>
                <h1>Croquis de Accidente de Tráfico</h1>
                <div class="info-grid">
                    <p><strong>Lugar del suceso:</strong></p> <p>${sketchData.lugar || 'No especificado'}</p>
                    <p><strong>Fecha y Hora:</strong></p> <p>${fechaFormateada}</p>
                    <p><strong>Vehículos / Implicados:</strong></p> <p>${sketchData.implicados || 'No especificados'}</p>
                    <p><strong>Diligencias / Documento:</strong></p> <p>${sketchData.documentoRealizado || 'Ninguno'}</p>
                </div>
                <div class="croquis-section">
                    ${imageHtml}
                </div>
                ${leyendaHtml}
            </div>
            
        </body>
        </html>
    `;

    // 6. --- RENDERIZADO Y GUARDADO DEL PDF ---
    try {
      logger.info(`[Paso 1] Preparando para iniciar Puppeteer...`);
      const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

      logger.info(`[Paso 2] Puppeteer iniciado. Creando nueva página...`);
      const page = await browser.newPage();

      logger.info(`[Paso 3] Página creada. Estableciendo contenido HTML...`);
      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      logger.info(`[Paso 4] Contenido establecido. Generando buffer del PDF...`);
      const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });

      logger.info(`[Paso 5] Buffer del PDF generado. Cerrando Puppeteer...`);
      await browser.close();

      if (pdfBuffer.length === 0) {
        throw new HttpsError('internal', 'El PDF generado por el servidor estaba vacío.');
      }

      logger.info(`[Paso 6] Puppeteer cerrado. Guardando PDF en Storage...`);
      const bucket = getStorage().bucket(BUCKET_NAME);
      const fileName = `sketches/pdfs/croquis_${sketchId}_${Date.now()}.pdf`;
      const file = bucket.file(fileName);
      await file.save(pdfBuffer, { metadata: { contentType: 'application/pdf' } });

      logger.info(`[Paso 7] PDF guardado. Generando URL firmada...`);
      const options = { version: 'v4', action: 'read', expires: Date.now() + 15 * 60 * 1000 }; // 15 minutos de validez
      const [signedUrl] = await file.getSignedUrl(options);

      logger.info(`[Paso 8] URL generada. Proceso completado con éxito.`);
      return { success: true, pdfUrl: signedUrl };
    } catch (error) {
      logger.error(`Error al renderizar o guardar el PDF para el croquis ${sketchId}:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'No se pudo procesar el PDF.');
    }
  }
);

export const deleteSketch = onCall(
  {
    region: 'us-central1',
  },
  async (request) => {
    // 1. Verificar permisos
    if (request.auth?.token?.role !== 'admin') {
      throw new HttpsError(
        'permission-denied',
        'Solo los administradores pueden eliminar croquis.'
      );
    }
    const { sketchId } = request.data;
    if (!sketchId) {
      throw new HttpsError('invalid-argument', 'Falta el ID del croquis.');
    }

    const db = getDb();
    const sketchRef = db.collection('sketches').doc(sketchId);

    try {
      const docSnap = await sketchRef.get();
      if (!docSnap.exists) {
        logger.warn(`Se intentó eliminar un croquis que no existe: ${sketchId}`);
        return { success: true, message: 'El croquis ya había sido eliminado.' };
      }
      const sketchData = docSnap.data();

      // 2. Borrar la imagen de Storage si existe
      if (sketchData.imageUrl) {
        try {
          const bucket = getStorage().bucket(BUCKET_NAME);
          const filePath = decodeURIComponent(sketchData.imageUrl.split('/o/')[1].split('?')[0]);
          await bucket.file(filePath).delete();
          logger.info(`Imagen del croquis ${sketchId} eliminada de Storage: ${filePath}`);
        } catch (storageError) {
          logger.error(
            `No se pudo eliminar la imagen del croquis ${sketchId}. Puede que ya no exista. Error:`,
            storageError.message
          );
        }
      }

      // 3. Borrar el documento de Firestore
      await sketchRef.delete();
      logger.info(`Croquis ${sketchId} eliminado de Firestore por admin ${request.auth.uid}.`);

      return { success: true, message: 'Croquis eliminado con éxito.' };
    } catch (error) {
      logger.error(`Error al eliminar el croquis ${sketchId}:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'No se pudo eliminar el croquis.');
    }
  }
);

/**
 * Elimina una plantilla de documento de la base de datos.
 * Solo para administradores.
 */
export const deleteDocumentTemplate = onCall({ region: 'us-central1' }, async (request) => {
  // 1. Verificación de permisos
  if (!request.auth || request.auth.token.role !== 'admin') {
    throw new HttpsError(
      'permission-denied',
      'Solo los administradores pueden eliminar plantillas.'
    );
  }

  // 2. Validación de datos de entrada
  const { templateId } = request.data;
  if (!templateId) {
    throw new HttpsError('invalid-argument', 'Falta el ID de la plantilla a eliminar.');
  }

  const db = getDb();
  const templateRef = db.collection('documentTemplates').doc(templateId);

  try {
    // 3. Ejecución de la eliminación
    await templateRef.delete();

    logger.info(
      `Plantilla ${templateId} eliminada con éxito por el admin ${request.auth.token.agentId}.`
    );
    return { success: true, message: 'Plantilla eliminada correctamente.' };
  } catch (error) {
    logger.error(`Error al eliminar la plantilla ${templateId}:`, error);
    throw new HttpsError('internal', 'No se pudo eliminar la plantilla de la base de datos.');
  }
});

// REEMPLAZA TU FUNCIÓN generateAiServiceOrder CON ESTA VERSIÓN FINAL
export const generateAiServiceOrder = onCall({ region: 'us-central1' }, async (request) => {
  // 1. Verificación de permisos (se mantiene igual)
  if (
    !request.auth ||
    (request.auth.token.role !== 'admin' && request.auth.token.role !== 'supervisor')
  ) {
    throw new HttpsError('permission-denied', 'Acción no permitida.');
  }

  // --- INICIO DE LA CORRECCIÓN ---
  // 2. Se extraen correctamente la fecha y el turno de los datos de la solicitud.
  const { date, shiftType } = request.data;
  if (!date || !shiftType) {
    throw new HttpsError('invalid-argument', 'Faltan la fecha y el turno en la solicitud.');
  }
  // --- FIN DE LA CORRECCIÓN ---

  const db = getDb();
  // Usamos mediodía para evitar problemas de zona horaria al convertir la fecha
  const serviceDate = new Date(date + 'T12:00:00');

  try {
    // 3. Se llama a la lógica de generación con los datos correctos.
    await processAutoGeneration(db, serviceDate, shiftType, true);
    return {
      success: true,
      message: `Orden para ${shiftType} del ${date} generada con éxito desde plantilla.`,
    };
  } catch (error) {
    // 4. Se mejora el manejo de errores para dar mensajes más claros al usuario.
    logger.error(`Error en la generación manual con IA para ${date} ${shiftType}:`, error);
    if (error instanceof HttpsError) {
      throw error; // Propaga el error específico (ej: "ya existe", "no encontrado")
    }
    throw new HttpsError('internal', error.message || 'No se pudo generar la orden de servicio.');
  }
});

export const deleteServiceReport = onCall({ region: 'us-central1' }, async (request) => {
  // 1. Verificación de permisos: Solo un admin o supervisor puede eliminar.
  if (request.auth?.token?.role !== 'admin' && request.auth?.token?.role !== 'supervisor') {
    throw new HttpsError(
      'permission-denied',
      'Solo los administradores pueden eliminar partes de servicio.'
    );
  }

  // 2. Validación de los datos recibidos.
  const { reportId } = request.data;
  if (!reportId) {
    throw new HttpsError('invalid-argument', 'Se requiere un ID de parte para eliminarlo.');
  }

  const db = getDb();
  const reportRef = db.collection('serviceReports').doc(reportId);

  try {
    // Opcional: Aquí se podría añadir lógica para borrar sub-colecciones si fuera necesario.

    // 3. Ejecución de la eliminación.
    await reportRef.delete();

    logger.info(`El parte ${reportId} fue eliminado por un ${request.auth.token.role}.`);
    return { success: true, message: 'Parte de servicio eliminado con éxito.' };
  } catch (error) {
    logger.error(`Error al eliminar el parte ${reportId}:`, error);
    throw new HttpsError('internal', 'No se pudo eliminar el parte de servicio.');
  }
});

/**
 * Duplica una plantilla de documento existente.
 * Solo para administradores.
 */
export const duplicateDocumentTemplate = onCall({ region: 'us-central1' }, async (request) => {
  // 1. Verificación de permisos
  if (!request.auth || request.auth.token.role !== 'admin') {
    throw new HttpsError(
      'permission-denied',
      'Solo los administradores pueden duplicar plantillas.'
    );
  }

  // 2. Validación de datos de entrada
  const { templateId } = request.data;
  if (!templateId) {
    throw new HttpsError('invalid-argument', 'Falta el ID de la plantilla a duplicar.');
  }

  const db = getDb();
  const templateRef = db.collection('documentTemplates').doc(templateId);

  try {
    // 3. Leer la plantilla original
    const originalDoc = await templateRef.get();
    if (!originalDoc.exists) {
      throw new HttpsError('not-found', 'La plantilla original no existe.');
    }

    const originalData = originalDoc.data();

    // 4. Preparar los datos de la nueva plantilla
    const newTemplateData = {
      ...originalData, // Copia todos los campos de la plantilla original
      templateName: `${originalData.templateName} - Copia`, // Añade " - Copia" al nombre
      createdAt: admin.firestore.FieldValue.serverTimestamp(), // Nueva fecha de creación
      createdByAgentId: request.auth.token.agentId, // El admin que hace la copia
    };
    // Eliminamos campos de actualización antiguos si existieran
    delete newTemplateData.updatedAt;
    delete newTemplateData.updatedByAgentId;

    // 5. Crear el nuevo documento en la base de datos
    await db.collection('documentTemplates').add(newTemplateData);

    logger.info(`Plantilla ${templateId} duplicada por ${request.auth.token.agentId}`);
    return { success: true, message: 'Plantilla duplicada correctamente.' };
  } catch (error) {
    logger.error(`Error al duplicar la plantilla ${templateId}:`, error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'No se pudo duplicar la plantilla.');
  }
});

/**
 * Guarda un nuevo vehículo, generando un array de palabras clave para la búsqueda.
 */
export async function saveVehiculo(matricula, data) {
  if (!matricula) throw new Error("La matrícula es obligatoria.");
  
  const vehiculoRef = doc(db, 'vehiculos', matricula.toUpperCase());
  
  // ✅ LÓGICA PARA CREAR LAS PALABRAS CLAVE
  const keywords = [
    matricula.toLowerCase(),
    ...(data.marca ? data.marca.toLowerCase().split(' ') : []),
    ...(data.modelo ? data.modelo.toLowerCase().split(' ') : [])
  ];
  // Elimina duplicados
  const searchableKeywords = [...new Set(keywords)];

  const finalData = {
    ...data,
    searchableKeywords, // Se añade el nuevo campo
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(vehiculoRef, finalData);
  return { id: vehiculoRef.id };
}

/**
 * Actualiza un vehículo, regenerando el array de palabras clave.
 */
export async function updateVehiculo(vehiculoId, data) {
  if (!vehiculoId) throw new Error("Se requiere el ID del vehículo.");

  const vehiculoRef = doc(db, 'vehiculos', vehiculoId);
  
  // ✅ LÓGICA PARA ACTUALIZAR LAS PALABRAS CLAVE
  const keywords = [
    vehiculoId.toLowerCase(), // El ID es la matrícula
    ...(data.marca ? data.marca.toLowerCase().split(' ') : []),
    ...(data.modelo ? data.modelo.toLowerCase().split(' ') : [])
  ];
  const searchableKeywords = [...new Set(keywords)];
  
  const finalData = {
    ...data,
    searchableKeywords, // Se actualiza el campo
    updatedAt: serverTimestamp(),
  };
  
  await updateDoc(vehiculoRef, finalData);
  return { id: vehiculoRef.id };
}

/**
 * Busca vehículos utilizando el campo 'searchableKeywords'.
 * @param {string} searchTerm - El término de búsqueda (matrícula, marca o modelo).
 * @returns {Promise<Array>} Una lista de vehículos que coinciden.
 */
export const searchVehiculos = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Autenticación requerida.');
  }
  
  const { searchTerm } = request.data;
  if (!searchTerm || searchTerm.trim().length < 2) {
    return { success: true, vehicles: [] };
  }

  const term = searchTerm.toLowerCase();
  
  try {
    const vehiculosRef = getDb().collection('vehiculos');
    const q = vehiculosRef.where('searchableKeywords', 'array-contains', term);
    
    // ✅ ESTA ES LA LÍNEA CORREGIDA
    // Antes (Incorrecto): const querySnapshot = await getDocs(q);
    // Ahora (Correcto): Se llama al método .get() directamente sobre la consulta.
    const querySnapshot = await q.get();
    
    const vehicles = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    return { success: true, vehicles: vehicles };
  } catch (error) {
    logger.error("Error al buscar vehículos:", error);
    throw new HttpsError('internal', "La búsqueda de vehículos falló.");
  }
});

export const getRegistros = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes estar autenticado.');
  }

  // --- INICIO DE LA DEPURACIÓN (BACKEND) ---
  logger.info("--- Depuración Backend: getRegistros ---");
  logger.info("Filtros recibidos desde el frontend:", request.data);
  // --- FIN DE LA DEPURACIÓN ---

  const { direction, date, type, interesado } = request.data;
  
  const db = getDb();
  let query = db.collection('registros').where('status', '!=', 'eliminado');

  if (direction && ['entrada', 'salida'].includes(direction)) {
    query = query.where('direction', '==', direction);
  }
  if (date) {
    const startDate = new Date(`${date}T00:00:00.000Z`);
    const endDate = new Date(`${date}T23:59:59.999Z`);
    query = query.where('createdAt', '>=', startDate).where('createdAt', '<=', endDate);
  }
  if (type && type !== 'all') {
    query = query.where('documentType', '==', type);
  }
  
  query = query.orderBy('createdAt', 'desc');

  try {
    const snapshot = await query.get();

    // --- INICIO DE LA DEPURACIÓN (BACKEND) ---
    logger.info(`Consulta a Firestore encontró ${snapshot.size} documentos.`);
    logger.info("------------------------------------");
    // --- FIN DE LA DEPURACIÓN ---

    const registros = snapshot.docs.map(doc => {
        // ... (tu lógica de mapeo)
    });
    return { success: true, registros: registros };
  } catch (error) {
    logger.error("Error en la consulta de getRegistros:", error);
    throw new HttpsError('internal', 'Falló la consulta a la base de datos.');
  }
});