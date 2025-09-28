// js/ui/statsRenderer.js

import { scheduleData, selectedAgentId, selectedYear, selectedMonthId } from '../state.js';
import { getShiftFullName } from '../utils.js';
import { Chart, registerables } from 'chart.js';
import { getDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase-config.js';
import { getMonthNumberFromName, formatDate, parseDateString } from '../utils.js';

Chart.register(...registerables);

/**
 * @fileoverview Lógica para renderizar el widget de estadísticas en la barra lateral.
 * Calcula las estadísticas de turnos y renderiza un gráfico visual.
 */

const statsContainer = document.getElementById('stats-container');
let myChart = null;
let statsRangeSelector = null;
let currentStatsRange = 'current_month';

const annualScheduleCache = {};

/**
 * Define las horas asociadas a cada tipo de turno.
 * @type {Object<string, number>}
 */
const SHIFT_HOURS_MAP = {
  M: 6,
  T: 5,
  N: 0,
  L: 0,
  V: 0,
  P: 0,
  B: 0,
  '-': 0,
  PR: 0,
  AP: 0,
};

/**
 * Mapeo de turnos a colores para el gráfico.
 * @type {Object<string, string>}
 */
const CHART_COLORS = {
  Mañana: '#3b82f6',
  Tarde: '#f59e0b',
  Libre: '#10b981',
  Vacaciones: '#8b5cf6',
  Permiso: '#ec4899',
  Baja: '#ef4444',
  'Permiso Retribuido': '#32CD32',
  'Asuntos Propios': '#008080',
  'Sin Asignación': '#e2e8f0',
};

/**
 * Inicializa el renderizador de estadísticas.
 * Se suscribe a los cambios en el estado del cuadrante y del agente seleccionado.
 */
export function initializeStatsRenderer() {
  console.log('[DEBUG - StatsRenderer] Inicializando renderizador de estadísticas.');
  if (!statsContainer) {
    console.error('ERROR - StatsRenderer: Contenedor #stats-container no encontrado.');
    return;
  }

  statsRangeSelector = document.getElementById('quadrant-stats-range-select');
  if (statsRangeSelector) {
    statsRangeSelector.addEventListener('change', (event) => {
      currentStatsRange = event.target.value;
      renderStats(); // Volver a renderizar las estadísticas con el nuevo rango
    });
  }

  scheduleData.subscribe(renderStats);
  selectedAgentId.subscribe(renderStats);
  selectedYear.subscribe(renderStats);
  selectedMonthId.subscribe(renderStats);

  console.log(
    '[DEBUG - StatsRenderer] Suscrito a los átomos scheduleData, selectedAgentId, selectedYear, selectedMonthId.'
  );
}

/**
 * Función auxiliar para procesar un objeto de datos de cuadrante y convertir Timestamps/Strings a Date.
 * @param {object} rawScheduleData - Datos brutos del cuadrante desde Firestore.
 * @returns {object} Datos del cuadrante con fechas procesadas.
 */
function processScheduleDates(rawScheduleData) {
  const processedData = { ...rawScheduleData };
  if (processedData.weeks) {
    Object.keys(processedData.weeks).forEach((weekKey) => {
      const week = processedData.weeks[weekKey];
      if (week) {
        if (week.startDate instanceof Timestamp) week.startDate = week.startDate.toDate();
        if (week.endDate instanceof Timestamp) week.endDate = week.endDate.toDate();

        if (week.days) {
          Object.values(week.days).forEach((day) => {
            if (day.date) {
              if (typeof day.date === 'string') {
                day.date = parseDateString(day.date);
              } else if (day.date instanceof Timestamp) {
                day.date = day.date.toDate();
              }
            }
          });
        }
      }
    });
  }
  return processedData;
}

/**
 * Renderiza las estadísticas en la interfaz de usuario.
 */
async function renderStats() {
  console.log('[DEBUG - StatsRenderer] renderStats llamado.');
  const currentAgentId = selectedAgentId.get();
  const currentYear = selectedYear.get();
  const currentMonthId = selectedMonthId.get();

  if (currentAgentId === 'all' || !currentAgentId) {
    statsContainer.innerHTML =
      '<p class="info-message">Selecciona un agente individual para ver sus estadísticas de turnos.</p>';
    if (myChart) {
      myChart.destroy();
      myChart = null;
    }
    return;
  }

  let scheduleToAnalyzeDays = []; // [MODIFICACIÓN CLAVE] Almacenará una lista de objetos 'day'
  let peopleData = {}; // [NUEVO] Para almacenar los datos de people

  if (currentStatsRange === 'current_month') {
    const currentMonthSchedule = scheduleData.get();
    if (!currentMonthSchedule || !currentMonthSchedule.weeks) {
      statsContainer.innerHTML =
        '<p class="info-message">Cargando datos del cuadrante para el mes actual...</p>';
      if (myChart) {
        myChart.destroy();
        myChart = null;
      }
      return;
    }
    // [MODIFICACIÓN] Recolectar solo los días del mes actual (isCurrentMonth: true)
    // ya que la lógica de calculateAgentStats ahora maneja solo la bandera total_year
    for (const weekKey in currentMonthSchedule.weeks) {
      const week = currentMonthSchedule.weeks[weekKey];
      if (week && week.days) {
        for (const dayKey in week.days) {
          const day = week.days[dayKey];
          if (day.isCurrentMonth) {
            // Solo días que pertenecen al mes actual
            scheduleToAnalyzeDays.push(day);
          }
        }
      }
    }
    peopleData = currentMonthSchedule.people;
  } else if (currentStatsRange === 'total_year') {
    statsContainer.innerHTML =
      '<p class="info-message">Calculando estadísticas anuales. Esto puede tardar unos segundos...</p>';
    if (myChart) {
      myChart.destroy();
      myChart = null;
    }

    if (annualScheduleCache[currentYear]) {
      scheduleToAnalyzeDays = annualScheduleCache[currentYear].days;
      peopleData = annualScheduleCache[currentYear].people;
      console.log('[DEBUG - StatsRenderer] Usando caché para estadísticas anuales del cuadrante.');
    } else {
      const allYearDays = [];
      let hasAnyData = false; // [MODIFICACIÓN] Flag para verificar si se encontró CUALQUIER dato
      let tempPeopleData = {}; // [NUEVO] Para recolectar people data del año

      for (let i = 0; i < 12; i++) {
        const monthName = formatDate(new Date(currentYear, i, 1), 'MMMM', {
          locale: 'es',
        }).toLowerCase();
        const monthId = `cuadrante_${monthName}_${currentYear}`;

        try {
          const docRef = doc(db, 'schedules', monthId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const monthData = processScheduleDates(docSnap.data());
            if (monthData.weeks) {
              for (const weekKey in monthData.weeks) {
                const week = monthData.weeks[weekKey];
                if (week && week.days) {
                  for (const dayKey in week.days) {
                    const day = week.days[dayKey];
                    // [MODIFICACIÓN CLAVE] Solo agregar días que realmente pertenecen al año actual.
                    // Esto evita días de meses anteriores/siguientes que puedan aparecer en semanas limítrofes.
                    if (day.date && day.date.getFullYear() === currentYear) {
                      allYearDays.push(day);
                      hasAnyData = true;
                    }
                  }
                }
              }
            }
            if (monthData.people) {
              Object.assign(tempPeopleData, monthData.people); // Combinar datos de personas
            }
          }
        } catch (error) {
          console.warn(
            `[DEBUG - StatsRenderer] No se pudo cargar el cuadrante para ${monthId}:`,
            error.message
          );
        }
      }
      if (!hasAnyData) {
        // [MODIFICACIÓN] Si no se cargó NINGÚN día para el año
        statsContainer.innerHTML =
          '<p class="info-message">No hay datos de cuadrante disponibles para el año completo.</p>';
        return;
      }
      scheduleToAnalyzeDays = allYearDays;
      peopleData = tempPeopleData;
      annualScheduleCache[currentYear] = { days: allYearDays, people: tempPeopleData }; // Almacenar en caché
    }
  }

  // Si no hay días para analizar (ej. no se encontró el mes actual en scheduleData o el año completo está vacío)
  if (!scheduleToAnalyzeDays || scheduleToAnalyzeDays.length === 0) {
    statsContainer.innerHTML =
      '<p class="info-message">No hay datos suficientes para generar estadísticas con el rango seleccionado.</p>';
    return;
  }

  // [MODIFICACIÓN CLAVE] Pasar los días directamente a calculateAgentStats
  const agentStats = calculateAgentStats(scheduleToAnalyzeDays, currentAgentId, currentYear);
  renderStatsHTML(agentStats);
  renderStatsChart(agentStats);

  console.log(
    `[DEBUG - StatsRenderer] Estadísticas para agente ${currentAgentId} y rango ${currentStatsRange} renderizadas.`,
    agentStats
  );
}

/**
 * Calcula las estadísticas de turnos para un agente específico.
 * @param {Array<object>} daysToAnalyze - Una lista de objetos 'day' para analizar.
 * @param {string} agentId - El ID del agente.
 * @returns {object} Un objeto con todas las estadísticas calculadas.
 */
function calculateAgentStats(daysToAnalyze, agentId) {
  // [MODIFICACIÓN] Recibe los días directamente
  const stats = {
    totalDays: 0,
    totalHours: 0,
    shiftsCount: { M: 0, T: 0, L: 0, V: 0, PR: 0, AP: 0, '-': 0 },
    hoursByShift: { M: 0, T: 0 },
    weekdays: {
      Lun: { M: 0, T: 0 },
      Mar: { M: 0, T: 0 },
      Mié: { M: 0, T: 0 },
      Jue: { M: 0, T: 0 },
      Vie: { M: 0, T: 0 },
      Sáb: { M: 0, T: 0 },
      Dom: { M: 0, T: 0 },
    },
  };

  if (!daysToAnalyze || daysToAnalyze.length === 0) return stats;

  for (const day of daysToAnalyze) {
    // [MODIFICACIÓN] Iterar directamente sobre los días
    if (!day || !day.shifts) continue;

    const agentShift = Object.values(day.shifts).find(
      (shift) => String(shift.agentId) === String(agentId)
    );

    if (agentShift) {
      const shiftType = agentShift.shiftType;
      const shiftInitial = shiftType.charAt(0).toUpperCase();

      if (shiftInitial === 'N') continue;

      if (stats.shiftsCount[shiftInitial] !== undefined) {
        stats.shiftsCount[shiftInitial]++;
      } else {
        if (shiftType !== 'L' && shiftType !== '-') {
          stats.shiftsCount[shiftType] = (stats.shiftsCount[shiftType] || 0) + 1;
        }
      }

      const hours = SHIFT_HOURS_MAP[shiftInitial] || 0;
      stats.totalHours += hours;
      if (hours > 0) {
        stats.totalDays++;
      }

      if (stats.hoursByShift[shiftInitial] !== undefined) {
        stats.hoursByShift[shiftInitial] += hours;
      }

      if (day.name && stats.weekdays[day.name]) {
        if (shiftInitial === 'M') {
          stats.weekdays[day.name].M++;
        } else if (shiftInitial === 'T') {
          stats.weekdays[day.name].T++;
        }
      }
    }
  }

  return stats;
}

/**
 * Renderiza los datos estadísticos en formato HTML.
 * @param {object} stats - El objeto de estadísticas calculado.
 */
function renderStatsHTML(stats) {
  let html = `
        <div class="stats-info-grid">
            <div class="stat-item">
                <div class="value">${stats.totalDays}</div>
                <div class="label">Días trabajados</div>
            </div>
            <div class="stat-item">
                <div class="value">${stats.totalHours}h</div>
                <div class="label">Horas totales</div>
            </div>
            <div class="stat-item">
                <div class="value">${stats.hoursByShift.M}h</div>
                <div class="label">Horas de Mañana</div>
            </div>
            <div class="stat-item">
                <div class="value">${stats.shiftsCount.M}</div>
                <div class="label">Turnos de Mañana</div>
            </div>
            <div class="stat-item">
                <div class="value">${stats.hoursByShift.T}h</div>
                <div class="label">Horas de Tarde</div>
            </div>
            <div class="stat-item">
                <div class="value">${stats.shiftsCount.T}</div>
                <div class="label">Turnos de Tarde</div>
            </div>
            <div class="stat-item">
                <div class="value">${stats.shiftsCount.L}</div>
                <div class="label">Días libres</div>
            </div>
            <div class="stat-item">
                <div class="value">${stats.shiftsCount.V || 0}</div>
                <div class="label">Días de vacaciones</div>
            </div>
            <div class="stat-item">
                <div class="value">${stats.shiftsCount.AP || 0}</div>
                <div class="label">Asuntos Propios</div>
            </div>
            <div class="stat-item">
                <div class="value">${stats.shiftsCount.PR || 0}</div>
                <div class="label">Permisos Retribuidos</div>
            </div>
        </div>
        <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 1.5rem 0;">
        <div class="stats-chart-container" style="position: relative; height: 250px;">
            <canvas id="shifts-chart"></canvas>
        </div>
    `;
  statsContainer.innerHTML = html;
}

/**
 * Renderiza un gráfico de tipo pastel/donut con la distribución de turnos.
 * @param {object} stats - El objeto de estadísticas calculado.
 */
function renderStatsChart(stats) {
  const ctx = document.getElementById('shifts-chart');
  if (!ctx) return;

  if (myChart) {
    myChart.destroy();
  }

  const labels = [
    'Turno Mañana',
    'Turno Tarde',
    'Días Libres',
    'Vacaciones',
    'Asuntos Propios',
    'Permisos Retribuidos',
  ];
  const data = [
    stats.shiftsCount.M,
    stats.shiftsCount.T,
    stats.shiftsCount.L,
    stats.shiftsCount.V,
    stats.shiftsCount.AP,
    stats.shiftsCount.PR,
  ];

  const backgroundColors = [
    CHART_COLORS['Mañana'],
    CHART_COLORS['Tarde'],
    CHART_COLORS['Libre'],
    CHART_COLORS['Vacaciones'],
    CHART_COLORS['Asuntos Propios'],
    CHART_COLORS['Permiso Retribuido'],
  ];

  myChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Días por Tipo de Turno',
          data: data,
          backgroundColor: backgroundColors,
          borderColor: '#ffffff',
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { boxWidth: 12 },
        },
        title: {
          display: true,
          text: `Distribución de Días (${currentStatsRange === 'total_year' ? 'Año Completo' : 'Mes Actual'})`,
          font: {
            size: 14,
            weight: 'bold',
          },
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const label = context.label || '';
              const value = context.raw;
              const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
              const initialMap = {
                'Turno Mañana': 'M',
                'Turno Tarde': 'T',
                'Días Libres': 'L',
                Vacaciones: 'V',
                'Asuntos Propios': 'AP',
                'Permisos Retribuidos': 'PR',
              };
              const shiftInitial = initialMap[label];
              const hours = SHIFT_HOURS_MAP[shiftInitial] || 0;
              return `${label}: ${value} días (${percentage}%)`;
            },
          },
        },
      },
      animation: {
        animateScale: true,
        animateRotate: true,
      },
    },
  });
}
