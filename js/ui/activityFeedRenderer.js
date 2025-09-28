// js/ui/activityFeedRenderer.js

import { getMarkedDates } from '../dataController.js';
import { formatDate } from '../utils.js';
import { selectedMonthId } from '../state.js';

const activityFeedContainer = document.getElementById('activity-feed-container');

// Helper para parsear fechas de forma segura y evitar problemas de zona horaria
function safeParseDate(dateInput) {
  if (!dateInput) return null;
  if (dateInput.toDate) return dateInput.toDate();
  if (typeof dateInput === 'string') {
    const parts = dateInput.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
        return date;
      }
    }
  }
  const fallbackDate = new Date(dateInput);
  return isNaN(fallbackDate.getTime()) ? null : fallbackDate;
}

// Helper para convertir el nombre del mes en español a un número
function getMonthNumberFromString(monthName) {
  const months = {
    enero: 1,
    febrero: 2,
    marzo: 3,
    abril: 4,
    mayo: 5,
    junio: 6,
    julio: 7,
    agosto: 8,
    septiembre: 9,
    octubre: 10,
    noviembre: 11,
    diciembre: 12,
  };
  return months[monthName.toLowerCase()];
}

/**
 * Renderiza el feed de novedades en la barra lateral.
 * @async
 */
export async function renderActivityFeed() {
  if (!activityFeedContainer) return;

  activityFeedContainer.innerHTML = '<p class="info-message">Cargando novedades...</p>';

  // ✅ SOLUCIÓN: Obtenemos el ID del mes PRIMERO.
  const currentMonthId = selectedMonthId.get();
  if (!currentMonthId) {
    activityFeedContainer.innerHTML = '<p class="info-message">Selecciona un mes.</p>';
    return;
  }

  // ✅ Y LUEGO lo usamos para llamar a la función.
  const allMarkedDates = await getMarkedDates(currentMonthId);

  if (!allMarkedDates || allMarkedDates.length === 0) {
    activityFeedContainer.innerHTML = '<p class="info-message">No hay novedades destacadas.</p>';
    return;
  }

  // ... (El resto de la función se mantiene exactamente igual que en la versión final anterior) ...
  const parts = currentMonthId.split('_');
  let selectedYear, selectedMonth;

  if (parts.length === 3 && parts[0] === 'cuadrante') {
    selectedYear = parseInt(parts[2], 10);
    selectedMonth = getMonthNumberFromString(parts[1]);
  }

  if (isNaN(selectedYear) || !selectedMonth) {
    activityFeedContainer.innerHTML = '<p class="info-message">Error al leer el mes.</p>';
    console.error('No se pudo parsear el ID del mes:', currentMonthId);
    return;
  }

  const markedDatesThisMonth = allMarkedDates.filter((event) => {
    const dateObj = safeParseDate(event.date);
    if (!dateObj) return false;
    return dateObj.getFullYear() === selectedYear && dateObj.getMonth() + 1 === selectedMonth;
  });

  if (markedDatesThisMonth.length === 0) {
    activityFeedContainer.innerHTML =
      '<p class="info-message">No hay novedades para el mes seleccionado.</p>';
    return;
  }

  markedDatesThisMonth.sort((a, b) => {
    const dateA = safeParseDate(a.date);
    const dateB = safeParseDate(b.date);
    return dateB - dateA;
  });

  const itemsHtml = markedDatesThisMonth
    .map((event) => {
      const dateObj = safeParseDate(event.date);
      if (!dateObj) return '';

      const formattedDate = formatDate(dateObj, 'dd MMMM');
      const eventType = event.type.replace('_', ' ');

      return `<li><strong>${formattedDate}:</strong> ${event.title}<span class="activity-type">(${eventType})</span></li>`;
    })
    .join('');

  activityFeedContainer.innerHTML = `<ul>${itemsHtml}</ul>`;
}
