// js/ui/viewOrderModal.js (VERSIÓN CORREGIDA)

import { getAgentName } from './scheduleRenderer.js';
import { formatDate } from '../utils.js';

let modal, closeButtons, title, regNumber, date, shift, status, description, agentsList;
let isInitialized = false;

// ✅ SE HA AÑADIDO LA PALABRA 'export'
export function initializeViewOrderModal() {
  if (isInitialized) return;

  modal = document.getElementById('view-order-modal');
  if (!modal) return;

  closeButtons = modal.querySelectorAll('.close-button');
  title = modal.querySelector('#view-order-title');
  regNumber = modal.querySelector('#view-order-reg-number');
  date = modal.querySelector('#view-order-date');
  shift = modal.querySelector('#view-order-shift');
  status = modal.querySelector('#view-order-status');
  description = modal.querySelector('#view-order-description');
  agentsList = modal.querySelector('#view-order-agents-list');

  closeButtons.forEach((btn) => btn.addEventListener('click', hideViewOrderModal));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) hideViewOrderModal();
  });

  isInitialized = true;
}

export function openViewOrderModal(orderData) {
  if (!isInitialized) initializeViewOrderModal();

  title.textContent = orderData.title || 'Detalles de la Orden';
  regNumber.textContent = orderData.order_reg_number || '---';
  date.textContent = formatDate(new Date(orderData.service_date), 'dd/MM/yyyy');
  shift.textContent = orderData.service_shift;
  status.innerHTML = `<span class="status-pill status-${orderData.status}">${orderData.status.replace('_', ' ')}</span>`;
  description.textContent = orderData.description || 'No hay descripción disponible.';

  if (orderData.assigned_agents && orderData.assigned_agents.length > 0) {
    agentsList.innerHTML = orderData.assigned_agents
      .map((agentId) => `<li>${getAgentName(agentId)}</li>`)
      .join('');
  } else {
    agentsList.innerHTML = '<li>No hay agentes asignados.</li>';
  }

  modal.classList.remove('hidden');
  if (window.feather) feather.replace();
}

function hideViewOrderModal() {
  if (modal) modal.classList.add('hidden');
}
