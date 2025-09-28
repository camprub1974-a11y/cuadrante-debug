// js/ui/agentManagerModal.js

import { displayMessage, hideLoading, showLoading } from './viewManager.js';
import { addAgent, deleteAgent, loadInitialAgents, updateAgent } from '../dataController.js';
import { availableAgents } from '../state.js';

let agentManagerModal;
let agentListContainer;
let agentForm;
let agentIdInput;
let agentNameInput;
let agentActiveCheckbox;
let saveAgentButton;
let cancelAgentEditButton;
let addAgentButton;
let formTitleSpan;

let isEditMode = false;
let areListenersAttached = false;

function _initializeDOMElements() {
  if (agentManagerModal) return true;

  agentManagerModal = document.getElementById('agent-manager-modal');
  if (!agentManagerModal) {
    console.error('Error Crítico: El modal #agent-manager-modal no existe en el DOM.');
    return false;
  }

  agentListContainer = agentManagerModal.querySelector('#agentListContainer'); // Se usa querySelector para más flexibilidad
  agentForm = document.getElementById('agent-form');
  agentIdInput = document.getElementById('agent-id-input');
  agentNameInput = document.getElementById('agent-name-input');
  agentActiveCheckbox = document.getElementById('agent-active-checkbox');
  saveAgentButton = agentForm.querySelector('button[type="submit"]');
  cancelAgentEditButton = document.getElementById('cancel-agent-edit-button');
  addAgentButton = document.getElementById('add-agent-button');
  formTitleSpan = document.getElementById('form-title');
  const closeButton = agentManagerModal.querySelector('.close-button');

  const elements = {
    agentListContainer,
    agentForm,
    agentIdInput,
    agentNameInput,
    agentActiveCheckbox,
    saveAgentButton,
    cancelAgentEditButton,
    addAgentButton,
    formTitleSpan,
    closeButton,
  };
  for (const key in elements) {
    if (!elements[key]) {
      console.error(
        `Error Crítico: El elemento del modal con id/clase '${key}' no fue encontrado.`
      );
      displayMessage('Error al cargar el formulario de agentes. Faltan componentes.', 'error');
      return false;
    }
  }
  return true;
}

function _attachEventListeners() {
  if (areListenersAttached) return;

  const closeButton = agentManagerModal.querySelector('.close-button');
  closeButton.addEventListener('click', hideAgentManagerModal);
  agentManagerModal.addEventListener('click', (event) => {
    if (event.target === agentManagerModal) hideAgentManagerModal();
  });

  addAgentButton.addEventListener('click', () => {
    isEditMode = false;
    agentForm.reset();
    agentIdInput.value = '';
    agentIdInput.readOnly = false;
    agentActiveCheckbox.checked = true;
    formTitleSpan.textContent = 'Añadir Nuevo Agente';
    agentForm.classList.remove('hidden');
  });

  cancelAgentEditButton.addEventListener('click', () => {
    agentForm.classList.add('hidden');
  });

  agentForm.addEventListener('submit', handleSaveAgent);

  availableAgents.subscribe(displayAgentList);

  areListenersAttached = true;
}

export function initializeAgentManagerModal() {
  if (_initializeDOMElements()) {
    _attachEventListeners();
  }
}

export function showAgentManagerModal() {
  if (!_initializeDOMElements()) {
    return;
  }

  agentManagerModal.classList.remove('hidden');
  agentForm.classList.add('hidden');
  displayAgentList();
}

export function hideAgentManagerModal() {
  if (!agentManagerModal) return;
  agentManagerModal.classList.add('hidden');
}

function displayAgentList() {
  if (!agentListContainer) return;

  const agents = availableAgents.get();

  // ✅ NUEVA LÓGICA PARA CONSTRUIR LA TABLA
  if (agents && agents.length > 0) {
    const sortedAgents = [...agents].sort((a, b) => a.name.localeCompare(b.name));
    const tableHtml = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Nombre del Agente</th>
                        <th>Estado</th>
                        <th class="actions-header">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${sortedAgents
                      .map(
                        (agent) => `
                        <tr>
                            <td>${agent.id}</td>
                            <td class="agent-name-cell">${agent.name}</td>
                            <td>
                                <span class="status-badge ${agent.active ? 'status-active' : 'status-inactive'}">
                                    ${agent.active ? 'Activo' : 'Inactivo'}
                                </span>
                            </td>
                            <td class="actions-cell">
                                <button class="button button-icon button-secondary edit-agent-btn" title="Editar Agente" data-agent-id="${String(agent.id)}">
                                    <span class="material-icons">edit</span>
                                </button>
                                <button class="button button-icon button-danger delete-agent-btn" title="Eliminar Agente" data-agent-id="${String(agent.id)}">
                                    <span class="material-icons">delete</span>
                                </button>
                            </td>
                        </tr>
                    `
                      )
                      .join('')}
                </tbody>
            </table>
        `;
    agentListContainer.innerHTML = tableHtml;
  } else {
    agentListContainer.innerHTML = '<p class="info-message">No hay agentes para mostrar.</p>';
  }

  // Re-asignar listeners a los botones de la lista
  agentListContainer.querySelectorAll('.edit-agent-btn').forEach((button) => {
    button.addEventListener('click', (e) => handleEditAgent(e.currentTarget.dataset.agentId));
  });
  agentListContainer.querySelectorAll('.delete-agent-btn').forEach((button) => {
    button.addEventListener('click', (e) => handleDeleteAgent(e.currentTarget.dataset.agentId));
  });
}

function handleEditAgent(agentId) {
  const agent = availableAgents.get().find((a) => String(a.id) === String(agentId));
  if (agent) {
    isEditMode = true;
    formTitleSpan.textContent = 'Editar Agente';
    agentIdInput.value = agent.id;
    agentIdInput.readOnly = true;
    agentNameInput.value = agent.name;
    agentActiveCheckbox.checked = agent.active;
    agentForm.classList.remove('hidden');
  }
}

async function handleDeleteAgent(agentId) {
  if (!confirm(`¿Seguro que quieres eliminar al agente ${agentId}?`)) return;
  showLoading();
  try {
    await deleteAgent(String(agentId));
    await loadInitialAgents();
    displayMessage('Agente eliminado con éxito.', 'success');
  } catch (error) {
    displayMessage(`Error al eliminar agente: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

async function handleSaveAgent(event) {
  event.preventDefault();
  const name = agentNameInput.value.trim();
  const active = agentActiveCheckbox.checked;
  const agentId = agentIdInput.value.trim();

  if (!name) {
    displayMessage('El nombre del agente es requerido.', 'warning');
    return;
  }

  showLoading();
  try {
    if (isEditMode) {
      await updateAgent(String(agentId), { name, active });
      displayMessage('Agente actualizado con éxito.', 'success');
    } else {
      if (agentId && availableAgents.get().some((a) => String(a.id) === String(agentId))) {
        throw new Error(`El agente con ID ${agentId} ya existe.`);
      }
      await addAgent({ id: agentId || null, name, active });
      displayMessage('Agente añadido con éxito.', 'success');
    }
    await loadInitialAgents();
    agentForm.classList.add('hidden');
  } catch (error) {
    displayMessage(`Error al guardar agente: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}
