// js/ui/templateEditorModal.js (VERSIÓN FINAL CON <textarea>)

import { displayMessage, showLoading, hideLoading } from './viewManager.js';
import {
  createDocumentTemplate,
  updateDocumentTemplate,
  // --- MODIFICACIÓN: Ya no necesitamos la subida de imágenes desde aquí ---
  // uploadTemplateImage, 
} from '../dataController.js';
import Quill from 'quill';
import 'quill/dist/quill.snow.css'; // Importa los estilos del editor

// --- Variables del Módulo ---
let modal, form, modalTitle, templateNameInput, templateTypeSelect;
// --- MODIFICACIÓN: Reemplazamos 'quill' por una referencia al textarea ---
let templateSourceTextarea; 
let isInitialized = false;
let onSaveCallback = null;
let editingTemplateId = null;
let editingTemplateData = null; // Mantenemos esto para el schema existente al editar

// --- MODIFICACIÓN: La función imageHandler ya no es necesaria y ha sido eliminada ---

/**
 * Inicializa el modal y los elementos del formulario una sola vez.
 */
export function initializeTemplateEditorModal() {
  if (isInitialized) return;

  modal = document.getElementById('template-editor-modal');
  if (!modal) return;

  form = modal.querySelector('#template-form');
  modalTitle = modal.querySelector('#template-modal-title');
  templateNameInput = modal.querySelector('#template-name');
  templateTypeSelect = modal.querySelector('#template-type');
  const closeButton = modal.querySelector('.close-button');

  // --- MODIFICACIÓN: Obtenemos la referencia al nuevo <textarea> ---
  // El div '#quill-editor' debe ser reemplazado en tu HTML por un <textarea id="template-html-source">
  templateSourceTextarea = modal.querySelector('#template-html-source');
  
  // --- MODIFICACIÓN: Toda la inicialización de Quill ha sido eliminada ---

  form.addEventListener('submit', handleFormSubmit);
  closeButton.addEventListener('click', hideTemplateEditorModal);

  isInitialized = true;
}

/**
 * Abre el modal, ya sea para crear una nueva plantilla o para editar una existente.
 */
export function openTemplateEditorModal(callback, templateData = null) {
  console.log('🔵 Ejecutando openTemplateEditorModal...'); // Depuración
  
  if (!isInitialized) initializeTemplateEditorModal();
  
  // Vamos a verificar si la variable 'modal' es correcta
  console.log('🔵 Elemento del modal encontrado:', modal); // Depuración

  onSaveCallback = callback;
  form.reset();
  
  if (templateSourceTextarea) {
    templateSourceTextarea.value = '';
  }

  if (templateData) {
    // ... (el resto de la función no cambia)
    editingTemplateId = templateData.id;
    editingTemplateData = templateData;
    modalTitle.textContent = 'Editar Plantilla';
    templateNameInput.value = templateData.templateName;
    templateTypeSelect.value = templateData.documentType;
    if (templateSourceTextarea) {
      templateSourceTextarea.value = templateData.content;
    }
  } else {
    editingTemplateId = null;
    editingTemplateData = null;
    modalTitle.textContent = 'Nueva Plantilla';
  }

  console.log('🔵 Mostrando el modal ahora...'); // Depuración
  modal.classList.remove('hidden');
}

// ✅ FUNCIÓN MOVIDA AQUÍ Y EXPORTADA
export function openPreviewModal(templateData) {
    const modal = document.getElementById('template-preview-modal');
    if (!modal) {
        console.error('El modal de previsualización no se encuentra en el DOM.');
        return;
    }
    const modalTitle = modal.querySelector('#preview-modal-title');
    const iframe = modal.querySelector('#preview-iframe');
    const closeButton = modal.querySelector('.close-button');
    
    if (modalTitle) modalTitle.textContent = `Previsualización: ${templateData.templateName}`;
    
    const previewDocument = iframe.contentDocument || iframe.contentWindow.document;
    
    const fullHtml = templateData.content || '';
    const styleMatch = fullHtml.match(/<style>([\s\S]*?)<\/style>/i);
    const bodyMatch = fullHtml.match(/<body>([\s\S]*?)<\/body>/i);
    const templateStyles = styleMatch ? styleMatch[1] : '';
    const templateBody = bodyMatch ? bodyMatch[1] : fullHtml;
    
    previewDocument.open();
    previewDocument.write(`<!DOCTYPE html><html><head><title>Vista Previa</title><style>${templateStyles}</style></head><body>${templateBody}</body></html>`);
    previewDocument.close();
    
    modal.classList.remove('hidden');
    
    // Asigna el evento de cierre de forma segura
    const newCloseButton = closeButton.cloneNode(true);
    closeButton.parentNode.replaceChild(newCloseButton, closeButton);
    newCloseButton.addEventListener('click', () => modal.classList.add('hidden'));
}

function hideTemplateEditorModal() {
  modal.classList.add('hidden');
}

function parsePlaceholdersFromContent(htmlContent) {
  const regex = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
  const matches = new Set();
  let match;
  while ((match = regex.exec(htmlContent)) !== null) {
    const autoPlaceholders = ['FECHA_ACTUAL', 'NUM_REGISTRO', 'AGENTES_FIRMANTES'];
    if (!autoPlaceholders.includes(match[1])) {
      matches.add(match[1]);
    }
  }
  return Array.from(matches);
}

async function handleFormSubmit(event) {
  event.preventDefault();
  showLoading();

  const name = templateNameInput.value.trim();
  const type = templateTypeSelect.value;
  // --- MODIFICACIÓN: Obtenemos el contenido desde el .value del textarea ---
  const content = templateSourceTextarea.value;

  // --- MODIFICACIÓN: La comprobación de contenido vacío es más simple ahora ---
  if (!name || !content.trim()) {
    hideLoading();
    displayMessage('El nombre y el contenido de la plantilla son obligatorios.', 'error');
    return;
  }

  let templateData;
  if (editingTemplateId && editingTemplateData) {
    templateData = {
      templateName: name,
      documentType: type,
      content: content,
      // Al editar, mantenemos el schema por si el usuario no quiere regenerarlo,
      // pero actualizamos los placeholders por si ha añadido o quitado alguno.
      schema: editingTemplateData.schema || {},
      placeholders: parsePlaceholdersFromContent(content),
    };
  } else {
    const placeholders = parsePlaceholdersFromContent(content);
    const schema = {};
    placeholders.forEach((p) => {
      // Por defecto, cada nuevo placeholder es un campo de texto simple.
      schema[p] = { type: 'text', label: p.charAt(0).toUpperCase() + p.slice(1), required: true };
    });
    templateData = {
      templateName: name,
      documentType: type,
      content: content,
      placeholders: placeholders,
      schema: schema,
    };
  }

  try {
    if (editingTemplateId) {
      await updateDocumentTemplate(editingTemplateId, templateData);
      displayMessage('Plantilla actualizada con éxito.', 'success');
    } else {
      await createDocumentTemplate(templateData);
      displayMessage('Plantilla creada con éxito.', 'success');
    }
    hideTemplateEditorModal();
    if (onSaveCallback) onSaveCallback();
  } catch (error) {
    displayMessage(`Error al guardar la plantilla: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}