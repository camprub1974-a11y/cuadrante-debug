// js/ui/adminDashboardView.js

import { getAdminDashboardStats } from '../dataController.js';
import { displayMessage, showLoading, hideLoading } from './viewManager.js';
import { Chart, registerables } from 'chart.js/auto';
import { formatDate } from '../utils.js';
import { showServiceReportView } from '../main.js';

// Registrar todos los componentes de Chart.js
Chart.register(...registerables);

let viewContainer;
let dateFilterSelect;
let kpiContainer, chartsContainer, requerimientosContainer;
let actuacionesChartInstance = null;
let requerimientosChartInstance = null;
let isInitialized = false;

/**
 * Inicializa el panel de control del administrador, configurando los listeners de los filtros.
 */
export function initializeAdminDashboardView() {
  if (isInitialized) return;

  viewContainer = document.getElementById('admin-dashboard-view');
  if (!viewContainer) return;

  // Crear el HTML base para la vista del dashboard
  viewContainer.innerHTML = `
        <div class="card">
            <div class="dashboard-filters">
                <h4>Seleccionar Periodo</h4>
                <select id="dashboard-date-filter" class="selector">
                    <option value="today">Hoy</option>
                    <option value="last7days">Últimos 7 días</option>
                    <option value="this_month" selected>Este Mes</option>
                    <option value="last_month">Mes Pasado</option>
                </select>
            </div>
        </div>
        <div id="dashboard-kpi-container" class="kpi-grid"></div>
        <div id="dashboard-charts-container" class="charts-grid"></div>
        <div id="dashboard-requerimientos-container" class="requerimientos-grid"></div>
    `;

  dateFilterSelect = viewContainer.querySelector('#dashboard-date-filter');
  kpiContainer = viewContainer.querySelector('#dashboard-kpi-container');
  chartsContainer = viewContainer.querySelector('#dashboard-charts-container');
  requerimientosContainer = viewContainer.querySelector('#dashboard-requerimientos-container');

  dateFilterSelect.addEventListener('change', renderAdminDashboard);

  // ✅ Listener para los enlaces "Ver Parte" en las listas de requerimientos
  requerimientosContainer.addEventListener('click', (event) => {
    const link = event.target.closest('.view-report-link');
    if (link && link.dataset.reportId) {
      event.preventDefault();
      // Asegúrate de que showServiceReportView en main.js puede manejar el ID directamente
      // y que la navegación entre vistas funciona correctamente.
      showServiceReportView(link.dataset.reportId);
    }
  });

  isInitialized = true;
  console.log('✅ Módulo del Dashboard de Admin inicializado.');
}

/**
 * Renderiza el contenido completo del dashboard, llamando a la Cloud Function para obtener los datos.
 */
export async function renderAdminDashboard() {
  if (!isInitialized) return;
  showLoading();

  try {
    const { startDate, endDate } = getDateRangeFromFilter(dateFilterSelect.value);

    // La Cloud Function ahora espera ISO strings
    const stats = await getAdminDashboardStats(startDate.toISOString(), endDate.toISOString());

    renderKpiCards(stats);
    renderCharts(stats);
    renderRequerimientoLists(stats); // ✅ Llamada a la nueva función de renderizado
  } catch (error) {
    displayMessage(`Error al cargar las estadísticas: ${error.message}`, 'error');
    kpiContainer.innerHTML = '<p class="error-message">No se pudieron cargar los datos.</p>';
    chartsContainer.innerHTML = '';
    requerimientosContainer.innerHTML = '';
  } finally {
    hideLoading();
  }
}

/**
 * Renderiza las tarjetas de KPIs con los datos principales.
 * @param {object} stats - El objeto de estadísticas recibido del backend.
 */
function renderKpiCards(stats) {
  const tasaResolucion =
    stats.requerimientosRecibidos > 0
      ? ((stats.requerimientosResueltos / stats.requerimientosRecibidos) * 100).toFixed(1)
      : 0;

  const totalDenuncias =
    (stats.actuaciones?.denuncias_trafico || 0) + (stats.actuaciones?.denuncias_seguridad || 0);

  kpiContainer.innerHTML = `
        <div class="kpi-card">
            <span class="kpi-value">${stats.totalReports || 0}</span>
            <span class="kpi-label">Partes Creados</span>
        </div>
        <div class="kpi-card">
            <span class="kpi-value">${stats.requerimientosRecibidos || 0}</span>
            <span class="kpi-label">Requerimientos Recibidos</span>
        </div>
        <div class="kpi-card">
            <span class="kpi-value">${stats.requerimientosResueltos || 0}</span>
            <span class="kpi-label">Requerimientos Resueltos</span>
        </div>
        <div class="kpi-card">
            <span class="kpi-value">${tasaResolucion}%</span>
            <span class="kpi-label">Tasa de Resolución</span>
        </div>
        <div class="kpi-card">
            <span class="kpi-value">${totalDenuncias}</span>
            <span class="kpi-label">Total Denuncias</span>
        </div>
    `;
}

/**
 * Renderiza los gráficos de Chart.js.
 * @param {object} stats - El objeto de estadísticas recibido del backend.
 */
function renderCharts(stats) {
  chartsContainer.innerHTML = `
        <div class="card">
            <div class="card-header"><h4>Actuaciones por Tipo</h4></div>
            <div class="card-content chart-container">
                <canvas id="actuaciones-chart"></canvas>
            </div>
        </div>
        <div class="card">
            <div class="card-header"><h4>Estado de Requerimientos</h4></div>
            <div class="card-content chart-container">
                <canvas id="requerimientos-chart"></canvas>
            </div>
        </div>
    `;

  renderActuacionesChart(stats.actuaciones || {});
  renderRequerimientosChart(stats.requerimientosRecibidos || 0, stats.requerimientosResueltos || 0);
}

function renderActuacionesChart(actuaciones) {
  const ctx = document.getElementById('actuaciones-chart')?.getContext('2d');
  if (!ctx) return;

  if (actuacionesChartInstance) {
    actuacionesChartInstance.destroy();
  }

  const labels = Object.keys(actuaciones).map((key) =>
    key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  );
  const data = Object.values(actuaciones);

  actuacionesChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Cantidad',
          data: data,
          backgroundColor: 'rgba(60, 72, 219, 0.7)',
          borderColor: 'rgba(60, 72, 219, 1)',
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y', // Muestra las barras horizontalmente para mejor legibilidad
      scales: {
        x: {
          beginAtZero: true,
        },
      },
      plugins: {
        legend: {
          display: false,
        },
      },
    },
  });
}

function renderRequerimientosChart(recibidos, resueltos) {
  const ctx = document.getElementById('requerimientos-chart')?.getContext('2d');
  if (!ctx) return;

  if (requerimientosChartInstance) {
    requerimientosChartInstance.destroy();
  }

  const pendientes = recibidos - resueltos;

  requerimientosChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Resueltos', 'Pendientes'],
      datasets: [
        {
          data: [resueltos, pendientes],
          backgroundColor: [
            'rgba(40, 167, 69, 0.7)', // Verde
            'rgba(220, 53, 69, 0.7)', // Rojo
          ],
          borderColor: ['rgba(40, 167, 69, 1)', 'rgba(220, 53, 69, 1)'],
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
        },
        title: {
          display: true,
          text: `Total: ${recibidos} requerimientos`,
        },
      },
    },
  });
}

/**
 * Renderiza las listas de requerimientos pendientes y resueltos.
 * @param {object} stats - El objeto de estadísticas que contiene `pendingRequerimientos` y `resolvedRequerimientos`.
 */
function renderRequerimientoLists(stats) {
  const pending = stats.pendingRequerimientos || [];
  const resolved = stats.resolvedRequerimientos || [];

  // Función auxiliar para generar el HTML de una lista de requerimientos
  const createListHtml = (requerimientos) => {
    if (requerimientos.length === 0)
      return '<p class="info-message">No hay requerimientos en esta categoría.</p>';
    return requerimientos
      .map(
        (req) => `
            <div class="requerimiento-item">
                <p class="req-description">${req.description}</p>
                <div class="req-meta">
                    <span>${formatDate(new Date(req.createdAt), 'dd/MM/yy HH:mm')}</span>
                    <a href="#" class="view-report-link" data-report-id="${req.reportId}">Ver Parte</a>
                </div>
            </div>
        `
      )
      .join('');
  };

  requerimientosContainer.innerHTML = `
        <div class="card">
            <div class="card-header"><h4>Requerimientos Pendientes (${pending.length})</h4></div>
            <div class="card-content requerimientos-list">
                ${createListHtml(pending)}
            </div>
        </div>
        <div class="card">
            <div class="card-header"><h4>Requerimientos Resueltos (${resolved.length})</h4></div>
            <div class="card-content requerimientos-list">
                ${createListHtml(resolved)}
            </div>
        </div>
    `;
}

/**
 * Calcula las fechas de inicio y fin basadas en el valor del filtro.
 * @param {string} filterValue - El valor seleccionado en el filtro (ej. "today", "this_month").
 * @returns {{startDate: Date, endDate: Date}}
 */
function getDateRangeFromFilter(filterValue) {
  const now = new Date();
  let startDate = new Date();
  let endDate = new Date();

  switch (filterValue) {
    case 'today':
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'last7days':
      startDate.setDate(now.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'this_month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'last_month':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    default: // Por defecto, si el valor no coincide, se puede establecer un rango predeterminado o lanzar un error
      startDate = new Date(now.getFullYear(), now.getMonth(), 1); // Este mes
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
  }
  return { startDate, endDate };
}
