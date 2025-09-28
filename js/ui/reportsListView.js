// js/ui/reportsListView.js

import { populateAgentSelector, populateMonthSelector, populateYearSelector } from './selectorManager.js';
import { getServiceReports, getActiveServiceOrdersForAgent, startServiceOrder, deleteServiceReport } from '../dataController.js';
import { displayMessage, showLoading, hideLoading } from './viewManager.js';
import { formatDate } from '../utils.js';
import { getAgentName } from './scheduleRenderer.js';
import { currentUser } from '../state.js';
import { showServiceReportView } from '../main.js';

let eventListenersInitialized = false;

// --- FUNCIÓN PRINCIPAL Y VISTA DE ADMINISTRADOR ---

export async function renderReportsList() {
  const user = currentUser.get();
  const isAdminView = user.role === 'admin' || user.role === 'supervisor';

  document.getElementById('admin-view-container').classList.toggle('hidden', !isAdminView);
  document.getElementById('agent-view-container').classList.toggle('hidden', isAdminView);

  if (isAdminView) {
    setupAdminFilters();
    await loadAdminReports();
    initializeReportsListViewEvents();
  } else {
    renderAgentView();
  }
}

function setupAdminFilters() {
  populateYearSelector(document.getElementById('report-filter-year'));
  populateMonthSelector(document.getElementById('report-filter-month'));
  populateAgentSelector(document.getElementById('report-filter-agent'), true);
}

async function loadAdminReports() {
  showLoading('Cargando partes de servicio...');
  try {
    const filters = {
      year: document.getElementById('report-filter-year').value,
      month: document.getElementById('report-filter-month').value,
      agentId: document.getElementById('report-filter-agent').value,
      status: document.getElementById('report-filter-status').value,
    };
    
    // ✅ CORRECCIÓN:
    // 1. Guardamos el objeto completo que viene del servidor en la variable 'result'.
    const result = await getServiceReports(filters);

    // 2. Comprobamos si la operación fue exitosa y si 'result.reports' es realmente una lista.
    if (result && result.success && Array.isArray(result.reports)) {
      // 3. Pasamos SÓLO la lista (el contenido de la caja) a la función que dibuja la tabla.
      renderAdminReportsTable(result.reports);
    } else {
      // Si algo falla o no vienen los datos esperados, dibujamos una tabla vacía.
      renderAdminReportsTable([]);
      // Y mostramos un mensaje si el servidor nos da uno.
      if (result && result.message) {
        displayMessage(result.message, 'info');
      }
    }
    
  } catch (error) {
    displayMessage(`Error al cargar los partes: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

function renderAdminReportsTable(reports) {
  const container = document.getElementById('reports-list-container');
  if (!container) return;

  if (!reports || reports.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>No se encontraron partes con los filtros seleccionados.</p></div>`;
    return;
  }

  container.innerHTML = `
    <table class="styled-table">
      <thead>
        <tr>
          <th>Nº Registro</th>
          <th>Título de la Orden</th>
          <th>Fecha</th>
          <th>Turno</th>
          <th>Estado</th>
          <th class="actions-cell">Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${reports.map(report => `
          <tr>
            <td>${report.order_reg_number || '---'}</td>
            <td>${report.order_title || 'N/A'}</td>
            <td>${new Date(report.created_at).toLocaleDateString()}</td>
            <td>${report.service_shift || 'N/A'}</td>
            <td><span class="status-pill status-${report.status}">${report.status.replace(/_/g, ' ')}</span></td>
            <td class="actions-cell">
              ${getActionButtonForReport(report)}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  if (window.feather) feather.replace();
}

function getActionButtonForReport(report) {
  let actions = '';
  const canDelete = currentUser.get().role === 'admin';

  switch (report.status) {
    case 'pending_review':
      actions += `<button class="button button-primary" data-action="review" data-report-id="${report.id}" title="Revisar Parte"><i data-feather="eye"></i><span>Revisar</span></button>`;
      break;
    default:
      actions += `<button class="button button-secondary" data-action="view" data-report-id="${report.id}" title="Ver Parte"><i data-feather="file-text"></i><span>Ver</span></button>`;
      break;
  }
  
  if (canDelete) {
    actions += `<button class="button button-danger button-icon" data-action="delete" data-report-id="${report.id}" title="Eliminar Parte"><i data-feather="trash-2"></i></button>`;
  }

  return actions;
}

function initializeReportsListViewEvents() {
  if (eventListenersInitialized) return;

  const adminViewContainer = document.getElementById('admin-view-container');
  if (!adminViewContainer) return;

  adminViewContainer.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;

    const reportId = button.dataset.reportId;
    const action = button.dataset.action;

    if (reportId) {
      if (action === 'review' || action === 'view') {
        showServiceReportView(reportId);
        return;
      }
      if (action === 'delete') {
        if (confirm('¿Seguro que quieres eliminar este parte de servicio? Esta acción no se puede deshacer.')) {
          showLoading('Eliminando...');
          try {
            await deleteServiceReport(reportId);
            displayMessage('Parte eliminado con éxito.', 'success');
            loadAdminReports();
          } catch (error) {
            displayMessage(`Error al eliminar: ${error.message}`, 'error');
          } finally {
            hideLoading();
          }
        }
        return;
      }
    }

    switch (button.id) {
      case 'apply-report-filters-btn':
        loadAdminReports();
        break;
      case 'clear-report-filters-btn':
        document.getElementById('report-filter-year').selectedIndex = 0;
        document.getElementById('report-filter-month').value = 'all';
        document.getElementById('report-filter-agent').selectedIndex = 0;
        document.getElementById('report-filter-status').selectedIndex = 0;
        loadAdminReports();
        break;
    }
  });

  eventListenersInitialized = true;
}

// --- LÓGICA PARA LA VISTA DE AGENTE ---

function renderAgentView() {
  loadAndRenderAgentOrders();
}

async function loadAndRenderAgentOrders() {
  const container = document.getElementById('agent-reports-list-container');
  if (!container) return;
  container.innerHTML = '<p class="info-message">Buscando servicio activo...</p>';
  try {
    const user = currentUser.get();
    if (!user || !user.agentId) throw new Error('No se pudo identificar al agente.');
    const activeOrders = await getActiveServiceOrdersForAgent(user.agentId);

    if (activeOrders.length === 0) {
      container.innerHTML = `<div class="empty-state compact"><i data-feather="coffee"></i><p>No tienes ninguna orden asignada o en progreso para hoy.</p></div>`;
    } else {
      container.innerHTML = activeOrders.map(createIntelligentOrderCard).join('');
    }
    initializeAgentCardListeners();
    if (window.feather) feather.replace();
  } catch (error) {
    container.innerHTML = `<p class="error-message">No se pudo cargar el parte activo. ${error.message}</p>`;
  }
}

function createIntelligentOrderCard(order) {
  const isInProgress = order.status === 'in_progress';
  const buttonText = isInProgress ? 'Continuar Parte' : 'Activar Parte';
  const buttonIcon = isInProgress ? 'edit' : 'play-circle';
  const buttonAction = isInProgress ? 'continue-report' : 'start-report';
  const buttonClass = isInProgress ? 'button-success' : 'button-primary';
  return `<div class="report-card">
    <div class="card-body">
      <h3 class="card-title">${order.title}</h3>
      <p class="card-subtitle">${order.order_reg_number || 'Sin Nº Registro'}</p>
      <div class="card-details">
        <div><i data-feather="calendar"></i><span>${formatDate(order.service_date, 'dd/MM/yyyy')}</span></div>
        <div><i data-feather="clock"></i><span>${order.service_shift}</span></div>
      </div>
      <div class="card-actions">
        <button class="button ${buttonClass}" data-action="${buttonAction}" data-order-id="${order.id}" ${isInProgress ? `data-report-id="${order.reportId}"` : ''}>
          <i data-feather="${buttonIcon}"></i>
          <span>${buttonText}</span>
        </button>
      </div>
    </div>
  </div>`;
}

function initializeAgentCardListeners() {
  const container = document.getElementById('agent-reports-list-container');
  if (!container || container.dataset.listenerAttached) return;
  container.dataset.listenerAttached = 'true';

  container.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const orderId = button.dataset.orderId;
    if (action === 'start-report') {
      if (!confirm('¿Seguro que quieres activar este parte de servicio?')) return;
      showLoading('Activando parte...');
      try {
        const result = await startServiceOrder(orderId);
        showServiceReportView(result.reportId);
      } catch (error) {
        displayMessage(`Error al activar: ${error.message}`, 'error');
      } finally {
        hideLoading();
      }
    } else if (action === 'continue-report') {
      const reportId = button.dataset.reportId;
      if (reportId) showServiceReportView(reportId);
    }
  });
}

// --- FUNCIÓN DE REINICIO ---
export function resetReportsListView() {
  eventListenersInitialized = false;
  const agentCardContainer = document.getElementById('agent-reports-list-container');
  if (agentCardContainer) {
    delete agentCardContainer.dataset.listenerAttached;
  }
}