// js/ui/reportEntryModal.js

import { displayMessage, showLoading, hideLoading } from './viewManager.js';
import { addReportEntry } from '../dataController.js';

let modal, form, closeButton, descriptionTextarea;
let currentReportId = null;
let isInitialized = false;

export function initializeReportEntryModal() {
  if (isInitialized) return;
  modal = document.getElementById('report-entry-modal');
  if (!modal) return;

  form = modal.querySelector('#report-entry-form');
  closeButton = modal.querySelector('.close-button');
  descriptionTextarea = modal.querySelector('#entry-description');

  closeButton.addEventListener('click', hideReportEntryModal);
  form.addEventListener('submit', handleFormSubmit);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) hideReportEntryModal();
  });

  isInitialized = true;
  console.log('✅ Módulo del Modal de Novedades de Parte inicializado.');
}

export function openReportEntryModal(reportId) {
  if (!isInitialized) {
    displayMessage('Error: El modal de novedades no está listo.', 'error');
    return;
  }
  currentReportId = reportId;
  form.reset();
  modal.classList.remove('hidden');
}

function hideReportEntryModal() {
  if (modal) modal.classList.add('hidden');
}

async function handleFormSubmit(event) {
  event.preventDefault();
  const description = descriptionTextarea.value.trim();
  if (!description) {
    displayMessage('La descripción no puede estar vacía.', 'warning');
    return;
  }

  showLoading();
  try {
    await addReportEntry({
      reportId: currentReportId,
      description: description,
    });
    displayMessage('Novedad guardada.', 'success');
    hideReportEntryModal();
    // Avisamos a la vista principal del parte que debe recargarse
    document.dispatchEvent(new CustomEvent('reportEntryAdded'));
  } catch (error) {
    displayMessage(`Error al guardar la novedad: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}
