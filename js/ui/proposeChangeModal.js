// js/ui/proposeChangeModal.js

import { currentUser, availableAgents, scheduleData } from '../state.js';
import { displayMessage, showLoading, hideLoading } from './viewManager.js';
import { addShiftChangeRequest, updateNotificationCount } from '../dataController.js';
import { getShiftDisplayText, formatDate, parseISO } from '../utils.js';

let modal = null;
let form = null;
let closeButton = null;
let submitButton = null;
let requesterShiftInfo = null;
let targetAgentSelect = null;
let targetDateInput = null;
let targetShiftInfo = null;
let commentsInput = null;

let currentProposal = {};

export function initializeProposeChangeModal() {
  modal = document.getElementById('propose-change-modal');
  if (!modal) return;

  closeButton = modal.querySelector('.close-button');
  if (closeButton) {
    closeButton.addEventListener('click', hideProposeChangeModal);
  }
}

function _initializeInternalDOMElements() {
  if (form) return true;

  form = modal.querySelector('#propose-change-form');
  submitButton = modal.querySelector('#propose-submit-btn');
  requesterShiftInfo = modal.querySelector('#propose-requester-shift-info');
  targetAgentSelect = modal.querySelector('#propose-target-agent-select');
  targetDateInput = modal.querySelector('#propose-target-date-input');
  targetShiftInfo = modal.querySelector('#propose-target-shift-info');
  commentsInput = modal.querySelector('#propose-comments');

  if (
    !form ||
    !submitButton ||
    !requesterShiftInfo ||
    !targetAgentSelect ||
    !targetDateInput ||
    !targetShiftInfo ||
    !commentsInput
  ) {
    console.error('ERROR - ProposeChangeModal: Fallo al encontrar elementos DOM internos.');
    return false;
  }

  form.addEventListener('submit', handleSubmitProposal);
  targetAgentSelect.addEventListener('change', fetchAndDisplayTargetShift);
  targetDateInput.addEventListener('change', fetchAndDisplayTargetShift);

  return true;
}

export function openProposeChangeModal(data) {
  const { requesterAgentId, requesterShiftDate, requesterShiftType } = data;

  currentProposal = { requesterAgentId, requesterShiftDate, requesterShiftType };

  if (!modal) {
    console.error('ERROR - ProposeChangeModal: El modal no está inicializado.');
    return;
  }

  const initialized = _initializeInternalDOMElements();
  if (!initialized) return;

  if (requesterShiftType === 'Libre' || requesterShiftType === 'L' || requesterShiftType === '-') {
    displayMessage('No se puede proponer un cambio para un día libre.', 'warning');
    return;
  }

  const dateObject = parseISO(requesterShiftDate);
  if (dateObject && !isNaN(dateObject)) {
    const formattedDate = formatDate(dateObject, "dd 'de' MMMM 'de' yyyy");
    requesterShiftInfo.textContent = `Turno ${requesterShiftType} del ${formattedDate}`;
  } else {
    requesterShiftInfo.textContent = 'Error: Fecha de turno no válida.';
    console.error('Fecha inválida recibida:', requesterShiftDate);
  }

  const agents = availableAgents.get();
  const userProfile = currentUser.get();
  targetAgentSelect.innerHTML = '<option value="">Selecciona un compañero...</option>';
  if (agents && userProfile) {
    agents.forEach((agent) => {
      if (String(agent.id) !== String(userProfile.agentId)) {
        targetAgentSelect.innerHTML += `<option value="${agent.id}">${agent.name}</option>`;
      }
    });
  }

  form.reset();
  targetShiftInfo.textContent = 'Selecciona compañero y fecha...';
  targetShiftInfo.style.color = 'inherit';
  submitButton.disabled = true;

  modal.classList.remove('hidden');
}

function hideProposeChangeModal() {
  if (modal) {
    modal.classList.add('hidden');
  }
}

async function fetchAndDisplayTargetShift() {
  const targetAgentId = targetAgentSelect.value;
  const targetDate = targetDateInput.value;

  submitButton.disabled = true;
  targetShiftInfo.textContent = '...';

  if (!targetAgentId || !targetDate) {
    targetShiftInfo.textContent = 'Selecciona compañero y fecha...';
    return;
  }

  const schedule = scheduleData.get();
  let foundShift = null;

  if (!schedule || !schedule.weeks) {
    targetShiftInfo.textContent = 'Cuadrante no disponible.';
    targetShiftInfo.style.color = 'var(--color-danger)';
    return;
  }

  for (const weekKey in schedule.weeks) {
    for (const dayKey in schedule.weeks[weekKey].days) {
      const day = schedule.weeks[weekKey].days[dayKey];
      if (day.date === targetDate) {
        const shiftEntry = Object.values(day.shifts).find(
          (s) => String(s.agentId) === String(targetAgentId)
        );
        if (shiftEntry) {
          foundShift = shiftEntry.shiftType;
        }
        break;
      }
    }
    if (foundShift !== null) break;
  }

  if (foundShift && (foundShift === 'Libre' || foundShift === 'L' || foundShift === '-')) {
    targetShiftInfo.textContent = 'El compañero ya está libre ese día.';
    targetShiftInfo.style.color = 'var(--color-danger)'; // Corregido a tu variable CSS
    submitButton.disabled = true;
    displayMessage(
      'No se puede solicitar un cambio de turno por un día libre del compañero.',
      'warning'
    );
    return;
  }

  if (foundShift) {
    targetShiftInfo.textContent = `${getShiftDisplayText(foundShift)}`;
    targetShiftInfo.style.color = 'var(--color-success)'; // Corregido a tu variable CSS
    currentProposal.targetAgentId = targetAgentId;
    currentProposal.targetDate = targetDate;
    currentProposal.targetShiftType = foundShift;
    submitButton.disabled = false;
  } else {
    targetShiftInfo.textContent = 'No se encontró turno para esa fecha.';
    targetShiftInfo.style.color = 'var(--color-danger)'; // Corregido a tu variable CSS
  }
}

async function handleSubmitProposal(event) {
  event.preventDefault();
  submitButton.disabled = true;

  const proposalData = {
    requesterAgentId: currentProposal.requesterAgentId,
    targetAgentId: currentProposal.targetAgentId,
    requesterShiftDate: currentProposal.requesterShiftDate,
    requesterShiftType: currentProposal.requesterShiftType,
    targetShiftDate: currentProposal.targetDate,
    targetShiftType: currentProposal.targetShiftType,
    requesterComments: commentsInput.value,
  };

  showLoading();
  try {
    await addShiftChangeRequest(proposalData);
    displayMessage('Solicitud de cambio de turno enviada correctamente.', 'success');
    hideProposeChangeModal();
    await updateNotificationCount();
  } catch (error) {
    displayMessage(`Error al enviar la propuesta: ${error.message}`, 'error');
    submitButton.disabled = false;
  } finally {
    hideLoading();
  }
}
