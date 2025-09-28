// js/main.js (VERSIÓN FINAL Y CORREGIDA)

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { openRegistroModal, initializeRegistroModal } from './ui/registroModal.js'; 
import { initializeTemplateEditorModal } from './ui/templateEditorModal.js'; 
import { doc, getDoc } from 'firebase/firestore';
import {
  setUser,
  currentUser,
  pendingNotificationsCount,
  selectedMonthId,
  selectedAgentId,
  isEditModeActive,
  toggleEditMode,
  currentView,
  renderContext,
} from './state.js';
import {
  loadInitialAgents,
  updateNotificationCount,
  getScheduleForMonth,
  getMarkedDates,
} from './dataController.js';
import { initSelectors } from './ui/selectorManager.js';
import {
  showLoginScreen,
  showAppContent,
  showLoading,
  hideLoading,
  displayMessage,
} from './ui/viewManager.js';
import { renderPlanningView, resetPlanningView } from './ui/planningView.js';
import { renderIdentificacionesView } from './ui/identificacionesView.js';
import { renderReportsList, resetReportsListView } from './ui/reportsListView.js';
import { renderExtraServicesView, resetExtraServicesView } from './ui/extraServicesRenderer.js';
import { renderAdminDashboard } from './ui/adminDashboardView.js';
import { renderRegistroView, resetRegistroView } from './ui/registroView.js';
import { renderCroquisView, resetCroquisView } from './ui/croquisView.js';
import { renderServiceReport } from './ui/serviceReportView.js';
import { renderActivityFeed } from './ui/activityFeedRenderer.js';
import { initializePdfOptionsModal } from './ui/pdfOptionsModal.js';
import { initializeAgentManagerModal } from './ui/agentManagerModal.js';
import { initializeRequestPermissionModal } from './ui/requestPermissionModal.js';
import {
  initializeManageRequestsModal,
  showManageRequestsModal,
} from './ui/manageRequestsModal.js';
import { initializeProposeChangeModal } from './ui/proposeChangeModal.js';
import { initializeRespondToProposalModal } from './ui/respondToProposalModal.js';
import { initializeShiftModal } from './ui/shiftModal.js';
import { initializeViewSelectorModal, showViewSelectorModal } from './ui/viewSelectorModal.js';
import {
  initializeManagementSelectorModal,
  showManagementSelectorModal,
} from './ui/managementSelectorModal.js';
import { initializeAddMarkedDateModal } from './ui/addMarkedDateModal.js';
import { initializeExtraServiceModal } from './ui/extraServiceModal.js';
import { initializeServiceOrderModal } from './ui/serviceOrderModal.js';
import { initializeAssignmentModal } from './ui/assignmentModal.js';
import { initializeReportEntryModal } from './ui/reportEntryModal.js';
import { initializeReportSummaryModal } from './ui/reportSummaryModal.js';
import { initializeDefaultOrderTemplateModal } from './ui/defaultOrderTemplateModal.js';
import { initializeAddRequerimientoModal } from './ui/addRequerimientoModal.js';
import { initializeViewOrderModal } from './ui/viewOrderModal.js';
import { render } from './ui/scheduleRenderer.js';
import {
  initializeUserRequestSelectorModal,
  showUserRequestSelectorModal,
} from './ui/userRequestSelectorModal.js';
import { initializeEstablecimientoModal } from './ui/establecimientoModal.js';
import { renderPlantillasView, resetPlantillasView } from './ui/plantillasView.js';


// --- VARIABLES GLOBALES DEL MÓDULO ---
const viewContainer = document.getElementById('app-view-container');
let appInitialized = false;
let currentLoadedView = null;

// --- FUNCIONES DE INICIALIZACIÓN Y NAVEGACIÓN ---

// CADA VISTA AHORA GESTIONA SUS PROPIOS EVENTOS DE MODAL.

async function loadViewAndInitialize(viewName, renderFunction) {
  showLoading(`Cargando ${viewName}...`);
  try {
    const response = await fetch(`/views/${viewName}.html?v=${new Date().getTime()}`);
    if (!response.ok) throw new Error(`El archivo /views/${viewName}.html no existe.`);
    viewContainer.innerHTML = await response.text();
    currentLoadedView = viewName;

    // --- INICIO DE LA CORRECCIÓN ---
    // Movemos feather.replace() para que se ejecute ANTES de la función de renderizado.
    if (window.feather) feather.replace();
    
    // Ahora ejecutamos la función de renderizado, que añadirá los listeners.
    if (renderFunction) await renderFunction();
    // --- FIN DE LA CORRECIÓn ---

  } catch (error) {
    console.error(`Error al cargar la vista ${viewName}:`, error);
    displayMessage('Error al cargar la sección.', 'error');
  } finally {
    hideLoading();
  }
}

function updateActiveTab(viewName) {
  document
    .querySelectorAll('.module-nav .module-tab')
    .forEach((tab) => tab.classList.remove('active'));
  const activeTab = document.querySelector(
    `.module-tab[data-view="${viewName}"], .module-tab-dropdown-container .module-tab[data-view="${viewName}"]`
  );
  if (activeTab) {
    activeTab.classList.add('active');
    const parentDropdown = activeTab.closest('.module-tab-dropdown-container');
    if (parentDropdown) {
      parentDropdown.querySelector('.module-tab').classList.add('active');
    }
  }
}

// --- FUNCIONES PARA MOSTRAR CADA VISTA ---

export async function showScheduleView() {
  await loadViewAndInitialize('cuadrante', async () => {
    updateActiveTab('cuadrante');
    document.querySelector('.sidebar-column')?.classList.remove('hidden');

    const userProfile = currentUser.get();
    const editButton = document.getElementById('edit-mode-toggle');
    if (editButton) {
      if (userProfile && userProfile.role === 'admin') {
        editButton.style.display = 'inline-flex';
        const updateButtonState = () => {
          const isActive = isEditModeActive.get();
          editButton.innerHTML = isActive
            ? '<i data-feather="eye"></i><span>Modo Visor</span>'
            : '<i data-feather="edit-2"></i><span>Modo Editor</span>';
          if (window.feather) feather.replace();
          editButton.classList.toggle('active', isActive);
          document.body.classList.toggle('edit-mode-active', isActive);
        };
        editButton.addEventListener('click', () => {
          toggleEditMode();
          updateButtonState();
        });
        updateButtonState();
      } else {
        editButton.style.display = 'none';
      }
    }

    const managementButton = document.getElementById('management-selector-btn');
    if (managementButton) {
      if (userProfile && userProfile.role === 'admin') {
        managementButton.style.display = 'inline-flex';
        managementButton.addEventListener('click', showManagementSelectorModal);
      } else {
        managementButton.style.display = 'none';
      }
    }

    const userRequestsButton = document.getElementById('user-requests-selector-btn');
    if (userRequestsButton) {
      if (userProfile && userProfile.role !== 'admin') {
        userRequestsButton.style.display = 'inline-flex';
        userRequestsButton.addEventListener('click', showUserRequestSelectorModal);
      } else {
        userRequestsButton.style.display = 'none';
      }
    }

    document.getElementById('view-selector-btn')?.addEventListener('click', showViewSelectorModal);
    initSelectors();
    renderContext.subscribe(render);
    selectedMonthId.subscribe(refreshScheduleView);
    selectedAgentId.subscribe(refreshScheduleView);
    currentView.subscribe(refreshScheduleView);
    await refreshScheduleView();
    renderActivityFeed();
  });
}

export async function showPlanningView() {
  // ✅ LÍNEA AÑADIDA: Oculta la barra lateral antes de cargar.
  document.querySelector('.sidebar-column')?.classList.add('hidden');
  // ✅ CORRECCIÓN: Se añade la llamada a updateActiveTab dentro de la función de renderizado.
  await loadViewAndInitialize('planificacion', async () => {
    updateActiveTab('planificacion');
    await renderPlanningView(); // Mantenemos la llamada a la función original
  });
}

export async function showReportsListView() {
  document.querySelector('.sidebar-column')?.classList.add('hidden');
  await loadViewAndInitialize('partes_servicio', () => {
    updateActiveTab('partes_servicio');
    renderReportsList();
    if (window.feather) feather.replace();
  });
}

export async function showExtraServicesView() {
  document.querySelector('.sidebar-column')?.classList.add('hidden');
  await loadViewAndInitialize('servicios_extra', () => {
    updateActiveTab('servicios_extra');
    renderExtraServicesView();
    if (window.feather) feather.replace();
  });
}

export async function showAdminDashboardView() {
  document.querySelector('.sidebar-column')?.classList.add('hidden');
  await loadViewAndInitialize('registros_estadisticas', () => {
    updateActiveTab('registros_estadisticas');
    renderAdminDashboard();
  });
}

export async function showRegistroView(subview = 'registros') {
  document.querySelector('.sidebar-column')?.classList.add('hidden');
  await loadViewAndInitialize('registro_electronico', () => {
    updateActiveTab('registro_electronico');
    renderRegistroView(subview);
  });
}

export async function showCroquisView() {
  document.querySelector('.sidebar-column')?.classList.add('hidden');
  await loadViewAndInitialize('croquizador', async () => {
    updateActiveTab('croquis');
    await renderCroquisView();
  });
}

export async function showServiceReportView(reportId) {
  await loadViewAndInitialize('service_report', () => {
    updateActiveTab('partes_servicio');
    renderServiceReport(reportId);
  });
}

export async function showIdentificacionesView() {
  // ✅ LÍNEA AÑADIDA: Oculta la barra lateral antes de cargar.
  document.querySelector('.sidebar-column')?.classList.add('hidden');
  
  await loadViewAndInitialize('identificaciones', renderIdentificacionesView);
}

// ✅ 2. CREAMOS LA FUNCIÓN QUE CARGA LA VISTA DE PLANTILLAS
export async function showPlantillasView() {
  document.querySelector('.sidebar-column')?.classList.add('hidden');
  await loadViewAndInitialize('plantillas', () => {
    updateActiveTab('gestion_plantillas');
    renderPlantillasView();
  });
}


// --- LÓGICA DE AUTENTICACIÓN E INICIO DE LA APP ---

async function handleAuthStateChange(user) {
  if (user) {
    if (appInitialized) return;
    showLoading('Verificando usuario...');
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const userProfile = {
          uid: user.uid,
          email: user.email,
          role: userData.role || 'guard',
          agentId: String(userData.agentId || ''),
          displayName: userData.name || userData.agentId,
        };
        setUser(userProfile);
        showAppContent(userProfile.agentId);
        await initializeAppData();
        appInitialized = true;
        await showScheduleView();
      } else {
        displayMessage('Perfil de usuario no encontrado.', 'error');
        await signOut(auth);
      }
    } catch (error) {
      console.error('Error en handleAuthStateChange:', error);
      await signOut(auth);
    } finally {
      hideLoading();
    }
  } else {
    showLoginScreen();
    appInitialized = false;
    currentLoadedView = null;
  }
}

async function initializeAppData() {
  try {
    await loadInitialAgents();
    initializeShiftModal();
    initializePdfOptionsModal();
    initializeAgentManagerModal();
    initializeRequestPermissionModal();
    initializeManageRequestsModal();
    initializeProposeChangeModal();
    initializeRespondToProposalModal();
    initializeViewSelectorModal();
    initializeManagementSelectorModal();
    initializeAddMarkedDateModal();
    initializeExtraServiceModal();
    initializeServiceOrderModal();
    initializeAssignmentModal();
    initializeReportEntryModal();
    initializeReportSummaryModal();
    initializeDefaultOrderTemplateModal();
    initializeAddRequerimientoModal();
    initializeRegistroModal();
    initializeViewOrderModal();
    initializeUserRequestSelectorModal();
    initializeTemplateEditorModal();
    
    configureMainNavigationAndButtons();
    await updateNotificationCount();
    document.addEventListener('scheduleShouldRefresh', refreshScheduleView);
  } catch (error) {
    console.error('Error crítico al cargar los componentes de la aplicación:', error);
  }
}


// ✅ 3. ACTUALIZAMOS LA FUNCIÓN DE NAVEGACIÓN
function configureMainNavigationAndButtons() {
  const userProfile = currentUser.get();
  const isMando = userProfile?.role === 'admin' || userProfile?.role === 'supervisor';

  const viewResetFunctions = {
    planificacion: resetPlanningView,
    partes_servicio: resetReportsListView,
    servicios_extra: resetExtraServicesView,
    registro_electronico: resetRegistroView,
    gestion_plantillas: resetPlantillasView,
    croquis: resetCroquisView,
  };
  
  const cleanAndListen = (element, handler) => {
    if (!element) return;
    const newElement = element.cloneNode(true);
    element.parentNode.replaceChild(newElement, element);
    newElement.addEventListener('click', (e) => {
      e.preventDefault();
      const viewName = element.dataset.view;
      const previousView = currentLoadedView;
      if (previousView && viewResetFunctions[previousView]) {
          viewResetFunctions[previousView]();
      }
      handler(e);
    });
  };

  const loggedInUserDisplay = document.getElementById('logged-in-user-display');
  if (loggedInUserDisplay) loggedInUserDisplay.textContent = userProfile.agentId;

  document.querySelectorAll('.module-nav .module-tab').forEach((tab) => {
    const view = tab.dataset.view;
    const isAdminView = ['planificacion', 'registros_estadisticas', 'gestion_plantillas'].includes(view);

    if (isAdminView) {
      tab.style.display = isMando ? 'flex' : 'none';
    }

    const handler = {
      cuadrante: showScheduleView,
      planificacion: showPlanningView,
      partes_servicio: showReportsListView,
      servicios_extra: showExtraServicesView,
      registros_estadisticas: showAdminDashboardView,
      registro_electronico: () => showRegistroView('entrada'),
      gestion_plantillas: showPlantillasView, // Se conecta la nueva función
      croquis: showCroquisView,
      identificaciones: showIdentificacionesView,
    }[view];

    if (handler) {
      cleanAndListen(tab, handler);
    }
  });

  cleanAndListen(document.getElementById('logout-button-header'), handleLogout);

  const notificationBellButton = document.getElementById('notification-bell-button');
  if (notificationBellButton) {
    cleanAndListen(notificationBellButton, showManageRequestsModal);
    const badge = notificationBellButton.querySelector('#notification-badge');
    pendingNotificationsCount.subscribe((count) => {
      if (badge) {
        badge.textContent = count > 9 ? '9+' : count;
        badge.classList.toggle('hidden', count === 0);
      }
    });
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('identification').value;
  const password = document.getElementById('password').value;
  showLoading();
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    hideLoading();
    displayMessage('Nº de identificación o contraseña incorrectos.', 'error');
  }
}

async function handleLogout() {
  showLoading();
  try {
    await signOut(auth);
  } catch (error) {
    displayMessage(`Error al cerrar sesión.`, 'error');
  } finally {
    hideLoading();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, handleAuthStateChange);
  document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
});

async function refreshScheduleView() {
  if (currentLoadedView !== 'cuadrante') return;
  showLoading('Actualizando cuadrante...');
  try {
    const monthId = selectedMonthId.get();
    const agentId = selectedAgentId.get();
    const scheduleData = await getScheduleForMonth(monthId);
    const markedDates = await getMarkedDates(monthId);
    const context = {
      scheduleData: scheduleData,
      markedDates: markedDates,
      selectedAgentId: agentId,
      userProfile: currentUser.get(),
      currentView: currentView.get(),
    };
    renderContext.set(context);
  } catch (error) {
    console.error('Error al refrescar el cuadrante:', error);
    displayMessage('No se pudo actualizar el cuadrante.', 'error');
  } finally {
    hideLoading();
  }
}