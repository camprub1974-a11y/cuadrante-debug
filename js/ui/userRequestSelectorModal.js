// js/ui/userRequestSelectorModal.js (VERSIÓN FINAL Y CORREGIDA)

import { showRequestPermissionModal } from './requestPermissionModal.js';
import { showManageRequestsModal } from './manageRequestsModal.js';
import { displayMessage } from './viewManager.js';

let modal;
let isInitialized = false;

/**
 * Esta función SÓLO inicializa el modal.
 * Busca los elementos del DOM y añade los listeners de eventos.
 * Se llama una única vez desde main.js al arrancar la aplicación.
 */
export function initializeUserRequestSelectorModal() {
  // Si ya se inicializó, no hace nada más para evitar duplicar listeners.
  if (isInitialized) return;

  modal = document.getElementById('user-requests-selector-modal');
  if (!modal) {
    console.error(
      'Error Crítico: El HTML del modal #user-requests-selector-modal no se encontró en index.html.'
    );
    return;
  }

  // Usamos un único listener en el modal para manejar todos los clics eficientemente.
  modal.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return; // Si el clic no fue en un botón, no hace nada.

    // Cualquier botón dentro del modal lo cerrará primero.
    hideUserRequestSelectorModal();

    // Ahora decidimos qué hacer según el botón pulsado.
    if (button.id === 'select-request-permission') {
      showRequestPermissionModal();
    } else if (button.id === 'select-propose-change') {
      displayMessage(
        'Para proponer un cambio, haz clic directamente en tu turno en el cuadrante.',
        'info',
        8000
      );
    } else if (button.id === 'select-view-my-requests') {
      showManageRequestsModal();
    }
    // No necesitamos un caso para '.close-button' porque la acción de cerrar ya se hizo.
  });

  isInitialized = true;
  console.log("✅ Modal 'Mis Solicitudes' inicializado correctamente.");
}

/**
 * Esta función SÓLO muestra el modal.
 * Es llamada desde main.js únicamente cuando el usuario hace clic en el botón "Mis Solicitudes".
 */
export function showUserRequestSelectorModal() {
  if (!isInitialized) {
    console.error(
      'Error: Se intentó mostrar el modal de solicitudes sin haberlo inicializado desde main.js.'
    );
    return;
  }
  if (modal) {
    modal.classList.remove('hidden');
    // Refresca los iconos por si acaso
    if (window.feather) {
      feather.replace();
    }
  }
}

/**
 * Esta función SÓLO oculta el modal.
 */
function hideUserRequestSelectorModal() {
  if (modal) {
    modal.classList.add('hidden');
  }
}
