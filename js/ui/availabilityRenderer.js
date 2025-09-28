// cuadrante-vite/js/ui/availabilityRenderer.js

import {
  renderContext,
  availableAgents,
  currentUser,
  selectedAgentId,
  setAgent,
} from '../state.js';
import { openShiftModal } from './shiftModal.js';
import { displayMessage } from './viewManager.js';
import { weekDays, getTurnoInitial, formatDate, getShiftFullName } from '../utils.js';
import { openProposeChangeModal } from './proposeChangeModal.js';
import { EXTRA_SERVICE_TYPES } from '../constants.js';

function addAvailabilityListeners() {
  document.querySelectorAll('.calendar-day').forEach((dayElement) => {
    const isCurrentMonthDay = dayElement.dataset.isCurrentMonth === 'true';
    const userProfile = currentUser.get();

    if (userProfile && userProfile.role === 'admin') {
      dayElement.addEventListener('click', (event) => {
        const { weekKey, dayKey, actualDayDate } = dayElement.dataset;
        let agentIdToEdit = selectedAgentId.get();

        if (String(agentIdToEdit) === 'all' || !agentIdToEdit) {
          displayMessage(
            'Por favor, selecciona un agente individual para editar su turno.',
            'info'
          );
          return;
        }

        const currentScheduleData = renderContext.get().scheduleData;
        const dayData = currentScheduleData?.weeks?.[weekKey]?.days?.[dayKey];
        let currentShiftType = '-';
        let existingShiftKey = '';

        if (dayData?.shifts) {
          const shiftEntry = Object.entries(dayData.shifts).find(
            ([, s]) => String(s.agentId) === String(agentIdToEdit)
          );
          if (shiftEntry) {
            existingShiftKey = shiftEntry[0];
            currentShiftType = shiftEntry[1].shiftType;
          }
        }

        openEditShiftModal(
          weekKey,
          dayKey,
          agentIdToEdit,
          currentShiftType,
          actualDayDate,
          dayElement,
          existingShiftKey
        );
      });
    } else if (userProfile && userProfile.role === 'guard' && isCurrentMonthDay) {
      dayElement.addEventListener('click', (event) => {
        const { weekKey, dayKey, actualDayDate } = dayElement.dataset;
        const agentIdFromCell = selectedAgentId.get();

        const currentScheduleData = renderContext.get().scheduleData;
        const dayData = currentScheduleData?.weeks?.[weekKey]?.days?.[dayKey];
        let currentShiftType = '-';

        if (dayData?.shifts) {
          const shiftEntry = Object.entries(dayData.shifts).find(
            ([, s]) => String(s.agentId) === String(agentIdFromCell)
          );
          if (shiftEntry) currentShiftType = shiftEntry[1].shiftType;
        }

        if (String(userProfile.agentId) === String(agentIdFromCell) && isCurrentMonthDay) {
          openProposeChangeModal(agentIdFromCell, actualDayDate, currentShiftType);
        } else {
          displayMessage('Solo puedes proponer cambios para tus propios turnos.', 'info');
        }
      });
    }
  });
}

export function renderAvailabilityView(context) {
  console.log('[DEBUG availabilityRenderer] renderAvailabilityView llamado.');
  const {
    userProfile,
    scheduleData: currentScheduleData,
    selectedAgentId: currentSelectedAgentId,
  } = context;

  const isMobile = window.innerWidth <= 768;
  const viewContainerSelector = isMobile ? '.schedule-mobile-view' : '.schedule-desktop-view';
  const viewContainer = document.querySelector(viewContainerSelector);

  if (!viewContainer) {
    console.error(
      'No se encontró el contenedor para la vista de calendario:',
      viewContainerSelector
    );
    return;
  }

  if (!userProfile) {
    viewContainer.innerHTML = '';
    return;
  }

  if (
    userProfile.role === 'guard' &&
    String(currentSelectedAgentId) !== String(userProfile.agentId)
  ) {
    setAgent(String(userProfile.agentId));
    return;
  }

  if (!currentScheduleData) {
    viewContainer.innerHTML = '<p class="info-message">Cargando datos del calendario...</p>';
    return;
  }

  let html = '<div class="availability-calendar">';
  html += '<div class="calendar-week-header">';
  weekDays.forEach((dayName) => {
    html += `<div class="day-name">${dayName}</div>`;
  });
  html += '</div>';

  Object.keys(currentScheduleData.weeks)
    .sort((a, b) => parseInt(a.replace('week', '')) - parseInt(b.replace('week', '')))
    .forEach((weekKey) => {
      const week = currentScheduleData.weeks[weekKey];
      html += '<div class="calendar-week">';
      for (let i = 0; i <= 6; i++) {
        const day = week.days[i.toString()] || { isCurrentMonth: false, shifts: {} };
        const isCurrentMonthDay = day.isCurrentMonth;
        const dateId = day.date || '';
        const actualDayDate = dateId;

        let dayContent = `<div class="day-header ${!isCurrentMonthDay ? 'day-header-inactive' : ''}">${day.number || ''}</div><div class="day-shifts-container">`;

        let agentShifts = [];
        if (currentSelectedAgentId !== 'all') {
          agentShifts = Object.values(day.shifts || {}).filter(
            (shift) => String(shift.agentId) === String(currentSelectedAgentId)
          );
        } else {
          // Si es 'all', potencialmente mostrar algo diferente o nada. Por ahora, como en la tabla.
          agentShifts = []; // Opcional: manejar qué mostrar para "Todos" en esta vista.
        }

        if (agentShifts.length > 0) {
          agentShifts.forEach((shift) => {
            const initial = getTurnoInitial(shift.shiftType);
            const fullName = getShiftFullName(shift.shiftType);
            dayContent += `<span class="turno-icon shift-${initial}" title="${fullName}">${initial}</span>`;
          });
        } else if (currentSelectedAgentId !== 'all') {
          dayContent += '<span class="no-shifts-placeholder">-</span>';
        }

        const extraServicesForDay =
          currentScheduleData.extraServices && currentScheduleData.extraServices[day.date]
            ? currentScheduleData.extraServices[day.date]
            : [];
        const agentExtraServices = extraServicesForDay.filter(
          (service) => String(service.agentId) === String(currentSelectedAgentId)
        );

        let extraServiceTitles = [];
        if (agentExtraServices.length > 0) {
          agentExtraServices.forEach((service) => {
            extraServiceTitles.push(
              `${EXTRA_SERVICE_TYPES[service.type].name} (${service.hours}h)`
            );
            const extraServiceBadge = document.createElement('span');
            extraServiceBadge.className = `extra-service-badge extra-service-${service.type}`;
            extraServiceBadge.textContent = EXTRA_SERVICE_TYPES[service.type].name
              .charAt(0)
              .toUpperCase();
            extraServiceBadge.title = `${EXTRA_SERVICE_TYPES[service.type].name}: ${service.hours}h`;
            dayContent += extraServiceBadge.outerHTML;
          });
        }

        dayContent += `</div>`;

        const markedDatesForMonth = currentScheduleData.markedDates || [];
        const isMarkedDate = markedDatesForMonth.some(
          (markedDate) => day.date === formatDate(markedDate.date, 'yyyy-MM-dd')
        );
        const dayTitle =
          extraServiceTitles.length > 0 ? `title="${extraServiceTitles.join(', ')}"` : '';

        html += `<div class="calendar-day ${!isCurrentMonthDay ? 'day-off-month' : ''} ${isMarkedDate ? 'day-marked-calendar' : ''}"
                                ${dayTitle}
                                data-date-id="${dateId}"
                                data-week-key="${weekKey}" data-day-key="${i}"
                                data-actual-day-date="${actualDayDate}" 
                                data-is-current-month="${isCurrentMonthDay}">
                                ${dayContent}
                         </div>`;
      }
      html += '</div>';
    });
  html += '</div>';

  viewContainer.innerHTML = html;
  addAvailabilityListeners();
}
