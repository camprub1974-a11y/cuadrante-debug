// js/ui/assignmentModal.js
import { displayMessage, showLoading, hideLoading } from './viewManager.js';
import { assignResourcesToOrder, getScheduleForMonth } from '../dataController.js';
import { availableAgents } from '../state.js';
import { formatDate } from '../utils.js';

let modal, form, closeButton, modalTitle, orderDetails, agentListContainer;
let currentOrderId = null;
let isInitialized = false;

export function initializeAssignmentModal() {
  if (isInitialized) return;
  modal = document.getElementById('assignment-modal');
  if (!modal) return;

  form = modal.querySelector('#assignment-form');
  closeButton = modal.querySelector('.close-button');
  modalTitle = modal.querySelector('#assignment-modal-title');
  orderDetails = modal.querySelector('#assignment-order-details');
  agentListContainer = modal.querySelector('#assignment-agent-list');

  closeButton.addEventListener('click', () => modal.classList.add('hidden'));
  form.addEventListener('submit', handleFormSubmit);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });

  agentListContainer.addEventListener('change', (event) => {
    if (event.target.type === 'checkbox') {
      updateRadioButtonsState();
    }
  });
  isInitialized = true;
}

export async function openAssignmentModal(order) {
  if (!isInitialized) return;
  showLoading();
  try {
    currentOrderId = order.id;
    modalTitle.textContent = `Asignar Recursos a: ${order.title}`;
    const orderDate = new Date(order.service_date);
    orderDetails.textContent = `Fecha: ${formatDate(orderDate, 'dd/MM/yyyy')} - Turno: ${order.service_shift}`;
    const monthName = formatDate(orderDate, 'MMMM', 'es').toLowerCase();
    const year = orderDate.getFullYear();
    const monthId = `cuadrante_${monthName}_${year}`;
    const schedule = await getScheduleForMonth(monthId);
    const agentsOnShift = findAgentsOnShift(orderDate, order.service_shift, schedule);
    populateAgentTable(order.assigned_agents || [], agentsOnShift, order.shift_manager_id);
    modal.classList.remove('hidden');
  } catch (error) {
    displayMessage(`Error al preparar la asignación: ${error.message}`, 'error');
    modal.classList.add('hidden');
  } finally {
    hideLoading();
  }
}

function populateAgentTable(assignedAgentIds = [], scheduledAgentIds = [], shiftManagerId = null) {
  const allAvailableAgents = availableAgents.get().filter((agent) => agent.active);
  const AGENT_SENIORITY_ORDER = ['4684', '4687', '5281', '5605', '8498'];
  const defaultManager = AGENT_SENIORITY_ORDER.find((id) => scheduledAgentIds.includes(id)) || null;

  agentListContainer.innerHTML = `
        <table class="data-table assignment-table">
            <thead> <tr> <th class="checkbox-col"></th> <th>ID</th> <th>Agente</th> <th>Turno</th> <th class="radio-col">Responsable</th> </tr> </thead>
            <tbody>
                ${allAvailableAgents
                  .map((agent) => {
                    const agentIdStr = String(agent.id);
                    const isAssigned = assignedAgentIds.includes(agentIdStr);
                    const isScheduled = scheduledAgentIds.includes(agentIdStr);
                    const isChecked = isAssigned || isScheduled;
                    const isManager = shiftManagerId
                      ? agentIdStr === String(shiftManagerId)
                      : agentIdStr === defaultManager && isScheduled;
                    return `<tr>
                        <td class="checkbox-col"><input type="checkbox" id="agent-assign-${agent.id}" value="${agent.id}" ${isChecked ? 'checked' : ''}></td>
                        <td>${agent.id}</td>
                        <td class="agent-name-cell">${agent.name}</td>
                        <td>${isScheduled ? '<span class="status-badge status-on-shift">De Turno</span>' : '<span class="status-badge status-inactive">Fuera de Turno</span>'}</td>
                        <td class="radio-col"><input type="radio" name="shift-manager" value="${agent.id}" ${isManager ? 'checked' : ''} ${!isChecked ? 'disabled' : ''}></td>
                    </tr>`;
                  })
                  .join('')}
            </tbody>
        </table>`;
}

function updateRadioButtonsState() {
  agentListContainer.querySelectorAll('tbody tr').forEach((row) => {
    const checkbox = row.querySelector('input[type="checkbox"]');
    const radio = row.querySelector('input[type="radio"]');
    radio.disabled = !checkbox.checked;
    if (!checkbox.checked) {
      radio.checked = false;
    }
  });
}

async function handleFormSubmit(event) {
  event.preventDefault();
  const selectedAgentIds = Array.from(form.querySelectorAll('input[type="checkbox"]:checked')).map(
    (cb) => cb.value
  );
  const selectedManager = form.querySelector('input[type="radio"]:checked');
  const shiftManagerId = selectedManager ? selectedManager.value : null;

  if (selectedAgentIds.length > 0 && !shiftManagerId) {
    displayMessage('Por favor, selecciona un responsable para el turno.', 'warning');
    return;
  }

  showLoading();
  try {
    await assignResourcesToOrder({
      orderId: currentOrderId,
      agentIds: selectedAgentIds,
      shiftManagerId,
    });
    displayMessage('Asignación guardada con éxito.', 'success');
    modal.classList.add('hidden');
    document.dispatchEvent(new CustomEvent('serviceOrderUpdated'));
  } catch (error) {
    displayMessage(`Error: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

function findAgentsOnShift(date, shiftFullName, schedule) {
  const shiftNameMap = { mañana: 'M', tarde: 'T', noche: 'N' };
  const shiftShortCode = shiftNameMap[shiftFullName.toLowerCase()];
  if (!shiftShortCode || !schedule || !schedule.weeks) return [];
  const dateString = formatDate(date, 'yyyy-MM-dd');
  const agentIdsOnShift = [];
  for (const weekKey in schedule.weeks) {
    for (const dayKey in schedule.weeks[weekKey].days) {
      const day = schedule.weeks[weekKey].days[dayKey];
      if (day.date === dateString) {
        for (const shiftKey in day.shifts) {
          const shiftInfo = day.shifts[shiftKey];
          if (shiftInfo.shiftType?.toUpperCase() === shiftShortCode.toUpperCase()) {
            agentIdsOnShift.push(String(shiftInfo.agentId));
          }
        }
        return agentIdsOnShift;
      }
    }
  }
  return agentIdsOnShift;
}
