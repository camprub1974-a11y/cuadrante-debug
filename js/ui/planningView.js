// js/ui/planningView.js (VERSIÓN FINAL Y CORREGIDA)

import { displayMessage, showLoading, hideLoading } from './viewManager.js';
import { getServiceOrders, deleteServiceOrder, generateAiServiceOrder } from '../dataController.js';
import { formatDate } from '../utils.js';
import { initializeServiceOrderModal, openServiceOrderModal } from './serviceOrderModal.js';
import { openAssignmentModal } from './assignmentModal.js';
import { openViewOrderModal } from './viewOrderModal.js';
import { showServiceReportView } from '../main.js';

let isInitialized = false;
let currentOrders = [];

// --- FUNCIONES PRINCIPALES ---

export async function renderPlanningView() {
  try {
    // La inicialización ahora ocurre solo si es la primera vez.
    initializePlanningView();
    // La carga de datos siempre se ejecuta al entrar en la vista.
    await loadAndRenderOrders();
  } catch (error) {
    // Si la inicialización falla (porque falta un elemento HTML), se mostrará este error.
    console.error("Fallo crítico en la inicialización de PlanningView:", error);
    displayMessage(`Error al iniciar la vista: ${error.message}`, 'error');
    hideLoading();
  }
}

export function resetPlanningView() {
  // Resetea la bandera para permitir que la vista se reinicialice en la próxima visita.
  isInitialized = false;
}

// --- LÓGICA DE INICIALIZACIÓN Y EVENTOS (SE EJECUTA UNA SOLA VEZ) ---

function initializePlanningView() {
  if (isInitialized) return;

  const elements = {
    listContainer: document.getElementById('service-orders-list-container'),
    createOrderBtn: document.getElementById('create-order-btn'),
    aiGenerateBtn: document.getElementById('ai-generate-order-btn'),
    dateFilter: document.getElementById('order-filter-date'),
    shiftFilter: document.getElementById('order-filter-shift'),
    statusFilter: document.getElementById('order-filter-status'),
    applyFiltersBtn: document.getElementById('apply-filters-btn'),
    clearFiltersBtn: document.getElementById('clear-filters-btn'),
  };

  // Comprobación robusta: Si falta algún elemento, se lanza un error claro.
  for (const [key, element] of Object.entries(elements)) {
    if (!element) {
      throw new Error(`El elemento con ID para '${key}' no se encontró en planificacion.html.`);
    }
  }

  // Asignación de todos los event listeners.
  elements.createOrderBtn.addEventListener('click', () => openServiceOrderModal(null, loadAndRenderOrders));
  elements.aiGenerateBtn.addEventListener('click', () => handleAiGenerateClick(elements.dateFilter, elements.shiftFilter));
  elements.applyFiltersBtn.addEventListener('click', loadAndRenderOrders);
  elements.clearFiltersBtn.addEventListener('click', () => clearFilters(elements));
  elements.listContainer.addEventListener('click', handleTableActions);

  initializeServiceOrderModal(loadAndRenderOrders);
  
  // Estos eventos globales son para que la vista se refresque si se crea/actualiza una orden desde un modal.
  document.addEventListener('serviceOrderCreated', loadAndRenderOrders);
  document.addEventListener('serviceOrderUpdated', loadAndRenderOrders);
  
  isInitialized = true;
}

// --- LÓGICA DE DATOS Y RENDERIZADO ---

async function loadAndRenderOrders() {
  const listContainer = document.getElementById('service-orders-list-container');
  if (!listContainer) return;

  showLoading('Cargando órdenes...');
  
  try {
    const filters = {
      date: document.getElementById('order-filter-date').value || null,
      service_shift: document.getElementById('order-filter-shift').value !== 'all' ? document.getElementById('order-filter-shift').value : null,
      status: document.getElementById('order-filter-status').value !== 'all' ? document.getElementById('order-filter-status').value : null,
    };

    const result = await getServiceOrders(filters);
    currentOrders = result.success ? result.orders : [];
    renderOrdersTable(currentOrders);
  } catch (error) {
    displayMessage(`Error al cargar las órdenes: ${error.message}`, 'error');
    renderOrdersTable([]); // Mostramos la tabla vacía en caso de error
  } finally {
    hideLoading();
  }
}

function renderOrdersTable(orders) {
  const listContainer = document.getElementById('service-orders-list-container');
  if (!listContainer) return;

  if (orders.length === 0) {
    listContainer.innerHTML = `<div class="empty-state"><h4>No hay órdenes</h4><p>No se encontraron órdenes con los filtros actuales.</p></div>`;
    return;
  }

  listContainer.innerHTML = `
    <table class="data-table">
      <thead class="sticky-header">
        <tr>
          <th>Nº Registro</th><th>Título</th><th>Fecha y Turno</th>
          <th>Estado</th><th>Agentes</th><th style="text-align: left;">Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${orders.map(order => {
          const statusText = (order.status || 'unknown').replace('_', ' ');
          return `
            <tr data-id="${order.id}">
              <td>${order.order_reg_number || '---'}</td>
              <td>${order.title}</td>
              <td>${formatDate(new Date(order.service_date), 'dd/MM/yyyy')} - ${order.service_shift}</td>
              <td><span class="status-pill status-${order.status}">${statusText}</span></td>
              <td>${(order.assigned_agents || []).length}</td>
              <td class="actions-cell">
                <button class="icon-button" data-action="view" title="Ver Contenido"><i data-feather="eye"></i></button>
                <button class="icon-button" data-action="assign" title="Asignar Agentes"><i data-feather="user-plus"></i></button>
                <button class="icon-button" data-action="edit" title="Editar Orden"><i data-feather="edit-2"></i></button>
                <button class="icon-button" data-action="delete" title="Eliminar Orden"><i data-feather="trash-2"></i></button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
  if (window.feather) feather.replace();
}

// --- MANEJADORES DE ACCIONES (HANDLERS) ---

function handleTableActions(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const orderId = button.closest('tr')?.dataset.id;
  if (!orderId) return;

  const action = button.dataset.action;
  const orderToProcess = currentOrders.find(o => o.id === orderId);
  if (!orderToProcess) return;

  switch (action) {
    case 'view':
      openViewOrderModal(orderToProcess);
      break;
    case 'assign':
      openAssignmentModal(orderToProcess);
      break;
    case 'edit':
      openServiceOrderModal(orderId, loadAndRenderOrders);
      break;
    case 'delete':
      handleDeleteOrder(orderId);
      break;
  }
}

async function handleAiGenerateClick(dateFilter, shiftFilter) {
  const dateString = dateFilter.value;
  const shiftType = shiftFilter.value;

  if (!dateString || shiftType === 'all' || shiftType === 'Especial') {
    displayMessage('Por favor, selecciona una fecha y un turno específicos (Mañana, Tarde o Noche) para usar la IA.', 'info');
    return;
  }
  showLoading('Generando orden con IA...');
  try {
    const result = await generateAiServiceOrder(dateString, shiftType);
    displayMessage(result.message, 'success');
    await loadAndRenderOrders();
  } catch (error) {
    displayMessage(`Error de la IA: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

async function handleDeleteOrder(orderId) {
  if (confirm(`¿Estás seguro de que quieres eliminar esta orden?`)) {
    showLoading('Eliminando orden...');
    try {
      await deleteServiceOrder(orderId);
      displayMessage('Orden eliminada con éxito.', 'success');
      loadAndRenderOrders();
    } catch (error) {
      displayMessage(`Error al eliminar la orden: ${error.message}`, 'error');
    } finally {
      hideLoading();
    }
  }
}

function clearFilters(elements) {
  elements.dateFilter.value = '';
  elements.shiftFilter.value = 'all';
  elements.statusFilter.value = 'all';
  loadAndRenderOrders();
}