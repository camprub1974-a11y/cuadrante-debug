// js/logic.js (VERSIÓN CON GRÁFICO DE BARRAS)

import { setScheduleData, setMarkedDatesForMonth, currentUser } from './state.js';
import { showLoading, hideLoading, displayMessage } from './ui/viewManager.js';
import { getScheduleForMonth, getMarkedDates } from './dataController.js';

// ✅ 1. Añadimos una variable para guardar la instancia del gráfico
let statsChart = null;

export async function loadAndDisplaySchedule(monthId, agentId) {
  if (!monthId) {
    console.warn('[DEBUG] Se llamó a loadAndDisplaySchedule sin un monthId válido.');
    hideLoading();
    return;
  }
  const user = currentUser.get();
  let effectivePersonIdToDisplay = agentId;
  if (user?.role !== 'admin' && user?.role !== 'supervisor') {
    effectivePersonIdToDisplay = user.agentId;
  }

  const scheduleContent = document.getElementById('schedule-content');
  if (!scheduleContent) return;

  showLoading();

  try {
    const [scheduleDataFromDB, markedDatesFromDB] = await Promise.all([
      getScheduleForMonth(monthId),
      getMarkedDates(monthId),
    ]);

    setScheduleData(scheduleDataFromDB);
    setMarkedDatesForMonth(markedDatesFromDB);

    if (scheduleDataFromDB) {
      renderQuadrantStats(scheduleDataFromDB, effectivePersonIdToDisplay);
    } else {
      renderQuadrantStats(null, effectivePersonIdToDisplay);
      const message =
        user?.role === 'admin' || user?.role === 'supervisor'
          ? 'Cuadrante no inicializado.'
          : 'Cuadrante para este mes no disponible.';
      // Esta línea puede que ya no sea necesaria si renderQuadrantStats maneja el mensaje
    }

    const seasonalShiftNote = document.getElementById('seasonal-shift-note');
    if (seasonalShiftNote) updateSeasonalNote(monthId, seasonalShiftNote);
  } catch (e) {
    console.error('ERROR - logic: Error al cargar el cuadrante:', e);
    setScheduleData(null);
    setMarkedDatesForMonth([]);
    displayMessage(`Error: ${e.message}`, 'error');
  } finally {
    hideLoading();
  }
}

// ✅ 2. FUNCIÓN COMPLETAMENTE MODIFICADA PARA INCLUIR EL GRÁFICO
function renderQuadrantStats(scheduleData, agentId) {
  const statsContainer = document.getElementById('stats-container');
  if (!statsContainer) return;

  // Destruimos el gráfico anterior si existe para evitar errores
  if (statsChart) {
    statsChart.destroy();
    statsChart = null;
  }

  if (!scheduleData || !scheduleData.weeks) {
    statsContainer.innerHTML =
      '<p class="info-message">No hay datos para calcular estadísticas.</p>';
    return;
  }

  const shiftCounts = { M: 0, T: 0, N: 0, Libre: 0, V: 0, P: 0, B: 0 };
  for (const weekKey in scheduleData.weeks) {
    for (const dayKey in scheduleData.weeks[weekKey].days) {
      const day = scheduleData.weeks[weekKey].days[dayKey];
      if (!day.isCurrentMonth) continue;
      for (const shiftKey in day.shifts) {
        const shift = day.shifts[shiftKey];
        if (agentId === 'all' || String(shift.agentId) === String(agentId)) {
          if (shiftCounts.hasOwnProperty(shift.shiftType)) {
            shiftCounts[shift.shiftType]++;
          }
        }
      }
    }
  }

  const totalShifts = Object.values(shiftCounts).reduce((sum, count) => sum + count, 0);

  if (totalShifts === 0) {
    statsContainer.innerHTML =
      '<p class="info-message">No hay turnos asignados en este periodo.</p>';
    return;
  }

  // Añadimos el <canvas> al HTML para el gráfico
  statsContainer.innerHTML = `
        <ul class="stats-list">
            <li><strong>Mañanas:</strong> <span>${shiftCounts.M}</span></li>
            <li><strong>Tardes:</strong> <span>${shiftCounts.T}</span></li>
            <li><strong>Noches:</strong> <span>${shiftCounts.N}</span></li>
            <li><strong>Libres:</strong> <span>${shiftCounts.Libre}</span></li>
            <li><strong>Vacaciones:</strong> <span>${shiftCounts.V}</span></li>
            <li><strong>Permisos:</strong> <span>${shiftCounts.P}</span></li>
            <li><strong>Bajas:</strong> <span>${shiftCounts.B}</span></li>
        </ul>
        <hr class="subtle-divider">
        <div class="stats-total">Total de Anotaciones: <strong>${totalShifts}</strong></div>
        <div class="chart-container" style="margin-top: 1.5rem; position: relative; height: 200px;">
            <canvas id="shift-stats-chart"></canvas>
        </div>
    `;

  // Lógica para crear el gráfico
  const ctx = document.getElementById('shift-stats-chart').getContext('2d');

  const chartData = {
    labels: ['M', 'T', 'N', 'L', 'V', 'P', 'B'],
    datasets: [
      {
        label: 'Nº de Turnos',
        data: [
          shiftCounts.M,
          shiftCounts.T,
          shiftCounts.N,
          shiftCounts.Libre,
          shiftCounts.V,
          shiftCounts.P,
          shiftCounts.B,
        ],
        backgroundColor: [
          'rgba(54, 162, 235, 0.6)', // Azul
          'rgba(255, 159, 64, 0.6)', // Naranja
          'rgba(75, 192, 192, 0.6)', // Verde azulado
          'rgba(153, 102, 255, 0.6)', // Morado
          'rgba(255, 206, 86, 0.6)', // Amarillo
          'rgba(255, 99, 132, 0.6)', // Rojo
          'rgba(201, 203, 207, 0.6)', // Gris
        ],
        borderColor: [
          'rgba(54, 162, 235, 1)',
          'rgba(255, 159, 64, 1)',
          'rgba(75, 192, 192, 1)',
          'rgba(153, 102, 255, 1)',
          'rgba(255, 206, 86, 1)',
          'rgba(255, 99, 132, 1)',
          'rgba(201, 203, 207, 1)',
        ],
        borderWidth: 1,
      },
    ],
  };

  statsChart = new Chart(ctx, {
    type: 'bar',
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false, // Ocultamos la leyenda, ya que las etiquetas son claras
        },
        title: {
          display: false,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1, // Asegura que el eje Y solo muestre números enteros
          },
        },
      },
    },
  });
}

export function updateSeasonalNote(monthId, noteElement) {
  if (!noteElement || !monthId) return;
  const summerMonths = ['junio', 'julio', 'agosto', 'septiembre'];
  const currentMonthName = monthId.split('_')[1].toLowerCase();

  if (summerMonths.includes(currentMonthName)) {
    noteElement.innerHTML =
      '<b>Nota de Temporada:</b> Turno de Mañana: 08:00 a 14:00H. Turno de Tarde: 18:00 a 23:00H.';
    noteElement.classList.remove('hidden');
  } else {
    noteElement.classList.add('hidden');
  }
}
