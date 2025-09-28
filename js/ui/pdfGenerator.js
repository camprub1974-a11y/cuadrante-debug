// js/ui/pdfGenerator.js

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase-config.js';
import { currentUser, availableAgents } from '../state.js';
import { showLoading, hideLoading, displayMessage } from './viewManager.js';
// Importamos 'parseISO' y 'isValid' de date-fns para un manejo robusto de fechas
import { generateMonthsForYear, formatDate, parseISO, isValid } from '../utils.js'; // Asegúrate de que utils.js exporta parseISO y isValid si no lo hace

const functions = getFunctions(app);

let pdfOptionsModal,
  pdfConfirmModal,
  pdfOptionsForm,
  generatePdfBtn,
  closeOptionsBtn,
  closeConfirmBtn,
  cancelConfirmBtn,
  confirmDownloadBtn;
let periodMonthRadio,
  periodRangeRadio,
  monthSelector,
  rangeSelector,
  pdfYearSelect,
  pdfMonthSelect,
  pdfStartDate,
  pdfEndDate,
  pdfAgentContainer,
  pdfAgentSelect,
  pdfFilename;
let summaryContent;
let pdfGenerationData = {};

export function initializePdfGenerator() {
  generatePdfBtn = document.getElementById('generate-pdf-report-btn');
  pdfOptionsModal = document.getElementById('pdf-options-modal');
  pdfConfirmModal = document.getElementById('pdf-confirm-modal');

  if (!generatePdfBtn || !pdfOptionsModal || !pdfConfirmModal) {
    console.warn(
      'Elementos para el generador de PDF no encontrados. La funcionalidad no estará disponible.'
    );
    return;
  }

  pdfOptionsForm = document.getElementById('pdf-options-form');
  closeOptionsBtn = pdfOptionsModal.querySelector('.close-button');
  periodMonthRadio = document.getElementById('period-month');
  periodRangeRadio = document.getElementById('period-range');
  monthSelector = document.getElementById('month-period-selector');
  rangeSelector = document.getElementById('range-period-selector');
  pdfYearSelect = document.getElementById('pdf-year-select');
  pdfMonthSelect = document.getElementById('pdf-month-select');
  pdfStartDate = document.getElementById('pdf-start-date');
  pdfEndDate = document.getElementById('pdf-end-date');
  pdfAgentContainer = document.getElementById('pdf-agent-selector-container');
  pdfAgentSelect = document.getElementById('pdf-agent-select');
  pdfFilename = document.getElementById('pdf-filename-input');

  closeConfirmBtn = pdfConfirmModal.querySelector('.close-button');
  cancelConfirmBtn = document.getElementById('pdf-cancel-btn');
  confirmDownloadBtn = document.getElementById('pdf-confirm-download-btn');
  summaryContent = document.getElementById('pdf-summary-content');

  generatePdfBtn.addEventListener('click', showPdfOptionsModal);
  closeOptionsBtn.addEventListener('click', hidePdfOptionsModal);
  pdfOptionsForm.addEventListener('submit', handleOptionsSubmit);

  periodMonthRadio.addEventListener('change', togglePeriodSelectors);
  periodRangeRadio.addEventListener('change', togglePeriodSelectors);

  closeConfirmBtn.addEventListener('click', hidePdfConfirmModal);
  cancelConfirmBtn.addEventListener('click', hidePdfConfirmModal);
  confirmDownloadBtn.addEventListener('click', executePdfGeneration);
}

function showPdfOptionsModal() {
  pdfOptionsForm.reset();
  populateYearSelector();
  populateMonthSelector();
  populateAgentSelector();
  periodMonthRadio.checked = true; // Asegurarse de que 'Por Mes' esté seleccionado por defecto
  togglePeriodSelectors();
  pdfOptionsModal.classList.remove('hidden');
  pdfOptionsModal.style.opacity = 1;
  pdfOptionsModal.style.visibility = 'visible';
}

function hidePdfOptionsModal() {
  pdfOptionsModal.classList.add('hidden');
  pdfOptionsModal.style.opacity = 0;
  pdfOptionsModal.style.visibility = 'hidden';
}

function togglePeriodSelectors() {
  if (periodMonthRadio.checked) {
    monthSelector.classList.remove('hidden');
    rangeSelector.classList.add('hidden');
    // Limpiar los valores del rango cuando se selecciona "Por Mes"
    pdfStartDate.value = '';
    pdfEndDate.value = '';
  } else {
    monthSelector.classList.add('hidden');
    rangeSelector.classList.remove('hidden');
    // Limpiar los valores del mes cuando se selecciona "Rango de Fechas"
    pdfYearSelect.value = new Date().getFullYear(); // o un valor por defecto
    pdfMonthSelect.value = new Date().getMonth() - 1; // o un valor por defecto
  }
}

function populateYearSelector() {
  const currentYear = new Date().getFullYear();
  let options = '';
  for (let i = currentYear - 5; i <= currentYear + 1; i++) {
    // Rango de años ampliado un poco
    options += `<option value="${i}">${i}</option>`;
  }
  pdfYearSelect.innerHTML = options;
  pdfYearSelect.value = currentYear;
}

function populateMonthSelector() {
  const months = generateMonthsForYear(new Date().getFullYear()); // generateMonthsForYear debe estar en utils.js
  let options = months.map((m) => `<option value="${m.monthIndex}">${m.name}</option>`).join('');
  pdfMonthSelect.innerHTML = options;
  const previousMonth = new Date().getMonth() - 1;
  pdfMonthSelect.value = previousMonth < 0 ? 11 : previousMonth; // Selecciona el mes anterior
}

function populateAgentSelector() {
  const user = currentUser.get();
  if (user.role === 'admin') {
    const agents = availableAgents.get();
    let options = '<option value="all">Todos los Agentes</option>';
    agents.forEach((agent) => {
      options += `<option value="${agent.id}">${agent.name}</option>`;
    });
    pdfAgentSelect.innerHTML = options;
    pdfAgentContainer.classList.remove('hidden');
  } else {
    pdfAgentContainer.classList.add('hidden');
  }
}

function handleOptionsSubmit(event) {
  event.preventDefault();

  const user = currentUser.get();
  let rawStartDate, rawEndDate; // Variables para almacenar los objetos Date válidos
  let periodDisplayText = ''; // Texto para mostrar en el resumen del modal

  if (periodMonthRadio.checked) {
    const year = parseInt(pdfYearSelect.value);
    const month = parseInt(pdfMonthSelect.value); // mes es 0-indexado

    // Validar que el año y el mes sean números válidos
    if (isNaN(year) || isNaN(month)) {
      displayMessage('Por favor, selecciona un año y un mes válidos.', 'warning');
      return;
    }

    rawStartDate = new Date(year, month, 1);
    rawEndDate = new Date(year, month + 1, 0, 23, 59, 59, 999); // Último milisegundo del último día

    // Obtener el nombre del mes para el display
    const monthName = generateMonthsForYear(year).find((m) => m.monthIndex === month)?.name;
    periodDisplayText = `Mes completo: ${monthName} ${year}`;
  } else {
    // Rango de Fechas
    const startDateValue = pdfStartDate.value; // string "yyyy-MM-dd"
    const endDateValue = pdfEndDate.value; // string "yyyy-MM-dd"

    // **VALIDACIÓN CRÍTICA: Asegurarse de que las cadenas de fecha no estén vacías**
    if (!startDateValue || !endDateValue) {
      displayMessage(
        'Por favor, selecciona tanto la fecha de inicio como la de fin para el rango personalizado.',
        'warning'
      );
      return;
    }

    // Usar parseISO de date-fns para parsear las cadenas y luego isValid para verificar
    // Añadimos T00:00:00 para asegurar que son inicio/fin de día local y evitar problemas de zona horaria
    rawStartDate = parseISO(`${startDateValue}T00:00:00`);
    rawEndDate = parseISO(`${endDateValue}T23:59:59`); // último segundo del día de fin

    if (!isValid(rawStartDate) || !isValid(rawEndDate)) {
      displayMessage(
        'Las fechas seleccionadas para el rango no son válidas. Formato esperado: AAAA-MM-DD.',
        'warning'
      );
      console.error(
        'Fechas inválidas detectadas después de parseISO:',
        startDateValue,
        endDateValue
      );
      return;
    }

    periodDisplayText = `Periodo: del ${formatDate(rawStartDate, 'dd/MM/yyyy')} al ${formatDate(rawEndDate, 'dd/MM/yyyy')}`;
  }

  // Validación general para todas las opciones de periodo
  if (!isValid(rawStartDate) || !isValid(rawEndDate)) {
    // Doble chequeo, aunque las validaciones anteriores deberían cubrirlo
    displayMessage('Error al procesar las fechas. Por favor, revisa tu selección.', 'error');
    return;
  }

  if (rawEndDate < rawStartDate) {
    displayMessage('La fecha de fin no puede ser anterior a la fecha de inicio.', 'warning');
    return;
  }

  const filename = pdfFilename.value.trim();
  if (!filename) {
    displayMessage('Por favor, introduce un nombre para el archivo.', 'warning');
    return;
  }

  const allAgents = user.role === 'admin' && pdfAgentSelect.value === 'all';
  const agentIds = allAgents
    ? null
    : user.role === 'admin'
      ? [pdfAgentSelect.value]
      : [user.agentId];

  // Almacenar las fechas formateadas para la función de Firebase y para el display
  pdfGenerationData = {
    startDate: formatDate(rawStartDate, 'yyyy-MM-dd'), // Formato YYYY-MM-DD para el backend
    endDate: formatDate(rawEndDate, 'yyyy-MM-dd'), // Formato YYYY-MM-DD para el backend
    displayPeriod: periodDisplayText, // Texto para el modal de confirmación
    allAgents,
    agentIds,
    filename: `${filename}.pdf`,
  };

  showConfirmationModal();
}

function showConfirmationModal() {
  const user = currentUser.get(); // Asegúrate de obtener el usuario de nuevo aquí
  let agentText;

  if (pdfGenerationData.allAgents) {
    agentText = 'Todos los agentes';
  } else {
    if (
      user.role === 'admin' &&
      pdfGenerationData.agentIds &&
      pdfGenerationData.agentIds.length > 0
    ) {
      const agentName = availableAgents
        .get()
        .find((a) => a.id === pdfGenerationData.agentIds[0])?.name;
      agentText = `Solo ${agentName || 'agente seleccionado'}`;
    } else if (user.role === 'guard') {
      agentText = 'Solo agente actual'; // Para el guardia, siempre es su propio informe
    } else {
      agentText = 'Agentes no definidos'; // Caso fallback
    }
  }

  // Usar pdfGenerationData.displayPeriod directamente
  summaryContent.innerHTML = `
        <p><strong>Periodo:</strong> ${pdfGenerationData.displayPeriod}</p>
        <p><strong>Agentes:</strong> ${agentText}</p>
        <p><strong>Nombre del Archivo:</strong> ${pdfGenerationData.filename}</p>
    `;
  hidePdfOptionsModal();
  pdfConfirmModal.classList.remove('hidden');
  pdfConfirmModal.style.opacity = 1;
  pdfConfirmModal.style.visibility = 'visible';
}

function hidePdfConfirmModal() {
  pdfConfirmModal.classList.add('hidden');
  pdfConfirmModal.style.opacity = 0;
  pdfConfirmModal.style.visibility = 'hidden';
}

async function executePdfGeneration() {
  hidePdfConfirmModal();
  showLoading('Generando PDF...');

  try {
    // Asegúrate de que 'functions' está correctamente inicializado con la app de Firebase
    // y que la función está desplegada en 'us-central1'
    const generatePdfCallable = httpsCallable(functions, 'generarInformeManualPDF'); // <-- LÍNEA CORREGIDA

    // Solo pasar los datos necesarios para el backend, ya formateados
    const dataToSend = {
      startDate: pdfGenerationData.startDate, // Ya es 'yyyy-MM-dd'
      endDate: pdfGenerationData.endDate, // Ya es 'yyyy-MM-dd'
      allAgents: pdfGenerationData.allAgents,
      agentIds: pdfGenerationData.agentIds,
      // filename no es necesario para la función callable, solo para la descarga en frontend
    };

    const result = await generatePdfCallable(dataToSend);

    if (result.data && result.data.pdfBase64) {
      downloadPdfFromBase64(result.data.pdfBase64, pdfGenerationData.filename);
      displayMessage('PDF generado y descarga iniciada.', 'success');
    } else {
      // Mejor manejo de errores desde la función de Firebase
      throw new Error(
        result.data?.message ||
          'La función no devolvió un PDF o hubo un error desconocido en el backend.'
      );
    }
  } catch (error) {
    console.error('Error al llamar a la función de generar PDF:', error);
    // HttpsError tiene propiedades 'code' y 'details'
    if (error.code && error.details) {
      displayMessage(
        `Error (${error.code}): ${error.message}. Detalles: ${JSON.stringify(error.details)}`,
        'error'
      );
    } else {
      displayMessage(`Error: ${error.message}`, 'error');
    }
  } finally {
    hideLoading();
  }
}

function downloadPdfFromBase64(base64, filename) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
