// js/ui/shiftChangeRequestModal.js (Versión robusta con sintaxis verificada)

import { currentUser, availableAgents, scheduleData } from '../state.js';
import { displayMessage, showLoading, hideLoading } from './viewManager.js';
import { addShiftChangeRequest } from '../dataController.js';

let modal,
  form,
  closeButton,
  targetAgentSelect,
  requesterDateInput,
  targetDateInput,
  requesterShiftTypeDisplay,
  targetShiftTypeDisplay;
let commentsInput; // Added commentsInput for the form

// Esta es la función que se debe exportar. El nombre coincide con lo que main.js espera.
export function initShiftChangeRequestModal() {
  console.log('[DEBUG - shiftChangeRequestModal] initShiftChangeRequestModal llamado.');
  modal = document.getElementById('shift-change-request-modal');
  if (!modal) {
    console.error('Modal #shift-change-request-modal no encontrado.');
    return;
  }

  form = document.getElementById('shift-change-request-form');
  closeButton = modal.querySelector('.close-button'); // Use .close-button consistent with other modals
  targetAgentSelect = document.getElementById('scr-target-agent'); // Assuming ID scr-target-agent
  requesterDateInput = document.getElementById('scr-requester-date'); // Assuming ID scr-requester-date
  targetDateInput = document.getElementById('scr-target-date'); // Assuming ID scr-target-date
  requesterShiftTypeDisplay = document.getElementById('scr-requester-shift-type'); // Assuming ID scr-requester-shift-type
  targetShiftTypeDisplay = document.getElementById('scr-target-shift-type'); // Assuming ID scr-target-shift-type
  commentsInput = document.getElementById('scr-comments'); // Assuming ID scr-comments

  if (closeButton) closeButton.addEventListener('click', () => modal.classList.add('hidden'));
  if (form) form.addEventListener('submit', handleFormSubmit);
  if (requesterDateInput) requesterDateInput.addEventListener('change', updateRequesterShiftType);
  if (targetDateInput) targetDateInput.addEventListener('change', updateTargetShiftType);
  if (targetAgentSelect) targetAgentSelect.addEventListener('change', updateTargetShiftType); // Add listener for agent change
}

export function openShiftChangeRequestModal() {
  if (!modal) return;
  populateAgentSelector();
  if (form) form.reset();
  if (requesterShiftTypeDisplay) requesterShiftTypeDisplay.textContent = '---';
  if (targetShiftTypeDisplay) targetShiftTypeDisplay.textContent = '---';
  // Reset date inputs if needed or set to today
  if (requesterDateInput) requesterDateInput.value = '';
  if (targetDateInput) targetDateInput.value = '';

  modal.classList.remove('hidden');
  modal.style.display = 'flex'; // Ensure it's visible with flex
}

function populateAgentSelector() {
  const agents = availableAgents.get();
  const user = currentUser.get();

  if (!agents || agents.length === 0 || !user || !user.agentId) {
    if (targetAgentSelect) targetAgentSelect.innerHTML = '<option>Cargando agentes...</option>';
    return;
  }

  let optionsHtml = '<option value="">Selecciona un compañero...</option>';
  agents.forEach((agent) => {
    if (String(agent.id) !== String(user.agentId)) {
      // Ensure string comparison for agentId
      optionsHtml += `<option value="${agent.id}">${agent.name}</option>`;
    }
  });
  if (targetAgentSelect) targetAgentSelect.innerHTML = optionsHtml;
}

function findShiftTypeForDate(agentId, date) {
  const schedule = scheduleData.get();
  if (!schedule || !schedule.weeks || !agentId || !date) return '---';

  const targetDateString = date; // date is already in yyyy-MM-dd format from input.value

  for (const weekKey in schedule.weeks) {
    for (const dayKey in schedule.weeks[weekKey].days) {
      const day = schedule.weeks[weekKey].days[dayKey];
      if (day.date === targetDateString) {
        // Compare date strings
        // Find the shift for the specific agent on this day
        const shiftEntry = Object.values(day.shifts).find(
          (s) => String(s.agentId) === String(agentId)
        );
        return shiftEntry ? shiftEntry.shiftType : 'Libre'; // Default to 'Libre' if no specific shift
      }
    }
  }
  return '---'; // Not found
}

function updateRequesterShiftType() {
  const user = currentUser.get();
  if (requesterDateInput && requesterShiftTypeDisplay && user) {
    const shiftType = findShiftTypeForDate(user.agentId, requesterDateInput.value);
    requesterShiftTypeDisplay.textContent = shiftType;
  }
}

function updateTargetShiftType() {
  if (targetDateInput && targetAgentSelect && targetShiftTypeDisplay) {
    const shiftType = findShiftTypeForDate(targetAgentSelect.value, targetDateInput.value);
    targetShiftTypeDisplay.textContent = shiftType;
  }
}

async function handleFormSubmit(event) {
  event.preventDefault();
  showLoading();
  try {
    const user = currentUser.get();
    if (!user || !user.agentId) {
      throw new Error('Usuario no autenticado o ID de agente no disponible.');
    }

    const requestData = {
      requesterAgentId: String(user.agentId), // Ensure it's a string
      targetAgentId: String(targetAgentSelect.value), // Ensure it's a string
      requesterShiftDate: requesterDateInput.value,
      requesterShiftType: requesterShiftTypeDisplay.textContent,
      targetShiftDate: targetDateInput.value,
      targetShiftType: targetShiftTypeDisplay.textContent,
      requesterComments: commentsInput.value, // Use commentsInput here
    };

    if (
      !requestData.targetAgentId ||
      requestData.requesterShiftType === '---' ||
      requestData.targetShiftType === '---'
    ) {
      throw new Error('Por favor, selecciona un compañero y fechas válidas con turnos definidos.');
    }

    await addShiftChangeRequest(requestData);
    displayMessage('Solicitud de cambio de turno enviada correctamente.', 'success');
    modal.classList.add('hidden');
    modal.style.display = 'none'; // Hide with display none
  } catch (error) {
    displayMessage(`Error al enviar la solicitud: ${error.message}`, 'error');
    console.error('Error al enviar la solicitud de cambio de turno:', error);
  } finally {
    hideLoading();
  }
}
