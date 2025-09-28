// js/ui/extraServicesRenderer.js (VERSIÓN CON LA CORRECCIÓN DE FUNCIONALIDAD)

import { currentUser, availableAgents } from '../state.js';
import { getExtraServices, getAllExtraServices, updateExtraService } from '../dataController.js';
import { showLoading, hideLoading, displayMessage } from './viewManager.js';
import { EXTRA_SERVICE_TYPES } from '../constants.js';
import { formatDate } from '../utils.js';
import { showExtraServiceModal } from './extraServiceModal.js';
import { openPdfOptionsModal } from './pdfOptionsModal.js';
import { Chart } from 'chart.js/auto';

Chart.register();

// --- Variables de Módulo ---
let calendar = null;
let guardDataCache = [];
let statsChart = null;
let agentStatsChart = null;
const EVENT_COLORS = {
  diurno: '#3b82f6',
  nocturno: '#1f2937',
  festivo: '#f59e0b',
  festivo_nocturno: '#ef4444',
};
let isInitialized = false;

// --- Función Principal de Renderizado ---
export function renderExtraServicesView() {
  initializeViewListeners(); // Se asegura de que los listeners estén activos
  const userProfile = currentUser.get();
  if (!userProfile) {
    displayMessage('No se pudo determinar el rol del usuario.', 'error');
    return;
  }
  const guardView = document.getElementById('extra-services-guard-view');
  const adminView = document.getElementById('extra-services-admin-view');
  const statsSidebar = document.querySelector('#extra-services-view-content .sidebar-column');
  if (userProfile.role === 'admin' || userProfile.role === 'supervisor') {
    if (guardView) guardView.classList.add('hidden');
    if (adminView) adminView.classList.remove('hidden');
    if (statsSidebar) statsSidebar.classList.remove('hidden');
    initializeStatsPanel();
    renderAdminView();
  } else {
    if (adminView) adminView.classList.add('hidden');
    if (guardView) guardView.classList.remove('hidden');
    if (statsSidebar) statsSidebar.classList.add('hidden');
    renderGuardView();
  }
}

// ===== INICIO DE LA SOLUCIÓN: Delegación de Eventos =====
/**
 * Inicializa los listeners en un contenedor padre para que no se pierdan
 * al volver a renderizar la vista. Esto soluciona el problema de los filtros.
 */
function initializeViewListeners() {
    if (isInitialized) return;

    const container = document.getElementById('extra-services-view-content');
    if (!container) return;

    container.addEventListener('click', async (event) => {
        const target = event.target;

        // Listener para el botón de aplicar filtros del admin
        if (target.closest('#admin-service-apply-filters-btn')) {
            executeAdminSearch();
        }

        // Listener para el botón de limpiar filtros del admin
        if (target.closest('#admin-service-clear-filters-btn')) {
            populateAdminDateFilters();
            document.getElementById('admin-service-filter-agent').value = 'all';
            document.getElementById('admin-service-filter-type').value = 'all';
            executeAdminSearch();
        }
        
        // Listener para el botón de generar PDF
        if (target.closest('#generate-pdf-report-btn')) {
             openPdfOptionsModal('extra_services');
        }

        // Listener para los botones de editar en la tabla del admin
        const editButton = target.closest('.edit-service-btn');
        if (editButton) {
            const serviceId = editButton.closest('tr').dataset.serviceId;
            showLoading();
            try {
                const services = await getAllExtraServices({}); // Obtenemos todos para encontrar el que queremos
                const serviceToEdit = services.find((s) => s.id === serviceId);
                if (serviceToEdit) {
                    showExtraServiceModal('edit', serviceToEdit.date, serviceToEdit, executeAdminSearch);
                }
            } catch (error) {
                displayMessage('Error al obtener el servicio para editar: ' + error.message, 'error');
            } finally {
                hideLoading();
            }
        }
    });

    isInitialized = true;
}
// ===== FIN DE LA SOLUCIÓN =====


// --- Lógica para la Vista de Agente (sin cambios) ---
function renderGuardView() {
  const calendarEl = document.getElementById('extra-services-calendar');
  if (!calendarEl) return;
  if (!calendar) {
    const isMobile = window.innerWidth <= 768;
    const desktopToolbar = { left: 'prev,next today addServiceButton', center: 'title', right: 'dayGridMonth,dayGridWeek' };
    const mobileToolbar = { left: 'prev,next', center: 'title', right: 'addServiceButton,listWeek' };
    calendar = new FullCalendar.Calendar(calendarEl, {
      headerToolbar: isMobile ? mobileToolbar : desktopToolbar,
      initialView: isMobile ? 'listWeek' : 'dayGridMonth',
      locale: 'es',
      buttonText: { prev: '< Mes', next: ' >', today: 'Hoy', month: 'Mes', week: 'Semana' },
      customButtons: {
        addServiceButton: { text: 'Añadir', click: () => showExtraServiceModal('add', new Date(), null, () => calendar.refetchEvents()) },
      },
      editable: true,
      selectable: true,
      select: handleDateSelect,
      eventClick: handleEventClick,
      eventDrop: handleEventDrop,
      events: loadServicesForCalendarAndRenderComponents,
    });
    calendar.render();
  } else {
    calendar.refetchEvents();
  }
}

async function loadServicesForCalendarAndRenderComponents(fetchInfo, successCallback, failureCallback) {
  showLoading();
  try {
    const agentId = currentUser.get().agentId;
    const services = await getExtraServices(agentId, fetchInfo.start, fetchInfo.end);
    guardDataCache = services;
    renderServicesTableForGuard(services);
    renderStatsForGuard(services);
    const eventsForCalendar = services.map((service) => ({
      id: service.id,
      title: `${EXTRA_SERVICE_TYPES[service.type]?.name || 'Desconocido'} (${service.hours}h)`,
      start: formatDate(service.date, 'yyyy-MM-dd'),
      color: EVENT_COLORS[service.type],
      extendedProps: service,
    }));
    successCallback(eventsForCalendar);
  } catch (error) {
    failureCallback(error);
    displayMessage('Error al cargar servicios.', 'error');
  } finally {
    hideLoading();
  }
}

function renderServicesTableForGuard(services) {
  const container = document.getElementById('agent-services-list-container');
  if (!container) return;
  if (services.length === 0) {
    container.innerHTML = `<div class="empty-state compact"><p>No hay servicios registrados en este periodo.</p></div>`;
    return;
  }
  container.innerHTML = `<table class="data-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Horas</th><th>Observaciones</th></tr></thead><tbody>${services.map((service) => `<tr><td>${formatDate(service.date, 'dd/MM/yyyy')}</td><td>${EXTRA_SERVICE_TYPES[service.type]?.name || service.type}</td><td>${service.hours}</td><td>${service.notes || '---'}</td></tr>`).join('')}</tbody></table>`;
}

function renderStatsForGuard(services) {
  const container = document.getElementById('agent-stats-container');
  if (!container) return;
  const stats = { totalHoras: 0, totalValor: 0, horasPorTipo: {} };
  Object.keys(EXTRA_SERVICE_TYPES).forEach((key) => (stats.horasPorTipo[key] = 0));
  services.forEach((service) => {
    const hours = Number(service.hours) || 0;
    const price = EXTRA_SERVICE_TYPES[service.type]?.price || 0;
    stats.totalHoras += hours;
    stats.totalValor += hours * price;
    if (stats.horasPorTipo.hasOwnProperty(service.type)) {
      stats.horasPorTipo[service.type] += hours;
    }
  });
  container.innerHTML = `
        <div class="stat-card total"><span class="stat-value">${stats.totalHoras.toFixed(2)} h</span><span class="stat-label">Horas Totales</span></div>
        <div class="stat-card total"><span class="stat-value">${stats.totalValor.toFixed(2)} €</span><span class="stat-label">Valor Estimado</span></div>`;
  renderAgentStatsChart(stats.horasPorTipo);
}

function renderAgentStatsChart(hoursByType) {
  const ctx = document.getElementById('agent-stats-chart');
  if (!ctx) return;
  if (agentStatsChart) agentStatsChart.destroy();
  agentStatsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.values(EXTRA_SERVICE_TYPES).map((t) => t.name),
      datasets: [{
        label: 'Horas por Tipo',
        data: Object.keys(EXTRA_SERVICE_TYPES).map((typeKey) => hoursByType[typeKey] || 0),
        backgroundColor: Object.values(EVENT_COLORS),
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (context) => ` Horas: ${context.raw.toFixed(2)}` } },
        datalabels: { anchor: 'end', align: 'top', formatter: (value) => (value > 0 ? value.toFixed(2) + 'h' : ''), color: '#555', font: { weight: 'bold' } },
      },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

// --- Lógica de Eventos del Calendario ---
function handleDateSelect(info) {
  showExtraServiceModal('add', info.startStr, null, () => calendar.refetchEvents());
  calendar.unselect();
}

function handleEventClick(info) {
  const service = info.event.extendedProps;
  showExtraServiceModal('edit', service.date, service, () => calendar.refetchEvents());
}

async function handleEventDrop(info) {
  const serviceId = info.event.id;
  const newDate = info.event.startStr;
  const serviceToUpdate = guardDataCache.find((s) => s.id === serviceId);
  if (serviceToUpdate) {
    showLoading();
    try {
      const { id, ...dataToUpdate } = serviceToUpdate;
      dataToUpdate.date = new Date(newDate);
      await updateExtraService(serviceId, dataToUpdate);
      displayMessage('Servicio actualizado.', 'success');
    } catch (error) {
      info.revert();
      displayMessage('Error al actualizar servicio.', 'error');
    } finally {
      calendar.refetchEvents();
      hideLoading();
    }
  }
}

// --- Lógica para la Vista de Admin (sin cambios, ahora controlada por los listeners) ---
function renderAdminView() {
  populateAdminFilters();
  populateAdminDateFilters();
  executeAdminSearch();
}

function populateAdminFilters() {
  const adminFilterAgent = document.getElementById('admin-service-filter-agent');
  const adminFilterType = document.getElementById('admin-service-filter-type');
  if (!adminFilterAgent || !adminFilterType) return;
  adminFilterAgent.innerHTML = '<option value="all">Todos los agentes</option>';
  availableAgents.get().forEach((agent) => adminFilterAgent.add(new Option(agent.name, agent.id)));
  adminFilterType.innerHTML = '<option value="all">Todos los tipos</option>';
  Object.entries(EXTRA_SERVICE_TYPES).forEach(([key, value]) => adminFilterType.add(new Option(value.name, key)));
}

function populateAdminDateFilters() {
  const startDateInput = document.getElementById('admin-service-filter-start-date');
  const endDateInput = document.getElementById('admin-service-filter-end-date');
  if (!startDateInput || !endDateInput) return;
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  startDateInput.value = formatDate(firstDay, 'yyyy-MM-dd');
  endDateInput.value = formatDate(lastDay, 'yyyy-MM-dd');
}

async function executeAdminSearch() {
  const filters = {
    agentId: document.getElementById('admin-service-filter-agent').value,
    type: document.getElementById('admin-service-filter-type').value,
    startDate: document.getElementById('admin-service-filter-start-date').value,
    endDate: document.getElementById('admin-service-filter-end-date').value,
  };
  showLoading('Filtrando servicios...');
  try {
    const services = await getAllExtraServices(filters);
    renderAdminTable(services);
  } catch (error) {
    displayMessage('Error al buscar servicios: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
}

function renderAdminTable(services) {
  const adminTableContainer = document.getElementById('admin-services-table-container');
  if (!adminTableContainer) return;
  if (!services || services.length === 0) {
    adminTableContainer.innerHTML = `<div class="empty-state"><p>No se encontraron servicios con los filtros aplicados.</p></div>`;
    return;
  }
  const agentsMap = new Map(availableAgents.get().map((agent) => [String(agent.id), agent.name]));
  let tableHTML = `<table class="data-table"><thead><tr><th>Agente</th><th>Fecha</th><th>Tipo</th><th>Horas</th><th>Observaciones</th><th>Acciones</th></tr></thead><tbody>`;
  services.forEach((service) => {
    tableHTML += `<tr data-service-id="${service.id}"><td>${agentsMap.get(String(service.agentId)) || 'Desconocido'}</td><td>${formatDate(service.date, 'dd/MM/yyyy')}</td><td>${EXTRA_SERVICE_TYPES[service.type]?.name || 'N/A'}</td><td>${service.hours}</td><td class="notes-cell">${service.notes || '-'}</td><td class="actions-cell"><button class="button button-icon button-secondary edit-service-btn" title="Editar"><span class="material-icons">edit</span></button></td></tr>`;
  });
  tableHTML += `</tbody></table>`;
  adminTableContainer.innerHTML = tableHTML;
}

// --- Lógica del Panel de Estadísticas (sin cambios) ---
function initializeStatsPanel() {
  const yearSelect = document.getElementById('extra-stats-year-select');
  const monthSelect = document.getElementById('extra-stats-month-select');
  const agentSelect = document.getElementById('extra-stats-agent-select');
  const typeSelect = document.getElementById('extra-stats-type-select');
  if (!yearSelect || !monthSelect || !agentSelect || !typeSelect) return;
  const now = new Date();
  const currentYear = now.getFullYear();
  if (yearSelect.options.length === 0) {
    for (let y = currentYear - 3; y <= currentYear + 1; y++) yearSelect.add(new Option(y, y));
  }
  yearSelect.value = currentYear;
  if (monthSelect.options.length === 0) {
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    meses.forEach((mes, index) => monthSelect.add(new Option(mes, index)));
  }
  monthSelect.value = now.getMonth();
  agentSelect.innerHTML = '<option value="all">Todos los Agentes</option>';
  availableAgents.get().forEach((agent) => agentSelect.add(new Option(agent.name, agent.id)));
  typeSelect.innerHTML = '<option value="all">Todos los Tipos</option>';
  Object.entries(EXTRA_SERVICE_TYPES).forEach(([key, value]) => typeSelect.add(new Option(value.name, key)));
  [yearSelect, monthSelect, agentSelect, typeSelect].forEach((select) => select.addEventListener('change', updateStats));
  updateStats();
}

async function updateStats() {
  showLoading('Actualizando estadísticas...');
  try {
    const filters = {
      startDate: new Date(document.getElementById('extra-stats-year-select').value, document.getElementById('extra-stats-month-select').value, 1).toISOString().split('T')[0],
      endDate: new Date(document.getElementById('extra-stats-year-select').value, parseInt(document.getElementById('extra-stats-month-select').value) + 1, 0, 23, 59, 59).toISOString().split('T')[0],
      agentId: document.getElementById('extra-stats-agent-select').value,
      type: document.getElementById('extra-stats-type-select').value,
    };
    const services = await getAllExtraServices(filters);
    const stats = { totalCost: 0, hoursByType: {} };
    Object.keys(EXTRA_SERVICE_TYPES).forEach((typeKey) => { stats.hoursByType[typeKey] = 0; });
    if (services) {
      services.forEach((service) => {
        if (stats.hoursByType.hasOwnProperty(service.type)) stats.hoursByType[service.type] += service.hours;
        stats.totalCost += service.hours * (EXTRA_SERVICE_TYPES[service.type]?.price || 0);
      });
    }
    renderStatsChart(stats.hoursByType);
    document.getElementById('extra-stats-total-price').textContent = `${stats.totalCost.toFixed(2)}€`;
  } catch (error) {
    displayMessage(`Error al actualizar estadísticas: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

function renderStatsChart(hoursByType) {
  const ctx = document.getElementById('extra-stats-chart-admin');
  if (!ctx) return;
  if (statsChart) statsChart.destroy();
  statsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.values(EXTRA_SERVICE_TYPES).map((t) => t.name),
      datasets: [{
        label: 'Horas Trabajadas',
        data: Object.keys(EXTRA_SERVICE_TYPES).map((typeKey) => hoursByType[typeKey] || 0),
        backgroundColor: ['#3b82f6', '#1f2937', '#f59e0b', '#ef4444'],
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

export function resetExtraServicesView() {
  isInitialized = false;
  if (statsChart) {
    statsChart.destroy();
    statsChart = null;
  }
  if (agentStatsChart) {
    agentStatsChart.destroy();
    agentStatsChart = null;
  }
  calendar = null;
}