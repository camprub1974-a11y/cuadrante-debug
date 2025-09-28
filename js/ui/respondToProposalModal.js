// js/ui/respondToProposalModal.js

import { displayMessage, showLoading, hideLoading } from './viewManager.js';
import {
  respondToShiftChangeRequest,
  getShiftChangeRequests,
  updateNotificationCount,
} from '../dataController.js';
import { getAgentName, render as renderSchedule } from './scheduleRenderer.js';
import { formatDate } from '../utils.js';
import { renderContext } from '../state.js'; // [CORRECCIÓN] Importar renderContext

let modal = null;
let closeButton = null;
let approveButton = null;
let rejectButton = null;
let detailsContainer = null;
let requesterNameEl = null;
let requesterShiftInfoEl = null;
let targetShiftInfoEl = null;
let commentsContainer = null;
let commentsTextEl = null;
let currentChangeId = null;

export function initializeRespondToProposalModal() {
  modal = document.getElementById('respond-to-proposal-modal');
  if (!modal) return;
  closeButton = modal.querySelector('.close-button');
  if (closeButton) closeButton.addEventListener('click', hideRespondToProposalModal);
}

function _initializeInternalDOMElements() {
  if (detailsContainer) return true;
  approveButton = modal.querySelector('#respond-accept-btn');
  rejectButton = modal.querySelector('#respond-reject-btn');
  detailsContainer = modal.querySelector('#respond-proposal-details');
  requesterNameEl = detailsContainer?.querySelector('#respond-requester-name');
  requesterShiftInfoEl = detailsContainer?.querySelector('#respond-requester-shift-info');
  targetShiftInfoEl = detailsContainer?.querySelector('#respond-target-shift-info');
  commentsContainer = detailsContainer?.querySelector('#respond-comments-container');
  commentsTextEl = commentsContainer?.querySelector('#respond-comments-text');
  if (!approveButton || !rejectButton || !detailsContainer || !requesterNameEl) return false;

  approveButton.addEventListener('click', () => handleResponse('Aprobado_Ambos'));
  rejectButton.addEventListener('click', () => handleResponse('Rechazado'));
  return true;
}

export async function openRespondToProposalModal(changeId) {
  currentChangeId = changeId;
  if (!modal) return;
  if (!_initializeInternalDOMElements()) return;

  modal.classList.remove('hidden');
  modal.style.display = 'flex';
  requesterNameEl.textContent = 'Cargando...';

  try {
    const allMyRequests = await getShiftChangeRequests();
    const proposal = allMyRequests.find((req) => req.id === changeId);
    if (proposal) {
      requesterNameEl.textContent = getAgentName(proposal.requesterAgentId);
      requesterShiftInfoEl.textContent = `${proposal.requesterShiftType} del ${formatDate(proposal.requesterShiftDate, 'dd/MM/yyyy')}`;
      targetShiftInfoEl.textContent = `${proposal.targetShiftType} del ${formatDate(proposal.targetShiftDate, 'dd/MM/yyyy')}`;
      if (proposal.requesterComments) {
        commentsTextEl.textContent = proposal.requesterComments;
        commentsContainer.style.display = 'block';
      } else {
        commentsContainer.style.display = 'none';
      }
    } else {
      requesterNameEl.textContent = 'Error';
      requesterShiftInfoEl.textContent = 'No se pudo cargar la propuesta.';
    }
  } catch (error) {
    requesterNameEl.textContent = 'Error';
    requesterShiftInfoEl.textContent = `Error al cargar: ${error.message}`;
  }
}

function hideRespondToProposalModal() {
  if (modal) modal.classList.add('hidden');
}

/**
 * Gestiona la respuesta del usuario (aceptar o rechazar) a una propuesta de cambio.
 * @param {string} newStatus - El nuevo estado para la solicitud ('Aprobado_Ambos' o 'Rechazado_Target').
 */
async function handleResponse(newStatus) {
  // Asegúrate de que la variable que guarda el ID de la propuesta se llame así en tu archivo.
  // Podría ser 'currentProposal.id' o 'currentChangeId'. Usaré 'currentChangeId' como en tu ejemplo.
  if (!currentChangeId) return;

  showLoading('Enviando respuesta...');
  try {
    // Llama a la función del dataController para actualizar la solicitud en la base de datos.
    await respondToShiftChangeRequest({ changeId: currentChangeId, newStatus });

    // Muestra un mensaje de éxito y cierra el modal.
    displayMessage('Respuesta enviada con éxito.', 'success');
    hideRespondToProposalModal();

    // Actualiza el contador de notificaciones en la barra de navegación.
    await updateNotificationCount();

    // --- INICIO DE LA CORRECCIÓN ---
    // Si la propuesta fue completamente aprobada, significa que el cuadrante ha cambiado.
    if (newStatus === 'Aprobado_Ambos') {
      // Disparamos el evento global para avisar a main.js que debe refrescar la vista del cuadrante.
      document.dispatchEvent(new CustomEvent('scheduleShouldRefresh'));
    }
    // --- FIN DE LA CORRECCIÓN ---
  } catch (error) {
    displayMessage(`Error al enviar la respuesta: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}
