// RUTA: js/ui/adminDashboardView.js (VERSIÓN FINAL Y ROBUSTA)

import { getDashboardStats } from '../dataController.js';
import { displayMessage, showLoading, hideLoading } from './viewManager.js';
import Chart from 'chart.js/auto';
import { startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay, subDays, format } from 'date-fns';

let isInitialized = false;
let chartInstances = {}; // Un objeto para almacenar y destruir los gráficos

// --- FUNCIÓN PRINCIPAL DE RENDERIZADO ---
export function renderAdminDashboard() {
  if (!isInitialized) {
    setupEventListeners();
    isInitialized = true;
  }
  // Al cargar la vista, generamos el informe del mes actual por defecto.
  fetchAndRenderStats('current_month');
}

// --- GESTIÓN DE EVENTOS ---
function setupEventListeners() {
  const filtersContainer = document.querySelector('.stats-filters');
  if (!filtersContainer) return;

  filtersContainer.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;

    if (button.dataset.range) {
      const rangeKey = button.dataset.range;
      document.querySelectorAll('.stats-filters .button-group button').forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      fetchAndRenderStats(rangeKey);
    }

    if (button.id === 'generate-stats-btn') {
      document.querySelectorAll('.stats-filters .button-group button').forEach(btn => btn.classList.remove('active'));
      fetchAndRenderStats();
    }
  });
}

// --- LÓGICA DE DATOS Y RENDERIZADO ---

async function fetchAndRenderStats(rangeKey = null) {
  showLoading('Calculando estadísticas...');
  try {
    let startDate, endDate;
    const startDateInput = document.getElementById('stats-start-date');
    const endDateInput = document.getElementById('stats-end-date');

    if (rangeKey) {
      const range = getDateRange(rangeKey);
      startDate = format(range.startDate, 'yyyy-MM-dd');
      endDate = format(range.endDate, 'yyyy-MM-dd');
      if(startDateInput) startDateInput.value = startDate;
      if(endDateInput) endDateInput.value = endDate;
    } else {
      startDate = startDateInput?.value;
      endDate = endDateInput?.value;
    }

    if (!startDate || !endDate) {
      displayMessage('Por favor, selecciona un rango de fechas válido.', 'info');
      hideLoading();
      return;
    }

    const stats = await getDashboardStats(startDate, endDate);

    renderKpiCards(stats.resumenGeneral);
    renderAllCharts(stats.graficos);
    renderDetailsTable(stats.tablaDesgloseCompleto);

  } catch (error) {
    displayMessage(`Error al generar el informe: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

/**
 * Rellena las tarjetas de KPIs.
 * ✅ VERSIÓN REFORZADA: Comprueba si cada elemento existe antes de modificarlo.
 */
function renderKpiCards(resumen) {
    const kpiMapping = {
        'kpi-total-actuaciones': resumen?.totalActuaciones || 0,
        'kpi-partes-creados': resumen?.partesDeServicioCreados || 0,
        'kpi-req-recibidos': resumen?.requerimientos?.recibidos || 0,
        'kpi-tasa-resolucion': resumen?.requerimientos?.tasaResolucion || '0%',
        'kpi-doc-entradas': resumen?.documentos?.entradasRegistradas || 0,
        'kpi-doc-salidas': resumen?.documentos?.salidasGeneradas || 0,
    };

    for (const id in kpiMapping) {
        const element = document.getElementById(id);
        if (element) { // Solo modifica el elemento si se encuentra en la página
            element.textContent = kpiMapping[id];
        }
    }
}


function renderAllCharts(graficos) {
  Object.values(chartInstances).forEach(chart => {
      if (chart) chart.destroy();
  });

  if (!graficos) return;

  chartInstances.categorias = createBarChart('categoriasChart', graficos.actuacionesPorCategoria);
  chartInstances.requerimientos = createDoughnutChart('requerimientosChart', graficos.requerimientos);
  chartInstances.docSalida = createBarChart('docSalidaChart', graficos.documentosSalida);
  chartInstances.docEntrada = createBarChart('docEntradaChart', graficos.documentosEntrada);
  chartInstances.tendencia = createLineChart('tendenciaChart', graficos.tendenciaDiaria);
}

function renderDetailsTable(tablaData) {
    const container = document.getElementById('stats-table-container');
    if (!container) return;
    if (!tablaData || tablaData.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>No hay datos detallados para mostrar en este periodo.</p></div>`;
        return;
    }
    const tableHtml = `
        <table class="data-table">
            <thead><tr><th>Categoría</th><th>Tipo de Actuación</th><th>Total</th></tr></thead>
            <tbody>
                ${tablaData.map(row => `<tr><td>${row.categoria}</td><td>${row.actuacion}</td><td>${row.total}</td></tr>`).join('')}
            </tbody>
        </table>`;
    container.innerHTML = tableHtml;
}

// --- FUNCIONES DE AYUDA PARA GRÁFICOS Y FECHAS ---

function createBarChart(canvasId, chartData) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || !chartData || !chartData.labels || !chartData.data) return null;
  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: chartData.labels,
      datasets: [{ label: 'Total', data: chartData.data, backgroundColor: 'rgba(27, 156, 252, 0.7)' }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });
}

function createDoughnutChart(canvasId, chartData) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || !chartData || !chartData.labels || !chartData.data) return null;
  return new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: chartData.labels,
      datasets: [{ data: chartData.data, backgroundColor: ['rgba(40, 167, 69, 0.7)', 'rgba(220, 53, 69, 0.7)'] }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function createLineChart(canvasId, chartData) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || !chartData || !chartData.labels || !chartData.data) return null;
    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: 'Actuaciones por Día',
                data: chartData.data,
                fill: true,
                borderColor: 'rgb(27, 156, 252)',
                backgroundColor: 'rgba(27, 156, 252, 0.1)',
                tension: 0.1
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

function getDateRange(rangeKey) {
    const now = new Date();
    let startDate, endDate;
    switch (rangeKey) {
        case 'last30days':
            endDate = endOfDay(now);
            startDate = startOfDay(subDays(now, 29));
            break;
        case 'last_month':
            const lastMonth = subMonths(now, 1);
            startDate = startOfMonth(lastMonth);
            endDate = endOfMonth(lastMonth);
            break;
        case 'current_month':
        default:
            startDate = startOfMonth(now);
            endDate = endOfMonth(now);
            break;
    }
    return { startDate, endDate };
}