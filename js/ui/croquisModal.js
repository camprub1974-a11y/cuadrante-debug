// js/ui/croquisModal.js

import { displayMessage, showLoading, hideLoading } from './viewManager.js';
import { uploadCroquisImage, saveSketchRecord, updateSketch } from '../dataController.js';

let modal, form, fileInput, captureOverlay; // ✅ 'captureOverlay' añadido aquí
let isInitialized = false;
let onSaveCallback = null;
let editingSketchId = null;

export function initializeCroquisModal() {
  if (isInitialized) return;

  modal = document.getElementById('croquis-modal');
  form = document.getElementById('croquis-form');
  fileInput = document.getElementById('croquis-file-input');

  const innerOverlay = document.getElementById('croquis-capture-instructions');
  const prepareCaptureBtn = document.getElementById('prepare-capture-btn');
  const exitInnerOverlayBtn = document.getElementById('exit-capture-mode-btn-inner');

  const closeModalBtn = modal.querySelector('.close-button');

  if (
    !modal ||
    !form ||
    !fileInput ||
    !closeModalBtn ||
    !innerOverlay ||
    !prepareCaptureBtn ||
    !exitInnerOverlayBtn
  ) {
    console.error(
      'Error crítico: No se encontraron todos los elementos necesarios del modal del croquis o de la capa de captura en el HTML. Revisa los IDs.'
    );
    return;
  }

  form.addEventListener('submit', handleSaveCroquis);
  closeModalBtn.addEventListener('click', () => hideCroquisModal());

  // --- ✅ INICIO DE LA LÓGICA CORREGIDA ---

  prepareCaptureBtn.addEventListener('click', () => {
    // Hacemos visible la capa de instrucciones
    innerOverlay.classList.remove('hidden');

    // Forzamos el color blanco a todos los elementos de texto con JavaScript
    const textElements = innerOverlay.querySelectorAll('h2, p, strong, .material-icons');
    textElements.forEach((el) => {
      el.style.color = 'white';
    });
  });

  exitInnerOverlayBtn.addEventListener('click', () => {
    // Ocultamos la capa
    innerOverlay.classList.add('hidden');

    // (Opcional) Limpiamos los estilos para no dejarlos fijos en el HTML
    const textElements = innerOverlay.querySelectorAll('h2, p, strong, .material-icons');
    textElements.forEach((el) => {
      el.style.color = ''; // Elimina el estilo en línea
    });
  });

  // --- ✅ FIN DE LA LÓGICA CORREGIDA ---

  isInitialized = true;
}

export function openCroquisModal(callback, sketchData = null) {
  if (!isInitialized) initializeCroquisModal();
  onSaveCallback = callback;
  form.reset();

  // El resto de esta función no cambia
  const fileInputLabel = form.querySelector('label[for="croquis-file-input"]');
  if (sketchData) {
    editingSketchId = sketchData.id;
    document.getElementById('croquis-lugar').value = sketchData.lugar || '';
    if (sketchData.fechaSuceso) {
      document.getElementById('croquis-fecha').value = sketchData.fechaSuceso
        .toISOString()
        .split('T')[0];
      document.getElementById('croquis-hora').value = sketchData.fechaSuceso
        .toTimeString()
        .slice(0, 5);
    }
    document.getElementById('croquis-implicados').value = sketchData.implicados || '';
    document.getElementById('croquis-documento').value = sketchData.documentoRealizado || 'ninguno';
    document.getElementById('croquis-leyenda').value = sketchData.leyenda || '';
    fileInput.required = false;
    // El texto del label para el input de archivo no se cambia aquí
    // para mantener el diseño de solo icono.
  } else {
    editingSketchId = null;
    const now = new Date();
    document.getElementById('croquis-fecha').valueAsDate = now;
    document.getElementById('croquis-hora').value = now.toTimeString().slice(0, 5);
    fileInput.required = true;
  }

  modal.classList.remove('hidden');
}

export function hideCroquisModal() {
  if (modal) {
    modal.classList.add('hidden');
  }
}

async function handleSaveCroquis(event) {
  event.preventDefault();
  const file = fileInput.files[0];

  if (!editingSketchId && !file) {
    return displayMessage(
      'Debes seleccionar un archivo de imagen para el nuevo croquis.',
      'warning'
    );
  }

  const dataToSave = {
    lugar: document.getElementById('croquis-lugar').value.trim(),
    fechaSuceso: new Date(
      `${document.getElementById('croquis-fecha').value}T${document.getElementById('croquis-hora').value}`
    ),
    implicados: document.getElementById('croquis-implicados').value.trim(),
    documentoRealizado: document.getElementById('croquis-documento').value,
    leyenda: document.getElementById('croquis-leyenda').value.trim(),
  };

  if (!dataToSave.lugar || !dataToSave.implicados) {
    return displayMessage(
      'Por favor, completa todos los campos de datos del accidente.',
      'warning'
    );
  }

  showLoading('Guardando croquis...');
  try {
    if (file) {
      const downloadURL = await uploadCroquisImage(file);
      dataToSave.imageUrl = downloadURL;
    }

    if (editingSketchId) {
      await updateSketch(editingSketchId, dataToSave);
      displayMessage('Croquis actualizado con éxito.', 'success');
    } else {
      await saveSketchRecord(dataToSave);
      displayMessage('Croquis guardado con éxito.', 'success');
    }

    hideCroquisModal();
    if (onSaveCallback) onSaveCallback();
  } catch (error) {
    displayMessage(`Error al guardar: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}
