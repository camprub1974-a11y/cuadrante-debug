// RUTA: js/ui/plantillasView.js (VERSIÓN CON FORMULARIO INTEGRADO)

import { displayMessage, showLoading, hideLoading } from './viewManager.js';
import {
  getDocumentTemplates,
  deleteDocumentTemplate,
  duplicateDocumentTemplate,
  createDocumentTemplate, // Importamos las funciones para crear
  updateDocumentTemplate  // y actualizar plantillas
} from '../dataController.js';

// --- VARIABLES DEL MÓDULO PARA EL FORMULARIO INTEGRADO ---
let isInitialized = false;
let formContainer, templateForm, formTitle, templateIdInput, templateNameInput, templateTypeSelect, templateSourceTextarea;
let editingTemplateId = null;

// --- FUNCIÓN PRINCIPAL DE RENDERIZADO ---
export function renderPlantillasView() {
  if (!isInitialized) {
    // Inicializamos las referencias a los elementos del formulario una sola vez
    formContainer = document.getElementById('inline-form-container');
    templateForm = document.getElementById('template-form');
    formTitle = document.getElementById('inline-form-title');
    templateIdInput = document.getElementById('template-id');
    templateNameInput = document.getElementById('template-name');
    templateTypeSelect = document.getElementById('template-type');
    templateSourceTextarea = document.getElementById('template-html-source');
    
    setupEventListeners();
    isInitialized = true;
  }
  loadAndRenderTemplates();
}

export function resetPlantillasView() {
  isInitialized = false;
  const viewContent = document.getElementById('plantillas-view-content');
  if (viewContent) {
    const newViewContent = viewContent.cloneNode(true);
    viewContent.parentNode.replaceChild(newViewContent, viewContent);
  }
}

// --- GESTIÓN DE EVENTOS ---
function setupEventListeners() {
  const viewContent = document.getElementById('plantillas-view-content');
  if (!viewContent) return;

  viewContent.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;

    // CHIVATO 1: Para ver si el clic se detecta
    console.log("--- CHIVATO 1: Clic detectado en la vista de plantillas ---", button); 

    // Botón "Nueva Plantilla"
    if (button.id === 'create-template-btn') {
      openTemplateEditorModal(loadAndRenderTemplates);
      return;
    }

    const recordId = event.target.closest('tr')?.dataset.id;
    if (!recordId) return;

    showLoading('Cargando datos de la plantilla...');
    try {
      const templates = await getDocumentTemplates();
      const templateData = templates.find(t => t.id === recordId);

      if (!templateData) {
        throw new Error('No se pudo encontrar la plantilla seleccionada.');
      }

      // --- Lógica de depuración para el botón PREVISUALIZAR ---
      if (button.classList.contains('preview-template-btn')) {
        // CHIVATO 2: Para ver si se identifica el botón correcto
        console.log("--- CHIVATO 2: Botón de previsualizar reconocido. ---");
        // CHIVATO 3: Para ver qué datos se van a enviar al modal
        console.log("--- CHIVATO 3: Datos de la plantilla a mostrar:", templateData);
        
        openPreviewModal(templateData);
        
        // CHIVATO 4: Para confirmar que la función para abrir el modal ha sido llamada
        console.log("--- CHIVATO 4: Llamada a openPreviewModal realizada. ---");
      }
      // --- Fin de la lógica de depuración ---

      if (button.classList.contains('button-edit')) openTemplateEditorModal(loadAndRenderTemplates, templateData);
      if (button.classList.contains('button-duplicate')) handleDuplicateTemplateClick(recordId);
      if (button.classList.contains('button-delete')) handleDeleteTemplateClick(recordId);

    } catch (error) {
      displayMessage(error.message, 'error');
    } finally {
      hideLoading();
    }
  });
}

// --- FUNCIONES PARA CONTROLAR EL FORMULARIO ---

function openFormForCreate() {
  editingTemplateId = null;
  templateForm.reset();
  formTitle.textContent = 'Crear Nueva Plantilla';
  formContainer.classList.remove('hidden');
  templateNameInput.focus(); // Pone el foco en el primer campo
}

async function openFormForEdit(templateId) {
  showLoading('Cargando plantilla para editar...');
  try {
    const templates = await getDocumentTemplates();
    const templateData = templates.find(t => t.id === templateId);
    if (!templateData) throw new Error('Plantilla no encontrada.');

    editingTemplateId = templateData.id;
    formTitle.textContent = 'Editar Plantilla';
    templateNameInput.value = templateData.templateName || '';
    templateTypeSelect.value = templateData.documentType || 'informe';
    templateSourceTextarea.value = templateData.content || '';
    
    formContainer.classList.remove('hidden');
    templateNameInput.focus();
  } catch (error) {
    displayMessage(error.message, 'error');
  } finally {
    hideLoading();
  }
}

function closeForm() {
  formContainer.classList.add('hidden');
  templateForm.reset();
  editingTemplateId = null;
}

async function handleFormSubmit(event) {
  event.preventDefault();
  showLoading('Guardando plantilla...');

  const templateData = {
    templateName: templateNameInput.value.trim(),
    documentType: templateTypeSelect.value,
    content: templateSourceTextarea.value
  };

  try {
    if (editingTemplateId) {
      await updateDocumentTemplate(editingTemplateId, templateData);
      displayMessage('Plantilla actualizada con éxito.', 'success');
    } else {
      await createDocumentTemplate(templateData);
      displayMessage('Plantilla creada con éxito.', 'success');
    }
    closeForm();
    await loadAndRenderTemplates(); // Recargamos la lista
  } catch (error) {
    displayMessage(`Error al guardar: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

// --- LÓGICA DE CARGA Y RENDERIZADO DE LA TABLA (SIN CAMBIOS) ---
async function loadAndRenderTemplates() {
  showLoading('Cargando plantillas...');
  const container = document.getElementById('plantillas-list-container');
  try {
    const templates = await getDocumentTemplates();
    renderTemplatesList(templates);
  } catch (error) {
    displayMessage(`Error al cargar plantillas: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

function renderTemplatesList(templates) {
  const container = document.getElementById('plantillas-list-container');
  if (!container) return;
  if (templates.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>No hay plantillas creadas.</p></div>`;
    return;
  }
  container.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Nombre</th><th>Tipo</th><th>Acciones</th></tr></thead>
      <tbody>
        ${templates.map(template => `
          <tr data-id="${template.id}">
            <td>${template.templateName}</td>
            <td>${template.documentType}</td>
            <td class="actions-cell">
              <button class="icon-button preview-template-btn" title="Previsualizar">
                <i data-feather="eye"></i>
              </button>
              <button class="icon-button button-edit" title="Editar"><i data-feather="edit-2"></i></button>
              <button class="icon-button button-duplicate" title="Duplicar"><i data-feather="copy"></i></button>
              <button class="icon-button button-delete" title="Eliminar"><i data-feather="trash-2"></i></button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
  if(window.feather) feather.replace();
}

// --- MANEJADORES DE ACCIONES DE LA TABLA (SIN CAMBIOS) ---
async function handleDeleteTemplateClick(templateId) {
    if (confirm('¿Seguro que quieres eliminar esta plantilla?')) {
        showLoading('Eliminando...');
        try {
            await deleteDocumentTemplate(templateId);
            await loadAndRenderTemplates();
        } catch (error) {
            displayMessage(`Error: ${error.message}`, 'error');
        } finally {
            hideLoading();
        }
    }
}

async function handleDuplicateTemplateClick(templateId) {
    showLoading('Duplicando...');
    try {
        await duplicateDocumentTemplate(templateId);
        await loadAndRenderTemplates();
    } catch (error) {
        displayMessage(`Error al duplicar: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}