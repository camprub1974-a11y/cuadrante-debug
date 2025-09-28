// js/ui/pdfOptionsModal.js

import { displayMessage, showLoading, hideLoading } from './viewManager.js';
import { generarInformeManualPDF } from '../dataController.js';
import { availableAgents } from '../state.js';
import { formatDate } from '../utils.js';

let modal, form, closeButtons;
let periodMonthRadio, periodRangeRadio, monthSelector, rangeSelector;
let startDateInput, endDateInput, agentSelectorContainer, agentSelect, filenameInput;
let pdfYearSelect, pdfMonthSelect;
let isInitialized = false;

export function initializePdfOptionsModal() {
  if (isInitialized) return;

  modal = document.getElementById('pdf-options-modal');
  if (!modal) return;

  form = modal.querySelector('#pdf-options-form');
  closeButtons = modal.querySelectorAll('.close-button');
  periodMonthRadio = modal.querySelector('#period-month');
  periodRangeRadio = modal.querySelector('#period-range');
  monthSelector = modal.querySelector('#month-period-selector');
  rangeSelector = modal.querySelector('#range-period-selector');
  pdfYearSelect = document.getElementById('pdf-year-select');
  pdfMonthSelect = document.getElementById('pdf-month-select');
  startDateInput = modal.querySelector('#pdf-start-date');
  endDateInput = modal.querySelector('#pdf-end-date');
  agentSelectorContainer = modal.querySelector('#pdf-agent-selector-container');
  agentSelect = modal.querySelector('#pdf-agent-select');
  filenameInput = modal.querySelector('#pdf-filename-input');

  if (form && closeButtons.length > 0 && periodMonthRadio) {
    closeButtons.forEach((btn) => btn.addEventListener('click', hidePdfOptionsModal));
    periodMonthRadio.addEventListener('change', togglePeriodSelectors);
    periodRangeRadio.addEventListener('change', togglePeriodSelectors);
    form.addEventListener('submit', handleFormSubmit);
    isInitialized = true;
  }
}

export function openPdfOptionsModal(context) {
  if (!isInitialized) initializePdfOptionsModal();
  if (!modal) return;

  form.reset();

  if (context === 'extra_services') {
    agentSelectorContainer.classList.remove('hidden');
    populateAgentSelector();
  } else {
    agentSelectorContainer.classList.add('hidden');
  }

  populateDateSelectors();
  togglePeriodSelectors();
  modal.classList.remove('hidden');
  if (window.feather) feather.replace();
}

function hidePdfOptionsModal() {
  if (modal) modal.classList.add('hidden');
}

function togglePeriodSelectors() {
  if (periodRangeRadio.checked) {
    monthSelector.classList.add('hidden');
    rangeSelector.classList.remove('hidden');
  } else {
    monthSelector.classList.remove('hidden');
    rangeSelector.classList.add('hidden');
  }
}

function populateAgentSelector() {
  agentSelect.innerHTML = '<option value="all">Todos los Agentes</option>';
  availableAgents.get().forEach((agent) => {
    agentSelect.add(new Option(`${agent.name} (${agent.id})`, agent.id));
  });
}

function populateDateSelectors() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  if (pdfYearSelect.options.length === 0) {
    for (let y = currentYear - 3; y <= currentYear + 1; y++) {
      pdfYearSelect.add(new Option(y, y));
    }
  }
  pdfYearSelect.value = currentYear;

  if (pdfMonthSelect.options.length === 0) {
    const meses = [
      'Enero',
      'Febrero',
      'Marzo',
      'Abril',
      'Mayo',
      'Junio',
      'Julio',
      'Agosto',
      'Septiembre',
      'Octubre',
      'Noviembre',
      'Diciembre',
    ];
    meses.forEach((mes, index) => {
      pdfMonthSelect.add(new Option(mes, index));
    });
  }
  pdfMonthSelect.value = currentMonth;
  filenameInput.value = `Informe_Extraordinarios_${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
}

async function handleFormSubmit(event) {
  event.preventDefault();
  showLoading('Generando informe PDF...');

  try {
    let startDate, endDate;
    if (periodRangeRadio.checked) {
      if (!startDateInput.value || !endDateInput.value)
        throw new Error('Debes seleccionar un rango de fechas.');
      startDate = startDateInput.value;
      endDate = endDateInput.value;
    } else {
      const year = pdfYearSelect.value;
      const month = pdfMonthSelect.value;
      startDate = new Date(year, month, 1).toISOString().split('T')[0];
      endDate = new Date(year, parseInt(month) + 1, 0).toISOString().split('T')[0];
    }

    const agentIds = agentSelect.value === 'all' ? null : [agentSelect.value];
    const allAgents = agentSelect.value === 'all';

    const result = await generarInformeManualPDF({ startDate, endDate, agentIds, allAgents });

    if (result.pdfBase64) {
      const link = document.createElement('a');
      link.href = `data:application/pdf;base64,${result.pdfBase64}`;
      link.download = `${filenameInput.value.trim()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      displayMessage('Informe generado con éxito.', 'success');
      hidePdfOptionsModal();
    } else {
      throw new Error(result.message || 'No se pudo generar el informe.');
    }
  } catch (error) {
    displayMessage(`Error al generar el informe: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}
