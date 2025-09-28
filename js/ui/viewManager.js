// js/ui/viewManager.js (VERSIÓN FINAL Y CORREGIDA)

import { currentView, setView } from '../state.js';

const messagesContainer = document.getElementById('app-messages-container');
let messageTimeout;

export function showAppContent(userEmail) {
  const authContainer = document.getElementById('auth-container');
  const appContent = document.getElementById('app-content');

  // ✅ LÓGICA CORREGIDA: Gestionamos la visibilidad con clases.
  // Oculta el login y muestra el contenido de la app.
  if (authContainer) authContainer.classList.add('hidden');
  if (appContent) appContent.classList.remove('hidden');
}

export function showLoginScreen() {
  const authContainer = document.getElementById('auth-container');
  const appContent = document.getElementById('app-content');

  // ✅ LÓGICA CORREGIDA: Gestionamos la visibilidad con clases.
  // Oculta el contenido de la app y muestra el login.
  if (appContent) appContent.classList.add('hidden');
  if (authContainer) authContainer.classList.remove('hidden');

  // Limpia cualquier mensaje de error anterior al volver al login.
  if (messagesContainer) messagesContainer.innerHTML = '';
}

// El resto de tu archivo (initializeViewButtons, showLoading, etc.)
// está correcto y se mantiene igual.
export function initializeViewButtons() {
  const viewCardButton = document.getElementById('viewCardButton');
  const viewCalendarButton = document.getElementById('viewCalendarButton');
  if (!viewCardButton || !viewCalendarButton) return;

  const setActiveView = (viewType) => {
    setView(viewType);
    if (viewType === 'tarjetas') {
      viewCardButton.classList.add('active');
      viewCalendarButton.classList.remove('active');
    } else {
      viewCalendarButton.classList.add('active');
      viewCardButton.classList.remove('active');
    }
  };

  viewCardButton.addEventListener('click', () => setActiveView('tarjetas'));
  viewCalendarButton.addEventListener('click', () => setActiveView('calendario'));
  setActiveView(currentView.get() || 'tarjetas');
}

export function showLoading() {
  const loadingOverlay = document.getElementById('loading-overlay');
  if (loadingOverlay) loadingOverlay.classList.remove('hidden');
}

export function hideLoading() {
  const loadingOverlay = document.getElementById('loading-overlay');
  if (loadingOverlay) loadingOverlay.classList.add('hidden');
}

export function displayMessage(message, type = 'info', duration = 5000) {
  if (!messagesContainer) {
    console.warn('Contenedor de mensajes (#app-messages-container) no encontrado.');
    alert(`[${type.toUpperCase()}] ${message}`);
    return;
  }

  clearTimeout(messageTimeout);
  messagesContainer.innerHTML = '';

  const messageElement = document.createElement('div');
  messageElement.classList.add('app-message', `app-message-${type}`);
  messageElement.textContent = message;

  messagesContainer.appendChild(messageElement);

  messageTimeout = setTimeout(() => {
    messageElement.classList.add('fade-out');
    messageElement.addEventListener(
      'transitionend',
      () => {
        if (messageElement.parentNode) {
          messagesContainer.removeChild(messageElement);
        }
      },
      { once: true }
    );
  }, duration);
}

export function showInitializeMonthModal() {
  const modal = document.getElementById('initialize-month-modal');
  if (modal) modal.classList.remove('hidden');
}

export function hideInitializeMonthModal() {
  const modal = document.getElementById('initialize-month-modal');
  if (modal) modal.classList.add('hidden');
}
