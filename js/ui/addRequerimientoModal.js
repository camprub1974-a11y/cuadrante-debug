// js/ui/addRequerimientoModal.js

import { displayMessage, showLoading, hideLoading } from './viewManager.js';
import { addRequerimiento } from '../dataController.js'; // Asegúrate de que addRequerimiento esté importado

let addRequerimientoModal;
let addRequerimientoForm;
let requerimientoHoraInput;
let contactoTipoRadios; // Radio buttons para tipo de contacto
let telefonoGroup; // Contenedor para el campo de teléfono
let requerimientoTelefonoInput;
let requerimientoRequirenteInput;
let requerimientoMotivoTextarea; // Renombrado de requerimientoDescriptionTextarea

export function initializeAddRequerimientoModal() {
  addRequerimientoModal = document.getElementById('add-requerimiento-modal');
  if (!addRequerimientoModal) return;

  addRequerimientoForm = document.getElementById('add-requerimiento-form');
  requerimientoHoraInput = document.getElementById('requerimiento-hora');
  contactoTipoRadios = document.querySelectorAll('input[name="tipo-contacto"]');
  telefonoGroup = document.getElementById('telefono-group');
  requerimientoTelefonoInput = document.getElementById('requerimiento-telefono');
  requerimientoRequirenteInput = document.getElementById('requerimiento-requirente');
  requerimientoMotivoTextarea = document.getElementById('requerimiento-motivo'); // ID actualizado

  // Listener para mostrar/ocultar el campo de teléfono
  contactoTipoRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.value === 'telefonico') {
        telefonoGroup.style.display = 'block';
        requerimientoTelefonoInput.setAttribute('required', 'true');
      } else {
        telefonoGroup.style.display = 'none';
        requerimientoTelefonoInput.removeAttribute('required');
        requerimientoTelefonoInput.value = ''; // Limpiar el campo si se oculta
      }
    });
  });

  addRequerimientoModal
    .querySelector('.close-button')
    .addEventListener('click', closeAddRequerimientoModal);
  addRequerimientoForm.addEventListener('submit', handleAddRequerimientoSubmit);

  // Resetear el formulario al abrir
  addRequerimientoModal.addEventListener('modal:open', () => {
    addRequerimientoForm.reset();
    telefonoGroup.style.display = 'none'; // Asegurarse de que esté oculto por defecto
    requerimientoTelefonoInput.removeAttribute('required');
    document.getElementById('contacto-personal').checked = true; // Seleccionar "Personal" por defecto
  });
}

export function openAddRequerimientoModal(reportId) {
  if (!addRequerimientoModal) return;
  addRequerimientoModal.dataset.reportId = reportId; // Guardar el reportId para usarlo al guardar
  addRequerimientoModal.classList.remove('hidden');
  // Establecer la hora actual por defecto
  requerimientoHoraInput.value = new Date().toTimeString().slice(0, 5);
}

function closeAddRequerimientoModal() {
  if (!addRequerimientoModal) return;
  addRequerimientoModal.classList.add('hidden');
}

async function handleAddRequerimientoSubmit(event) {
  event.preventDefault();
  const reportId = addRequerimientoModal.dataset.reportId;
  if (!reportId) {
    displayMessage(
      'Error: ID de parte de servicio no encontrado para añadir requerimiento.',
      'error'
    );
    return;
  }

  const hora = requerimientoHoraInput.value;
  const tipoContacto = document.querySelector('input[name="tipo-contacto"]:checked').value;
  const telefono = tipoContacto === 'telefonico' ? requerimientoTelefonoInput.value : '';
  const requirente = requerimientoRequirenteInput.value;
  const motivo = requerimientoMotivoTextarea.value; // ID actualizado

  if (!hora || !requirente || !motivo) {
    displayMessage(
      'Por favor, rellena todos los campos obligatorios (Hora, Requirente, Motivo).',
      'warning'
    );
    return;
  }
  if (tipoContacto === 'telefonico' && !telefono) {
    displayMessage('Por favor, introduce el número de teléfono.', 'warning');
    return;
  }

  showLoading();
  try {
    // Combinar los nuevos campos en la descripción o en un nuevo objeto de datos
    // Para simplificar, vamos a combinarlo en una descripción estructurada por ahora.
    // En un futuro, podrías guardar estos campos por separado en Firestore.
    const fullDescription = `[${hora}] [${tipoContacto === 'telefonico' ? `Tel: ${telefono}` : 'Personal'}] Requirente: ${requirente} - Motivo: ${motivo}`;

    await addRequerimiento(reportId, fullDescription); // Llama a la función en dataController
    displayMessage('Requerimiento añadido con éxito.', 'success');
    closeAddRequerimientoModal();
    document.dispatchEvent(new CustomEvent('requerimientoAdded')); // Dispara evento para recargar la vista
  } catch (error) {
    console.error('Error al añadir requerimiento:', error);
    displayMessage(`Error al añadir requerimiento: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}
