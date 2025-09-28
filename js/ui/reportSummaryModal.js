// js/ui/reportSummaryModal.js

import { updateReportSummary } from '../dataController.js';
import { displayMessage, showLoading, hideLoading } from './viewManager.js';

let modal, form, currentReportId;

export function initializeReportSummaryModal() {
  modal = document.getElementById('report-summary-modal');
  if (!modal) return;

  form = modal.querySelector('#report-summary-form');
  const closeButtons = modal.querySelectorAll('.close-button');

  // Lógica para los botones de cerrar (existente)
  closeButtons.forEach(button => {
    button.addEventListener('click', () => modal.classList.add('hidden'));
  });

  // Lógica para el envío del formulario (existente)
  form.addEventListener('submit', handleFormSubmit);

  // Lógica para cerrar si se hace clic fuera del modal (existente)
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });

  // =====================================================================
  // == ✅ AÑADE ESTA LÓGICA PARA LOS BOTONES + Y - ==
  // =====================================================================
  // Usamos delegación de eventos para manejar todos los steppers con un solo listener.
  form.addEventListener('click', (event) => {
    // Busca si el clic fue en un botón con la clase 'stepper-btn'
    const button = event.target.closest('.stepper-btn');
    if (!button) return; // Si no fue en un botón, no hacemos nada.

    // Encuentra el campo de número asociado a ese botón
    const input = button.closest('.input-stepper').querySelector('input[type="number"]');
    if (!input) return;

    // Obtiene el valor actual y lo convierte a número
    let currentValue = parseInt(input.value, 10) || 0;

    // Incrementa o decrementa según el botón pulsado
    if (button.classList.contains('stepper-plus')) {
      currentValue++;
    } else if (button.classList.contains('stepper-minus')) {
      currentValue--;
    }

    // Asegura que el valor nunca sea menor que 0
    input.value = Math.max(0, currentValue);
  });
}

export function openReportSummaryModal(report) {
  if (!modal) return;

  currentReportId = report.id;
  const summaryData = report.summary || {};

  form.querySelectorAll('input[type="number"]').forEach((input) => {
    // ✅ CORRECCIÓN: Usamos input.name para encontrar el valor correcto.
    const key = input.name;
    input.value = summaryData[key] || '0';
  });

  modal.classList.remove('hidden');
}

async function handleFormSubmit(event) {
  event.preventDefault();
  showLoading('Guardando resumen...');

  const summaryData = {};
  form.querySelectorAll('input[type="number"]').forEach((input) => {
    // ✅ CORRECCIÓN: Usamos input.name para construir el objeto a guardar.
    const key = input.name;
    const value = parseInt(input.value, 10);
    // Solo guardamos si el valor es un número válido.
    if (!isNaN(value) && value >= 0) {
      summaryData[key] = value;
    }
  });

  try {
    await updateReportSummary(currentReportId, summaryData);
    displayMessage('Resumen de actuaciones guardado con éxito.', 'success');
    modal.classList.add('hidden');
    // Este evento le dice a la vista principal que se refresque.
    document.dispatchEvent(new CustomEvent('reportSummaryUpdated'));
  } catch (error) {
    displayMessage(`Error al guardar el resumen: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}