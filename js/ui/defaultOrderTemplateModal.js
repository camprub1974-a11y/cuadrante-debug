// js/ui/defaultOrderTemplateModal.js

import { displayMessage } from './viewManager.js';
import { createDefaultServiceOrders } from '../dataController.js';
import { showLoading, hideLoading } from './viewManager.js';

let modal, closeButton, form, dateInput, shiftSelect;
let isInitialized = false;

export function initializeDefaultOrderTemplateModal() {
  if (isInitialized) return;

  modal = document.getElementById('generate-template-modal');
  if (!modal) return; // Si el modal no existe, no continuar.

  closeButton = modal.querySelector('.close-button');
  form = modal.querySelector('#generate-template-form');
  dateInput = modal.querySelector('#template-date-input');
  shiftSelect = modal.querySelector('#template-shift-select');

  if (!closeButton || !form || !dateInput || !shiftSelect) {
    console.error('Error: Faltan elementos DOM para el modal de generación de plantilla.');
    return;
  }

  closeButton.addEventListener('click', hideDefaultOrderTemplateModal);
  form.addEventListener('submit', handleFormSubmit);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      hideDefaultOrderTemplateModal();
    }
  });

  isInitialized = true;
  console.log('✅ Módulo del Modal de Generación de Plantilla inicializado.');
}

/**
 * ✅ FUNCIÓN RENOMBRADA: Ahora se llama 'openDefaultOrderTemplateModal' para consistencia.
 * Abre el modal y limpia los campos del formulario.
 */
export function openDefaultOrderTemplateModal() {
  if (!modal) return;
  form.reset(); // Limpia campos de fecha y turno.
  modal.classList.remove('hidden');
}

/**
 * Oculta el modal.
 */
function hideDefaultOrderTemplateModal() {
  if (modal) {
    modal.classList.add('hidden');
  }
}

/**
 * Maneja el envío del formulario, llamando directamente a la función del dataController.
 */
async function handleFormSubmit(event) {
  event.preventDefault();

  const selectedDate = dateInput.value;
  const selectedShift = shiftSelect.value;

  if (!selectedDate || !selectedShift) {
    displayMessage('Por favor, selecciona una fecha y un turno.', 'warning');
    return;
  }

  showLoading();
  try {
    const result = await createDefaultServiceOrders(selectedDate, selectedShift);
    if (result.success) {
      displayMessage(result.message || 'Órdenes de plantilla generadas con éxito.', 'success');
      hideDefaultOrderTemplateModal();
      // Disparamos un evento para que la vista de planificación se actualice.
      document.dispatchEvent(new CustomEvent('serviceOrderCreated'));
    } else {
      throw new Error(result.message || 'Error desconocido al generar la plantilla.');
    }
  } catch (error) {
    displayMessage(`Error: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}
