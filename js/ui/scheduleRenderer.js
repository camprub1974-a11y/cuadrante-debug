// js/ui/scheduleRenderer.js

// === CAMBIO 1: Se añaden 'availableAgents' y 'selectedMonthId' a la importación ===
import { renderContext, currentUser, availableAgents, selectedMonthId } from '../state.js';
import { openShiftModal } from './shiftModal.js';
import { formatDate, parseISO } from '../utils.js';
import { openProposeChangeModal } from './proposeChangeModal.js';
import { getAllShiftTypes } from '../dataController.js';
import { Calendar } from 'fullcalendar';
import 'fullcalendar'; // Importa los estilos necesarios

let allShiftTypesCache = null;

// Esta función ahora funcionará correctamente porque 'availableAgents' está importado.
export function getAgentName(agentId) {
  const agent = availableAgents.get().find((a) => String(a.id) === String(agentId));
  return agent ? agent.name : `ID ${agentId}`;
}

async function renderGraphicalScheduleView({
  scheduleData: data,
  selectedAgentId: selectedAgent,
  userProfile,
  markedDates,
}) {
  console.log('2. Entrando a renderGraphicalScheduleView con datos:', data); // <-- CHIVATO 2

  const desktopViewContainer = document.querySelector('.schedule-desktop-view');
  if (!desktopViewContainer) return;
  desktopViewContainer.innerHTML = '';

  if (!data || !data.weeks || Object.keys(data.weeks).length === 0) {
    desktopViewContainer.innerHTML =
      '<p class="info-message">No hay datos de cuadrante disponibles.</p>';
    console.warn('RENDERIZADO DETENIDO: No hay objeto "data.weeks" o está vacío.');
    return;
  }

  if (!allShiftTypesCache) {
    allShiftTypesCache = await getAllShiftTypes();
  }
  const shiftTypeMap = new Map(allShiftTypesCache.map((type) => [type.quadrant_symbol, type.name]));

  const markedDatesSet = new Set();
  if (markedDates) {
    markedDates.forEach((event) => {
      if (event.date && !isNaN(event.date)) {
        markedDatesSet.add(event.date.toISOString().split('T')[0]);
      }
    });
  }

  let agentsToDisplay = availableAgents.get();
  if (selectedAgent && selectedAgent !== 'all') {
    agentsToDisplay = agentsToDisplay.filter((agent) => String(agent.id) === String(selectedAgent));
  }

  if (agentsToDisplay.length === 0) {
    desktopViewContainer.innerHTML = '<p class="info-message">No hay agentes para mostrar.</p>';
    return;
  }

  agentsToDisplay.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  const sortedWeeks = Object.entries(data.weeks).sort(
    ([weekKeyA], [weekKeyB]) =>
      parseInt(weekKeyA.replace('week', '')) - parseInt(weekKeyB.replace('week', ''))
  );

  let renderedSomething = false; // Variable para saber si se renderizó al menos una semana
  sortedWeeks.forEach(([weekKey, week]) => {
    console.log(`3. Procesando semana: ${weekKey}`, week); // <-- CHIVATO 3

    const hasDaysInCurrentMonth = Object.values(week.days).some((day) => day.isCurrentMonth);
    console.log(`4. La semana ${weekKey} tiene días en el mes actual:`, hasDaysInCurrentMonth); // <-- CHIVATO 4

    if (!hasDaysInCurrentMonth) return;

    renderedSomething = true;
    const weekCard = document.createElement('div');
    weekCard.className = 'card week-card';

    const sortedDayKeys = Object.keys(week.days).sort((a, b) => parseInt(a) - parseInt(b));
    const firstDayOfWeek = week.days[sortedDayKeys[0]];
    const lastDayOfWeek = week.days[sortedDayKeys[sortedDayKeys.length - 1]];
    const formattedStartDate = firstDayOfWeek
      ? formatDate(parseISO(firstDayOfWeek.date), 'dd/MM')
      : 'Fecha Inválida';
    const formattedEndDate = lastDayOfWeek
      ? formatDate(parseISO(lastDayOfWeek.date), 'dd/MM/yyyy')
      : 'Fecha Inválida';
    weekCard.innerHTML = `<h3>Semana del ${formattedStartDate} al ${formattedEndDate}</h3>`;

    const scheduleTable = document.createElement('table');
    scheduleTable.className = 'schedule-table';
    const thead = document.createElement('thead');
    let headerRowHtml = '<tr><th class="agent-name-header">Agente</th>';
    sortedDayKeys.forEach((dayKey) => {
      const day = week.days[dayKey];
      headerRowHtml += `<th class="day-header">${day.name} ${day.number}</th>`;
    });
    headerRowHtml += '</tr>';
    thead.innerHTML = headerRowHtml;
    scheduleTable.appendChild(thead);

    const tbody = document.createElement('tbody');
    agentsToDisplay.forEach((agent) => {
      console.log(`5. Creando fila para agente: ${agent.name}`); // <-- CHIVATO 5
      const row = document.createElement('tr');
      row.innerHTML = `<td class="agent-cell" data-agent-name="${agent.name}">${agent.name}</td>`;
      sortedDayKeys.forEach((dayKey) => {
        const day = week.days[dayKey];
        let currentShiftType = '-';
        if (day?.shifts) {
          const shiftEntry = Object.values(day.shifts).find(
            (s) => String(s.agentId) === String(agent.id)
          );
          if (shiftEntry) currentShiftType = shiftEntry.shiftType;
        }
        const cell = document.createElement('td');
        cell.className = 'shift-cell';
        if (day?.date) {
          const dateString = day.date.split('T')[0];
          if (markedDatesSet.has(dateString)) cell.classList.add('has-novedad');
        }
        if (day && !day.isCurrentMonth) cell.classList.add('day-off-month');

        cell.dataset.monthId = selectedMonthId.get();
        cell.dataset.weekKey = weekKey;
        cell.dataset.dayKey = dayKey;
        cell.dataset.agentId = agent.id;
        cell.dataset.agentName = agent.name;
        cell.dataset.dayDate = day?.date || '';
        cell.dataset.currentShiftType = currentShiftType;

        const displayTxt = currentShiftType;
        const fullName = shiftTypeMap.get(currentShiftType) || currentShiftType;

        const shiftBadge = document.createElement('span');
        const badgeClass = ['M', 'T', 'N', 'L', '-'].includes(displayTxt)
          ? `shift-${displayTxt}`
          : 'shift-permiso';
        shiftBadge.className = `turno-icon ${badgeClass}`;
        shiftBadge.textContent = displayTxt;
        shiftBadge.title = fullName;
        cell.appendChild(shiftBadge);

        row.appendChild(cell);
      });
      tbody.appendChild(row);
    });
    scheduleTable.appendChild(tbody);
    weekCard.appendChild(scheduleTable);
    desktopViewContainer.appendChild(weekCard);
  });

  if (!renderedSomething) {
    desktopViewContainer.innerHTML =
      '<p class="info-message">Los datos del cuadrante se cargaron, pero no contienen días para el mes actual.</p>';
  }
}

function renderMobileScheduleView({
  scheduleData: data,
  selectedAgentId: selectedAgent,
  userProfile,
}) {
  const mobileViewContainer = document.querySelector('.schedule-mobile-view');
  if (!mobileViewContainer) return;

  mobileViewContainer.innerHTML = '';
  if (!data || !data.weeks || Object.keys(data.weeks).length === 0) {
    mobileViewContainer.innerHTML =
      '<p class="info-message">No hay datos de cuadrante disponibles.</p>';
    return;
  }

  let agentsToDisplay = availableAgents.get();
  if (selectedAgent && selectedAgent !== 'all') {
    agentsToDisplay = agentsToDisplay.filter((agent) => String(agent.id) === String(selectedAgent));
  }

  if (agentsToDisplay.length === 0) {
    mobileViewContainer.innerHTML = '<p class="info-message">No hay agentes para mostrar.</p>';
    return;
  }

  const allDays = Object.values(data.weeks)
    .flatMap((week) => Object.values(week.days))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  allDays.forEach((day) => {
    if (!day.isCurrentMonth) return;

    const dayCard = document.createElement('div');
    dayCard.className = 'mobile-day-card';

    const dayHeader = document.createElement('div');
    dayHeader.className = 'mobile-day-header';
    dayHeader.innerHTML = `<span class="day-name">${day.name}</span><span class="day-number">${day.number}</span><i data-feather="chevron-down" class="expand-icon"></i>`;

    const dayContent = document.createElement('div');
    dayContent.className = 'mobile-day-content hidden';

    agentsToDisplay.forEach((agent) => {
      let shiftType = '-';
      if (day.shifts) {
        const shiftEntry = Object.values(day.shifts).find(
          (s) => String(s.agentId) === String(agent.id)
        );
        if (shiftEntry) shiftType = shiftEntry.shiftType;
      }
      const displayTxt = getShiftDisplayText(shiftType);
      const shiftItem = document.createElement('div');
      shiftItem.className = 'mobile-shift-item';
      shiftItem.innerHTML = `<span class="agent-name">${agent.name}</span><span class="turno-icon shift-${displayTxt}">${displayTxt}</span>`;
      dayContent.appendChild(shiftItem);
    });

    dayCard.appendChild(dayHeader);
    dayCard.appendChild(dayContent);
    mobileViewContainer.appendChild(dayCard);

    dayHeader.addEventListener('click', () => {
      dayCard.classList.toggle('is-open');
      dayContent.classList.toggle('hidden');
      if (window.feather) feather.replace();
    });
  });
  if (window.feather) feather.replace();
}

function handleShiftClick(event) {
  const shiftElement = event.target.closest('.shift-cell[data-agent-id]');
  if (!shiftElement) return;

  const shiftData = {
    monthId: shiftElement.dataset.monthId,
    weekKey: shiftElement.dataset.weekKey,
    dayKey: shiftElement.dataset.dayKey,
    agentId: shiftElement.dataset.agentId,
    agentName: shiftElement.dataset.agentName,
    dateString: shiftElement.dataset.dayDate,
    currentShiftType: shiftElement.dataset.currentShiftType,
  };

  const user = currentUser.get();
  if (!user) return;

  if (user.role === 'admin') {
    openShiftModal(shiftData);
  } else if (String(user.agentId) === String(shiftData.agentId)) {
    const nonChangeableShifts = ['L', 'Libre', 'AP', 'LP', 'VAC', 'F', 'IT'];
    if (!nonChangeableShifts.includes(shiftData.currentShiftType)) {
      openProposeChangeModal({
        requesterAgentId: shiftData.agentId,
        requesterShiftDate: shiftData.dateString,
        requesterShiftType: shiftData.currentShiftType,
      });
    }
  }
}

// REEMPLAZA TU FUNCIÓN 'render' CON ESTA
export async function render(context) {
  console.log('1. Renderer llamado con contexto:', context);
  const scheduleContent = document.getElementById('schedule-content');
  if (!scheduleContent) return;

  const { userProfile, scheduleData, currentView: viewType } = context;

  if (!userProfile || !scheduleData) {
    scheduleContent.innerHTML = '<p class="info-message">Cargando contexto...</p>';
    return;
  }

  // Limpiamos el contenido anterior
  scheduleContent.innerHTML = '';

  // Lógica para decidir qué vista renderizar
  if (viewType === 'calendario') {
    // Si la vista es 'calendario', creamos un contenedor y llamamos al renderizador del calendario
    const calendarContainer = document.createElement('div');
    calendarContainer.id = 'full-calendar-view';
    scheduleContent.appendChild(calendarContainer);
    await renderAvailabilityView(context);
  } else {
    // Para cualquier otra vista (por defecto 'tarjetas'), mostramos la vista gráfica
    const desktopViewContainer = document.createElement('div');
    desktopViewContainer.className = 'schedule-desktop-view';
    scheduleContent.appendChild(desktopViewContainer);

    desktopViewContainer.removeEventListener('click', handleShiftClick);
    desktopViewContainer.addEventListener('click', handleShiftClick);

    await renderGraphicalScheduleView(context);
  }
}

// AÑADE ESTA FUNCIÓN COMPLETA AL FINAL DE TU ARCHIVO
async function renderAvailabilityView({
  scheduleData: data,
  selectedAgentId: selectedAgent,
  userProfile,
  markedDates,
}) {
  const calendarContainer = document.getElementById('full-calendar-view');
  if (!calendarContainer) {
    console.error('Contenedor del calendario no encontrado.');
    return;
  }

  if (!data || !data.weeks) {
    calendarContainer.innerHTML =
      '<p class="info-message">No hay datos de cuadrante disponibles.</p>';
    return;
  }

  if (!allShiftTypesCache) {
    allShiftTypesCache = await getAllShiftTypes();
  }
  const shiftTypeMap = new Map(allShiftTypesCache.map((type) => [type.quadrant_symbol, type.name]));

  const calendarEvents = [];
  let agentsToDisplay = availableAgents.get();
  if (selectedAgent && selectedAgent !== 'all') {
    agentsToDisplay = agentsToDisplay.filter((agent) => String(agent.id) === String(selectedAgent));
  }

  agentsToDisplay.forEach((agent) => {
    Object.values(data.weeks).forEach((week) => {
      Object.values(week.days).forEach((day) => {
        if (!day.isCurrentMonth) return;

        let shift = null;
        if (day.shifts) {
          const shiftEntry = Object.values(day.shifts).find(
            (s) => String(s.agentId) === String(agent.id)
          );
          if (shiftEntry) shift = shiftEntry;
        }

        if (shift) {
          const displayTxt = shift.shiftType;
          const eventClass = ['M', 'T', 'N', 'L', '-'].includes(displayTxt)
            ? `shift-${displayTxt}`
            : 'shift-permiso';

          calendarEvents.push({
            title: `${displayTxt} - ${agent.name}`,
            start: day.date,
            className: `fc-event-custom ${eventClass}`,
            description: shiftTypeMap.get(displayTxt) || displayTxt,
          });
        }
      });
    });
  });

  const calendar = new FullCalendar.Calendar(calendarContainer, {
    initialView: 'dayGridMonth',
    locale: 'es',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,listWeek',
    },
    events: calendarEvents,
    eventDidMount: function (info) {
      // Añade un tooltip con el nombre completo del turno
      if (info.event.extendedProps.description) {
        info.el.setAttribute('title', info.event.extendedProps.description);
      }
    },
  });

  calendar.render();
}
