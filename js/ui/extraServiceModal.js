// js/ui/extraServiceModal.js

import { addExtraService, updateExtraService, deleteExtraService } from '../dataController.js';
import { showLoading, hideLoading, displayMessage } from './viewManager.js';
import { EXTRA_SERVICE_TYPES } from '../constants.js';
import { currentUser } from '../state.js';
import { formatDate } from '../utils.js';

/**
 * @fileoverview Lógica para el modal de añadir/editar servicios extraordinarios.
 */

// --- Variables del Módulo ---
let modal = null;
let form = null;
let closeButton = null;
let modalTitle = null;
let dateInput = null;
let typeSelect = null;
let hoursInput = null;
let priceInput = null;
let notesTextarea = null;
let saveButton = null;
let deleteButton = null;

let currentService = null;
let currentAgentIdForAdmin = null; // Para cuando un admin edita

// ===== INICIO DE LA MODIFICACIÓN 1: Añadir variable para el callback =====
let onSaveCallback = null;
// =======================================================================

export function initializeExtraServiceModal() {
  modal = document.getElementById('extra-service-modal');
  if (!modal) return;

  modalTitle = document.getElementById('extra-service-modal-title');
  form = document.getElementById('extra-service-form');
  closeButton = modal.querySelector('.close-button');
  dateInput = document.getElementById('extra-service-date');
  typeSelect = document.getElementById('extra-service-type');
  hoursInput = document.getElementById('extra-service-hours');
  priceInput = document.getElementById('extra-service-price');
  notesTextarea = document.getElementById('extra-service-notes');
  saveButton = document.getElementById('save-extra-service-btn');
  deleteButton = document.getElementById('delete-extra-service-btn');

  populateTypeSelect();

  if (closeButton) closeButton.addEventListener('click', hideExtraServiceModal);
  if (form) form.addEventListener('submit', handleFormSubmit);
  if (deleteButton) deleteButton.addEventListener('click', handleDeleteService);
  if (typeSelect) typeSelect.addEventListener('change', updatePrice);
}

function populateTypeSelect() {
  if (!typeSelect) return;
  let options = '<option value="">Selecciona un tipo...</option>';
  for (const key in EXTRA_SERVICE_TYPES) {
    options += `<option value="${key}">${EXTRA_SERVICE_TYPES[key].name}</option>`;
  }
  typeSelect.innerHTML = options;
}

function updatePrice() {
  const selectedType = typeSelect.value;
  priceInput.value = selectedType ? EXTRA_SERVICE_TYPES[selectedType].price || '' : '';
}

// ===== INICIO DE LA MODIFICACIÓN 2: La función ahora acepta un 'callback' =====
export function showExtraServiceModal(mode, date, serviceData = null, callback = null) {
  if (!modal) initializeExtraServiceModal();
  if (!modal) return;

  onSaveCallback = callback; // Se guarda la función de "aviso"
  // ============================================================================

  form.reset();
  currentService = null;
  currentAgentIdForAdmin = null;
  dateInput.readOnly = true;

  if (mode === 'edit' && serviceData) {
    modalTitle.textContent = 'Editar Servicio Extraordinario';
    currentService = serviceData;

    dateInput.value = formatDate(serviceData.date, 'yyyy-MM-dd');
    typeSelect.value = serviceData.type;
    hoursInput.value = serviceData.hours;
    notesTextarea.value = serviceData.notes || '';

    if (currentUser.get().role === 'admin' || currentUser.get().role === 'supervisor') {
      currentAgentIdForAdmin = serviceData.agentId;
    }

    updatePrice();
    deleteButton.classList.remove('hidden');
    saveButton.textContent = 'Guardar Cambios';
  } else {
    modalTitle.textContent = 'Añadir Servicio Extraordinario';
    dateInput.value = typeof date === 'string' ? date : formatDate(date, 'yyyy-MM-dd');
    deleteButton.classList.add('hidden');
    saveButton.textContent = 'Guardar';
    updatePrice();
  }

  modal.classList.remove('hidden');
  modal.style.display = 'flex';
}

export function hideExtraServiceModal() {
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

async function handleFormSubmit(event) {
  event.preventDefault();
  showLoading();

  const serviceDataPayload = {
    date: dateInput.value,
    type: typeSelect.value,
    hours: parseFloat(hoursInput.value),
    notes: notesTextarea.value.trim(),
    price: parseFloat(priceInput.value),
    agentId: currentAgentIdForAdmin || currentUser.get().agentId,
    userId: currentService?.userId || currentUser.get().uid,
  };

  if (!serviceDataPayload.date || !serviceDataPayload.type || isNaN(serviceDataPayload.hours)) {
    displayMessage('Por favor, completa todos los campos obligatorios.', 'warning');
    hideLoading();
    return;
  }

  try {
    if (currentService && currentService.id) {
      await updateExtraService(currentService.id, serviceDataPayload);
      displayMessage('Servicio actualizado con éxito.', 'success');
    } else {
      await addExtraService(serviceDataPayload);
      displayMessage('Servicio añadido con éxito.', 'success');
    }

    hideExtraServiceModal();
    // ===== INICIO DE LA MODIFICACIÓN 3: Ejecutar el "aviso" al terminar =====
    if (onSaveCallback) {
      onSaveCallback(); // Llama a la función para refrescar la vista
    }
    // ====================================================================
  } catch (error) {
    displayMessage(`Error al guardar el servicio: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

async function handleDeleteService() {
  if (
    !currentService ||
    !currentService.id ||
    !confirm('¿Estás seguro de que quieres eliminar este servicio?')
  ) {
    return;
  }
  showLoading();
  try {
    await deleteExtraService(currentService.id);
    displayMessage('Servicio eliminado con éxito.', 'success');
    hideExtraServiceModal();
    // ===== INICIO DE LA MODIFICACIÓN 4: Ejecutar el "aviso" también al borrar =====
    if (onSaveCallback) {
      onSaveCallback();
    }
    // =========================================================================
  } catch (error) {
    displayMessage(`Error al eliminar el servicio: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}