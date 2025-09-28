// js/ui/selectorManager.js

import {
  selectedYear,
  selectedMonthId,
  selectedAgentId,
  setDate,
  setAgent,
  agentSelectorContext,
  currentMonthTitle,
  currentView,
  currentUser,
  availableAgents,
  setView,
} from '../state.js';
import { generateMonthsForYear, formatDate, getMonthNumberFromName } from '../utils.js';
import { loadAndDisplaySchedule } from '../logic.js';

export async function initSelectors() {
  // --- OBTENCIÓN DE ELEMENTOS DEL DOM ---
  const yearSelect = document.getElementById('year-select');
  const monthSelect = document.getElementById('month-select');
  const agentSelect = document.getElementById('agent-select');
  const prevMonthButton = document.getElementById('prevMonthButton');
  const nextMonthButton = document.getElementById('nextMonthButton');
  const monthTitleElement = document.getElementById('currentMonthTitle');

  const managementSelectorBtn = document.getElementById('management-selector-btn');
  const userRequestsBtn = document.getElementById('user-requests-btn');
  const viewSelectorBtn = document.getElementById('view-selector-btn');
  const extraServiceBtn = document.getElementById('extra-service-btn');
  const extraServicesContainer = document.getElementById('extra-services-stats-container');
  const sidebarColumn = document.querySelector('.sidebar-column');

  // ✅ MEJORA DE ROBUSTEZ APLICADA
  // Se comprueba si los elementos esenciales existen ANTES de continuar.
  // Si falta alguno, se muestra un error en la consola y la función se detiene para evitar un 'crash'.
  if (!yearSelect || !monthSelect || !agentSelect || !prevMonthButton || !nextMonthButton) {
    console.error(
      '[ERROR SelectorManager] Faltan elementos DOM esenciales para los selectores (año, mes, agente o botones de navegación).'
    );
    return; // Detiene la ejecución de la función.
  }

  // --- EVENT LISTENERS ---
  const triggerLoad = () => {
    loadAndDisplaySchedule(selectedMonthId.get(), selectedAgentId.get());
  };

  yearSelect.addEventListener('change', (e) => {
    const newYear = parseInt(e.target.value);
    const months = generateMonthsForYear(newYear);
    setDate(newYear, months[0].id);
    triggerLoad();
  });

  monthSelect.addEventListener('change', (e) => {
    setDate(selectedYear.get(), e.target.value);
    triggerLoad();
  });

  agentSelect.addEventListener('change', (e) => {
    setAgent(String(e.target.value));
    triggerLoad();
  });

  const handlePrevMonth = () => {
    const currentMonthId = selectedMonthId.get();
    const currentYear = selectedYear.get();
    const monthIndex = getMonthNumberFromName(currentMonthId.split('_')[1]);
    let newMonth = monthIndex - 1;
    let newYear = currentYear;
    if (newMonth < 0) {
      newMonth = 11;
      newYear--;
    }
    const newMonthId = `cuadrante_${formatDate(new Date(newYear, newMonth, 1), 'MMMM', { locale: 'es' }).toLowerCase()}_${newYear}`;
    setDate(newYear, newMonthId);
    triggerLoad();
  };

  const handleNextMonth = () => {
    const currentMonthId = selectedMonthId.get();
    const currentYear = selectedYear.get();
    const monthIndex = getMonthNumberFromName(currentMonthId.split('_')[1]);
    let newMonth = monthIndex + 1;
    let newYear = currentYear;
    if (newMonth > 11) {
      newMonth = 0;
      newYear++;
    }
    const newMonthId = `cuadrante_${formatDate(new Date(newYear, newMonth, 1), 'MMMM', { locale: 'es' }).toLowerCase()}_${newYear}`;
    setDate(newYear, newMonthId);
    triggerLoad();
  };

  // Limpiamos listeners antiguos antes de añadir los nuevos para evitar duplicados
  let newPrevButton = prevMonthButton.cloneNode(true);
  prevMonthButton.parentNode.replaceChild(newPrevButton, prevMonthButton);
  newPrevButton.addEventListener('click', handlePrevMonth);

  let newNextButton = nextMonthButton.cloneNode(true);
  nextMonthButton.parentNode.replaceChild(newNextButton, nextMonthButton);
  newNextButton.addEventListener('click', handleNextMonth);

  // --- SUSCRIPCIONES A ESTADOS ---
  selectedYear.subscribe((newYear) => {
    const currentSystemYear = new Date().getFullYear();
    yearSelect.innerHTML = '';
    for (let i = currentSystemYear - 5; i <= currentSystemYear + 5; i++) {
      yearSelect.innerHTML += `<option value="${i}">${i}</option>`;
    }
    yearSelect.value = newYear;
  });

  selectedMonthId.subscribe((newMonthId) => {
    if (!newMonthId) return;
    const currentYear = selectedYear.get();
    const months = generateMonthsForYear(currentYear);
    monthSelect.innerHTML = months
      .map((m) => `<option value="${m.id}">${m.name}</option>`)
      .join('');
    monthSelect.value = newMonthId;
    const monthObject = months.find((m) => m.id === newMonthId);
    if (monthObject && monthTitleElement) {
      // Verificamos que monthTitleElement exista antes de usarlo
      currentMonthTitle.set(`${monthObject.name} de ${currentYear}`);
    }
  });

  // El elemento monthTitleElement es opcional, ya que los selectores ahora muestran mes y año.
  if (monthTitleElement) {
    currentMonthTitle.subscribe((title) => {
      monthTitleElement.textContent = title;
    });
  }

  const renderAgentSelector = () => {
    const { isAdmin, currentUser: userProfile } = agentSelectorContext.get();
    const activeView = currentView.get();
    const agents = availableAgents.get();
    let options = [];
    let shouldBeDisabled = false;

    if (isAdmin) {
      options.push({ value: 'all', text: 'Todos los Agentes' });
      agents.forEach((agent) => options.push({ value: String(agent.id), text: agent.name }));
    } else if (userProfile) {
      const userAgent = agents.find((agent) => String(agent.id) === String(userProfile.agentId));

      if (activeView === 'calendario') {
        if (userAgent) options.push({ value: String(userAgent.id), text: userAgent.name });
        shouldBeDisabled = true;
      } else {
        options.push({ value: 'all', text: 'Todos los Agentes' });
        if (userAgent) options.push({ value: String(userAgent.id), text: userAgent.name });
        shouldBeDisabled = false;
      }
    }

    agentSelect.innerHTML = options
      .map((opt) => `<option value="${opt.value}">${opt.text}</option>`)
      .join('');
    agentSelect.disabled = shouldBeDisabled;

    const currentAgentValue = selectedAgentId.get();
    if (options.some((opt) => opt.value === currentAgentValue)) {
      agentSelect.value = currentAgentValue;
    } else if (options.length > 0) {
      setAgent(options[0].value);
    }
  };
  agentSelectorContext.subscribe(renderAgentSelector);
  currentView.subscribe(renderAgentSelector);

  selectedAgentId.subscribe((agentId) => {
    if (agentSelect.value !== agentId) agentSelect.value = agentId;
  });

  // --- LÓGICA DE CARGA INICIAL ---
  const today = new Date();
  const initialYear = today.getFullYear();
  const initialMonthName = formatDate(today, 'MMMM', { locale: 'es' }).toLowerCase();
  const initialMonthId = `cuadrante_${initialMonthName}_${initialYear}`;
  const user = currentUser.get();

  if (user && user.role === 'supervisor') {
    setView('tarjetas');
    setAgent('all');
    if (viewSelectorBtn) viewSelectorBtn.disabled = true;
    if (agentSelect) agentSelect.disabled = true;
    if (managementSelectorBtn) managementSelectorBtn.style.display = 'none';
    if (userRequestsBtn) userRequestsBtn.style.display = 'none';
    if (extraServiceBtn) extraServiceBtn.style.display = 'none';
    if (extraServicesContainer) extraServicesContainer.style.display = 'none';
    if (sidebarColumn) sidebarColumn.style.display = 'none';
  } else if (user) {
    const initialAgent = user.role === 'admin' ? 'all' : String(user.agentId || '');
    setAgent(initialAgent);

    if (viewSelectorBtn) viewSelectorBtn.disabled = false;

    if (managementSelectorBtn) {
      managementSelectorBtn.style.display = user.role === 'admin' ? 'inline-flex' : 'none';
    }
    if (userRequestsBtn) {
      userRequestsBtn.style.display = user.role === 'guard' ? 'inline-flex' : 'none';
    }

    if (extraServiceBtn) extraServiceBtn.style.display = 'inline-flex';
    if (extraServicesContainer) extraServicesContainer.style.display = 'block';
  }

  setDate(initialYear, initialMonthId);
  await loadAndDisplaySchedule(selectedMonthId.get(), selectedAgentId.get());
}

// =====================================================================
// == ✅ AÑADE ESTAS NUEVAS FUNCIONES EXPORTABLES AL FINAL DEL ARCHIVO ==
// =====================================================================

/**
 * Rellena un elemento <select> con una lista de años.
 * @param {HTMLSelectElement} selectElement - El elemento <select> a rellenar.
 */
export function populateYearSelector(selectElement) {
  if (!selectElement) return;
  const currentYear = new Date().getFullYear();
  let optionsHtml = '';
  for (let i = currentYear - 5; i <= currentYear + 1; i++) {
    optionsHtml += `<option value="${i}">${i}</option>`;
  }
  selectElement.innerHTML = optionsHtml;
  selectElement.value = currentYear; // Selecciona el año actual por defecto
}

/**
 * Rellena un elemento <select> con los meses del año.
 * @param {HTMLSelectElement} selectElement - El elemento <select> a rellenar.
 */
export function populateMonthSelector(selectElement) {
  if (!selectElement) return;
  const months = [
    { value: 'all', name: 'Todos los Meses' },
    { value: '1', name: 'Enero' }, { value: '2', name: 'Febrero' },
    { value: '3', name: 'Marzo' }, { value: '4', name: 'Abril' },
    { value: '5', name: 'Mayo' }, { value: '6', name: 'Junio' },
    { value: '7', name: 'Julio' }, { value: '8', name: 'Agosto' },
    { value: '9', name: 'Septiembre' }, { value: '10', name: 'Octubre' },
    { value: '11', name: 'Noviembre' }, { value: '12', name: 'Diciembre' }
  ];
  selectElement.innerHTML = months.map(m => `<option value="${m.value}">${m.name}</option>`).join('');
}

/**
 * Rellena un elemento <select> con la lista de agentes disponibles.
 * @param {HTMLSelectElement} selectElement - El elemento <select> a rellenar.
 * @param {boolean} includeAllOption - Si es true, añade la opción "Todos los Agentes".
 */
export function populateAgentSelector(selectElement, includeAllOption = false) {
  if (!selectElement) return;
  const agents = availableAgents.get(); // Obtiene los agentes del estado global
  let optionsHtml = '';
  
  if (includeAllOption) {
    optionsHtml += `<option value="all">Todos los Agentes</option>`;
  }
  
  agents.forEach(agent => {
    optionsHtml += `<option value="${agent.id}">${agent.name}</option>`;
  });
  
  selectElement.innerHTML = optionsHtml;
}
