// js/ui/viewSelectorModal.js

import { setView, selectedMonthId, selectedAgentId } from '../state.js';
import { loadAndDisplaySchedule } from '../logic.js'; // <-- 1. IMPORTAMOS LA FUNCIÓN DE RENDERIZADO

let modal;
let closeButton;
let tarjetasButton;
let calendarioButton;

/**
 * Maneja la selección de una nueva vista, actualiza el estado y redibuja el cuadrante.
 * @param {string} newView - El nombre de la nueva vista ('tarjetas' o 'calendario').
 */
function handleViewSelection(newView) {
  setView(newView); // Actualizamos el estado global
  hideViewSelectorModal();
  // ✅ 2. VOLVEMOS A CARGAR EL CUADRANTE para que se renderice con la nueva vista
  loadAndDisplaySchedule(selectedMonthId.get(), selectedAgentId.get());
}

export function initializeViewSelectorModal() {
  modal = document.getElementById('view-selector-modal');
  if (!modal) {
    console.error('El modal #view-selector-modal no se encuentra en el DOM.');
    return;
  }

  closeButton = modal.querySelector('.close-button');
  tarjetasButton = modal.querySelector('#select-view-tarjetas');
  calendarioButton = modal.querySelector('#select-view-calendario');

  if (closeButton) {
    closeButton.addEventListener('click', hideViewSelectorModal);
  }
  // ✅ 3. LLAMAMOS A LA NUEVA FUNCIÓN CENTRALIZADA
  if (tarjetasButton) {
    tarjetasButton.addEventListener('click', () => handleViewSelection('tarjetas'));
  }
  if (calendarioButton) {
    calendarioButton.addEventListener('click', () => handleViewSelection('calendario'));
  }

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      hideViewSelectorModal();
    }
  });
}

export function showViewSelectorModal() {
  if (modal) {
    modal.classList.remove('hidden');
  }
}

function hideViewSelectorModal() {
  if (modal) {
    modal.classList.add('hidden');
  }
}
