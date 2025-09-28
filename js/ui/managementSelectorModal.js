// js/ui/managementSelectorModal.js

import { showAgentManagerModal } from './agentManagerModal.js';
import { showManageRequestsModal } from './manageRequestsModal.js';
import { showAddMarkedDateModal } from './addMarkedDateModal.js';
// ✅ 1. Cambiamos la importación para apuntar a la nueva función de vista
import { showRegistroView } from '../main.js';

let modal;
let isInitialized = false;

export function initializeManagementSelectorModal() {
  if (isInitialized) return;

  modal = document.getElementById('management-selector-modal');
  if (!modal) return;

  const closeButton = modal.querySelector('.close-button');
  const manageAgentsButton = modal.querySelector('#select-manage-agents');
  const manageRequestsButton = modal.querySelector('#select-manage-requests');
  const addMarkedDateButton = modal.querySelector('#select-add-marked-date');
  const manageTemplatesButton = modal.querySelector('#select-manage-templates');

  if (closeButton) closeButton.addEventListener('click', hideManagementSelectorModal);

  if (manageAgentsButton)
    manageAgentsButton.addEventListener('click', () => {
      hideManagementSelectorModal();
      showAgentManagerModal();
    });

  if (manageRequestsButton)
    manageRequestsButton.addEventListener('click', () => {
      hideManagementSelectorModal();
      showManageRequestsModal();
    });

  if (addMarkedDateButton)
    addMarkedDateButton.addEventListener('click', () => {
      hideManagementSelectorModal();
      showAddMarkedDateModal();
    });

  // ✅ 2. Aplicamos tu cambio para llamar a showRegistroView con el parámetro 'plantillas'
  if (manageTemplatesButton) {
    manageTemplatesButton.addEventListener('click', () => {
      hideManagementSelectorModal();
      showRegistroView('plantillas'); // Llama a la vista de Registro y le pide mostrar la sub-vista de plantillas
    });
  }

  modal.addEventListener('click', (event) => {
    if (event.target === modal) hideManagementSelectorModal();
  });

  isInitialized = true;
}

export function showManagementSelectorModal() {
  if (!isInitialized) initializeManagementSelectorModal();
  if (modal) {
    modal.classList.remove('hidden');
    if (window.feather) {
      feather.replace(); // Asegura que los iconos se vean bien
    }
  }
}

export function hideManagementSelectorModal() {
  if (modal) modal.classList.add('hidden');
}
