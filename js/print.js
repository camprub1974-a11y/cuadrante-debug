// js/print.js

// [CORRECCIÓN APLICADA AQUÍ] Se añade 'selectedMonthId' que faltaba en la importación.
import {
  selectedAgentId,
  selectedMonthId,
  scheduleData,
  renderContext,
  availableAgents,
} from './state.js';
import { showLoading, hideLoading } from './ui/viewManager.js';
import { updateSeasonalNote } from './logic.js';
import {
  formatDate,
  getShiftDisplayText,
  getMonthNumberFromName,
  parseDateString,
} from './utils.js';
import { render as renderSchedule } from './ui/scheduleRenderer.js';

// Mapeo de colores para la impresión (sin cambios)
const PRINT_SHIFT_COLORS = {
  M: { bg: '#3b82f6', text: '#ffffff' },
  T: { bg: '#f59e0b', text: '#ffffff' },
  N: { bg: '#1f2937', text: '#ffffff' },
  L: { bg: '#10b981', text: '#ffffff' },
  V: { bg: '#8b5cf6', text: '#ffffff' },
  P: { bg: '#ec4899', text: '#ffffff' },
  B: { bg: '#ef4444', text: '#ffffff' },
  '-': { bg: '#e2e8f0', text: '#64748b' },
  PR: { bg: '#32CD32', text: '#ffffff' },
  AP: { bg: '#008080', text: '#ffffff' },
};

function generateTableHtml(daysData, agentsData, isFirstTable = true) {
  if (!daysData || daysData.length === 0 || !agentsData || agentsData.length === 0) {
    return '<p>No hay datos suficientes para generar esta tabla de impresión.</p>';
  }

  let tableHtml = '';
  const numDayColumns = daysData.length;
  const PAGE_WIDTH_MM = 210;
  const PAGE_MARGIN_MM = 5;
  const USABLE_WIDTH_MM = PAGE_WIDTH_MM - 2 * PAGE_MARGIN_MM;
  const AGENT_COL_WIDTH_MM = 16;
  const MIN_DAY_COL_WIDTH_MM = 5.0;

  let actualDayColWidthMm = (USABLE_WIDTH_MM - AGENT_COL_WIDTH_MM) / numDayColumns;
  if (actualDayColWidthMm < MIN_DAY_COL_WIDTH_MM) {
    actualDayColWidthMm = MIN_DAY_COL_WIDTH_MM;
  }
  const totalTableWidthMm = AGENT_COL_WIDTH_MM + actualDayColWidthMm * numDayColumns;

  tableHtml += `<table class="print-schedule-table" style="width: ${totalTableWidthMm}mm;">`;
  tableHtml += `<colgroup><col style="width: ${AGENT_COL_WIDTH_MM}mm;">`;
  daysData.forEach(() => (tableHtml += `<col style="width: ${actualDayColWidthMm}mm;">`));
  tableHtml += '</colgroup><thead><tr><th rowspan="2" class="agent-name-header">Agente</th>';
  daysData.forEach(
    (day) => (tableHtml += `<th class="day-number-header day-column">${day.number}</th>`)
  );
  tableHtml += '</tr><tr>';
  daysData.forEach((day) => {
    tableHtml += `<th class="day-name-header day-column">${day.name}</th>`;
  });
  tableHtml += '</tr></thead><tbody>';

  agentsData.forEach((agent) => {
    const agentId = String(agent.id);
    const agentName = agent.name || `ID ${agentId}`;
    tableHtml += `<tr><td class="agent-name-cell">${agentName}</td>`;
    const agentShiftsMap = {};
    const currentWeeksData = scheduleData.get().weeks;
    if (currentWeeksData) {
      Object.values(currentWeeksData).forEach((week) => {
        if (week && week.days) {
          Object.values(week.days).forEach((day) => {
            if (day && day.shifts) {
              const shiftEntry = Object.values(day.shifts).find(
                (s) => String(s.agentId) === agentId
              );
              if (shiftEntry) agentShiftsMap[day.date] = shiftEntry.shiftType;
            }
          });
        }
      });
    }

    daysData.forEach((day) => {
      const shiftType = agentShiftsMap[day.date] || '-';
      const displayTxt = getShiftDisplayText(shiftType);
      const colors = PRINT_SHIFT_COLORS[displayTxt] || PRINT_SHIFT_COLORS['-'];
      const isCurrentMonthDay = day.isCurrentMonth;
      const visibilityStyle = isCurrentMonthDay ? '' : 'visibility: hidden;';
      tableHtml += `<td class="day-column">
                            <span class="shift-display" style="background-color: ${colors.bg} !important; color: ${colors.text} !important; ${visibilityStyle}" title="${shiftType}">
                                ${displayTxt}
                            </span>
                          </td>`;
    });
    tableHtml += '</tr>';
  });
  tableHtml += '</tbody></table>';
  return tableHtml;
}

function displayPrintScheduleView(printPersonIdToFilter, forceAllAgentsForPrint = false) {
  const printViewContainer = document.getElementById('print-view-container');
  const currentScheduleData = scheduleData.get();
  if (!printViewContainer || !currentScheduleData?.weeks) {
    printViewContainer.innerHTML = '<p>No hay datos del cuadrante para imprimir.</p>';
    return;
  }

  const selectedMonth = selectedMonthId.get();
  const [_, monthNameFromId, yearFromId] = selectedMonth.split('_');

  const allDaysInPrintTable = [];
  const datesProcessed = new Set();
  Object.values(currentScheduleData.weeks).forEach((week) => {
    Object.values(week.days).forEach((dayData) => {
      if (dayData && dayData.date && !datesProcessed.has(dayData.date)) {
        allDaysInPrintTable.push(dayData);
        datesProcessed.add(dayData.date);
      }
    });
  });
  allDaysInPrintTable.sort(
    (a, b) => parseDateString(a.date).getTime() - parseDateString(b.date).getTime()
  );

  let agentsToRender = availableAgents.get();

  if (!forceAllAgentsForPrint && printPersonIdToFilter !== 'all') {
    agentsToRender = agentsToRender.filter(
      (agent) => String(agent.id) === String(printPersonIdToFilter)
    );
  }

  agentsToRender = agentsToRender.filter((agent) => agent.active);

  agentsToRender.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  let printHtml = `<div class="print-page-wrapper">
                     <h2 class="print-schedule-title">Cuadrante de Servicio</h2>
                     <h3 class="print-month-title">Mes de ${monthNameFromId.charAt(0).toUpperCase() + monthNameFromId.slice(1)} ${yearFromId}</h3>
                     <div class="print-tables-container">`;

  const daysPerTable = Math.ceil(allDaysInPrintTable.length / 2);

  if (allDaysInPrintTable.length > 0) {
    printHtml += generateTableHtml(
      allDaysInPrintTable.slice(0, daysPerTable),
      agentsToRender,
      true
    );
    if (allDaysInPrintTable.length > daysPerTable) {
      printHtml += `<div style="page-break-before: always;"></div>`;
      printHtml += generateTableHtml(
        allDaysInPrintTable.slice(daysPerTable),
        agentsToRender,
        false
      );
    }
  } else {
    printHtml += '<p>No hay días para mostrar en el cuadrante.</p>';
  }

  printHtml += '</div></div>';
  printViewContainer.innerHTML = printHtml;
}

export function handlePrintButtonClick() {
  const printButton = document.getElementById('printButton');
  if (!printButton) return;
  printButton.disabled = true;

  const printOptionsModal = document.createElement('div');
  printOptionsModal.className = 'modal print-options-modal';
  printOptionsModal.style.cssText =
    'display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);justify-content:center;align-items:center;z-index:2000;';
  printOptionsModal.innerHTML = `
        <div class="modal-content" style="background:white;padding:2rem;border-radius:8px;">
            <h3>Opciones de Impresión</h3>
            <p>Selecciona el contenido a imprimir:</p>
            <div style="display:flex; flex-direction:column; gap:10px; margin-bottom: 20px;">
                <label><input type="radio" name="printScope" value="current" checked> Cuadrante actual (agente/vista actual)</label>
                <label><input type="radio" name="printScope" value="all_agents"> Todos los agentes del mes</label>
            </div>
            <button id="confirmPrintOptions" class="button button-success">Imprimir</button>
            <button id="cancelPrintOptions" class="button button-secondary">Cancelar</button>
        </div>
    `;
  document.body.appendChild(printOptionsModal);

  const confirmButton = printOptionsModal.querySelector('#confirmPrintOptions');
  const cancelButton = printOptionsModal.querySelector('#cancelPrintOptions');

  confirmButton.addEventListener('click', () => {
    const selectedScope = document.querySelector('input[name="printScope"]:checked').value;
    printOptionsModal.remove();
    showLoading();

    document.body.classList.add('is-printing');
    displayPrintScheduleView(selectedAgentId.get(), selectedScope === 'all_agents');

    setTimeout(() => {
      window.print();
      document.body.classList.remove('is-printing');
      printButton.disabled = false;
      renderSchedule(renderContext.get());
      updateSeasonalNote(selectedMonthId.get(), document.getElementById('seasonal-shift-note'));
      hideLoading();
    }, 500);
  });

  cancelButton.addEventListener('click', () => {
    printOptionsModal.remove();
    printButton.disabled = false;
  });
}
