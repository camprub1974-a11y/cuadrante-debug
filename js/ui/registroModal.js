import { displayMessage, showLoading, hideLoading } from './viewManager.js';
import Handlebars from 'handlebars';
import {
  createRegistro,
  updateRegistro,
  markRegistroAsDeleted,
  getTemplatesByType,
  uploadRecordImage,
} from '../dataController.js';
import { availableAgents, currentUser } from '../state.js';
import { resizeImage } from '../utils.js';

// --- VARIABLES GLOBALES DEL MÓDULO ---
let modalClone;
let modalTemplate;
let onSaveSuccessCallback = null;
let recordData = null;
let currentTemplate = null;
let templatesCache = [];
let editingRecordId = null;
let currentStep = 1;
let totalSteps = 0;
let fieldOrderGroups = [];
let allFields = [];

// --- ESTILOS CSS (Se mantienen para el wizard) ---
const wizardStyles = `
  #wizard-progress { display: flex; flex-wrap: wrap; gap: 5px; justify-content: center; margin-bottom: 25px; padding-bottom: 15px; border-bottom: 1px solid #e0e0e0; }
  .step-indicator { padding: 6px 12px; border: 1px solid #ccc; border-radius: 20px; color: #888; background-color: #f9f9f9; font-size: 0.85em; cursor: default; transition: all 0.3s ease; }
  .step-indicator.active { border-color: #007bff; background-color: #007bff; color: white; font-weight: bold; }
  .step-indicator.completed { border-color: #28a745; background-color: #28a745; color: white; }
  #wizard-navigation { margin-top: 25px; padding-top: 15px; border-top: 1px solid #e0e0e0; display: flex; justify-content: space-between; }
  .form-group.required .form-label::after { content: " *"; color: #dc3545; font-weight: bold; margin-left: 4px; }
  .form-group input.is-invalid, .form-group textarea.is-invalid, .form-group select.is-invalid { border-color: #dc3545 !important; box-shadow: 0 0 0 1px #dc3545; }
  .repeater-item { border: 1px solid #e0e0e0; border-radius: 8px; padding: 15px; margin-bottom: 15px; background-color: #fdfdfd; }
  .repeater-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #e0e0e0; }
  .repeater-item-header h4 { margin: 0; font-size: 1em; }
  .modal-overlay .modal-content { max-width: 95vw; width: 1800px; }
`;
const styleElementId = 'wizard-modal-styles';

// --- FUNCIONES AUXILIARES ---
function injectWizardStyles() {
  if (!document.getElementById(styleElementId)) {
    const styleEl = document.createElement('style');
    styleEl.id = styleElementId;
    styleEl.innerHTML = wizardStyles;
    document.head.appendChild(styleEl);
  }
}

function removeWizardStyles() {
  const styleEl = document.getElementById(styleElementId);
  if (styleEl) styleEl.remove();
}

function unescapeHtml(safe) {
  if (!safe) return '';
  return safe.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/'/g, "'");
}

function closeAndDestroyModal() {
  removeWizardStyles();
  if (modalClone) {
    modalClone.classList.add('hidden');
    setTimeout(() => modalClone.remove(), 300);
  }
}

function getFormDefinition(template) {
    if (!template) return [];
    if (template.fields && Array.isArray(template.fields) && template.fields.length > 0) return template.fields;
    if (template.schema) {
        const fieldsArray = [];
        const fieldKeys = (template.fieldOrder && Array.isArray(template.fieldOrder)) ? template.fieldOrder.flatMap(group => group.fields || []) : Object.keys(template.schema);
        for (const fieldId of fieldKeys) {
            if (template.schema[fieldId]) fieldsArray.push({ id: fieldId, ...template.schema[fieldId] });
        }
        return fieldsArray;
    }
    return [];
}


// --- INICIALIZACIÓN DEL MÓDULO ---
export function initializeRegistroModal() {
    modalTemplate = document.getElementById('template-registro-modal');
    if (!modalTemplate) {
        console.error('Error Crítico: El <template> con id "template-registro-modal" no fue encontrado en index.html.');
    }
}

// --- FUNCIÓN PRINCIPAL DE APERTURA DE MODAL (UNIFICADA) ---
// REEMPLAZA ESTA FUNCIÓN COMPLETA
export function openRegistroModal(options = {}) {
  const { direction = 'salida', callback, dataForEdit = null } = options;
  onSaveSuccessCallback = callback;
  recordData = dataForEdit;

  if (!modalTemplate) {
    console.error('El template del modal no está inicializado.');
    return;
  }
  
  modalClone = modalTemplate.content.cloneNode(true).firstElementChild;
  document.body.appendChild(modalClone);
  injectWizardStyles();

  // Obtención de elementos del DOM
  const modalTitle = modalClone.querySelector('#registro-modal-title');
  const deleteBtn = modalClone.querySelector('#delete-registro-btn');
  const typeSelect = modalClone.querySelector('#registro-type-select');
  const dynamicFormContainer = modalClone.querySelector('#registro-dynamic-form-container');
  const previewContainer = modalClone.querySelector('#registro-preview-container');
  
  // --- INICIO DE LA CORRECCIÓN ---
  // Nos aseguramos de que el campo oculto directionInput exista y tenga valor
  const directionInput = modalClone.querySelector('#registro-direction');
  const finalDirection = dataForEdit ? (dataForEdit.direction || 'salida') : direction;
  if(directionInput) {
    directionInput.value = finalDirection; // ✅ LÍNEA CLAVE
  }
  // --- FIN DE LA CORRECCIÓN ---

  // Lógica de visualización (se mantiene igual)
  if (finalDirection === 'entrada') {
    // ... tu lógica para 'entrada' ...
  } else { // 'salida'
    modalTitle.textContent = 'Crear Documento de Salida';
    // ✅ CORRECCIÓN: Generamos aquí el primer paso del formulario de salida
    dynamicFormContainer.innerHTML = `
      <div class="form-group">
        <label class="form-label" for="registro-type-select">Tipo de Documento</label>
        <select id="registro-type-select" class="selector" required>
          <option value="">-- Selecciona un tipo --</option>
          <option value="informe">Informe</option>
          <option value="acta">Acta</option>
          <option value="atestado">Atestado</option>
          <option value="oficio">Oficio</option>
          <option value="estadillo">Estadillo</option>
        </select>
      </div>`;
  }

  // Reseteo del estado del wizard
  currentTemplate = null;
  templatesCache = [];
  currentStep = 1;
  totalSteps = 0;
  fieldOrderGroups = [];
  allFields = [];
  
  // Llamamos a setupEventListeners DESPUÉS de haber modificado el DOM
  setupEventListeners(); 

  if (dataForEdit) {
    // ... tu lógica para editar ...
  } else {
    editingRecordId = null;
    if (deleteBtn) deleteBtn.classList.add('hidden');
  }

  setTimeout(() => {
    modalClone.classList.remove('hidden');
    if (window.feather) feather.replace();
  }, 10);
}

// --- SETUP DE EVENTOS ---
// 1. REEMPLAZA ESTA FUNCIÓN
function setupEventListeners() {
    const form = modalClone.querySelector('#registro-form');
    const dynamicFormContainer = modalClone.querySelector('#registro-dynamic-form-container');
    const typeSelect = modalClone.querySelector('#registro-type-select');
    const closeButtons = modalClone.querySelectorAll('.close-button');
    const deleteBtn = modalClone.querySelector('#delete-registro-btn');
    
    if (!form || form.dataset.listenerAttached === 'true') return;

    form.addEventListener('submit', handleFormSubmit);
    
    // --- LISTENER MODIFICADO CON DEPURACIÓN ---
    typeSelect.addEventListener('change', () => {
            handleTypeChange(null);
    });
    
    closeButtons.forEach(btn => btn.addEventListener('click', closeAndDestroyModal));
    
    if (deleteBtn && currentUser.get()?.role === 'admin') {
        deleteBtn.addEventListener('click', handleDelete);
    }
    
    dynamicFormContainer.addEventListener('click', (event) => {
        const uploadButton = event.target.closest('.upload-image-btn');
        const addButton = event.target.closest('.add-repeater-item-btn');
        const deleteButton = event.target.closest('.delete-repeater-item-btn');

        if (uploadButton) handleImageUpload(uploadButton);
        if (addButton) addRepeaterItem(addButton.dataset.repeaterId);
        if (deleteButton) {
            const itemToDelete = deleteButton.closest('.repeater-item');
            if (itemToDelete) itemToDelete.remove();
        }
    });

    dynamicFormContainer.addEventListener('input', updatePreview);
    form.dataset.listenerAttached = 'true';
}


// --- MANEJO DE LÓGICA INTERNA DEL MODAL ---
// 2. REEMPLAZA TAMBIÉN ESTA FUNCIÓN
async function handleTypeChange(dataForEdit = null) {
  console.log("2. Ejecutando handleTypeChange..."); // CHIVATO 2
  
  const typeSelect = modalClone.querySelector('#registro-type-select');
  const dynamicFormContainer = modalClone.querySelector('#registro-dynamic-form-container');
  const documentType = typeSelect.value;
  
  console.log(`3. Tipo de documento seleccionado: '${documentType}'`); // CHIVATO 3

  dynamicFormContainer.innerHTML = '';
  currentTemplate = null;
  updatePreview();
  if (!documentType) {
    console.log("   -> No hay tipo seleccionado. Proceso detenido.");
    return;
  }

  showLoading('Cargando plantillas...');
  try {
    const templates = await getTemplatesByType(documentType);
    templatesCache = templates;
    console.log("4. Plantillas encontradas para este tipo:", templates); // CHIVATO 4
    
    if (templates.length > 0) {
      console.log("   -> Se encontraron plantillas. Intentando mostrar el selector."); // CHIVATO 5
      let opts = '<option value="">-- Elige una plantilla --</option>' + templates.map((t) => `<option value="${t.id}">${t.templateName}</option>`).join('');
      dynamicFormContainer.innerHTML = `<div class="form-group"><label class="form-label" for="template-select">Usar Plantilla</label><select id="template-select" class="selector">${opts}</select></div><div id="template-fields-container"></div>`;
      
      const templateSelect = dynamicFormContainer.querySelector('#template-select');
      templateSelect.addEventListener('change', () => {
        currentTemplate = templatesCache.find((t) => t.id === templateSelect.value) || null;
        renderFormFromSchema(null);
      });

      if (dataForEdit?.templateUsed) {
        templateSelect.value = dataForEdit.templateUsed;
        currentTemplate = templatesCache.find((t) => t.id === dataForGredit.templateUsed);
        if (currentTemplate) renderFormFromSchema(dataForEdit);
      }
    } else {
      dynamicFormContainer.innerHTML = '<p class="info-message">No hay plantillas disponibles para este tipo de documento.</p>';
    }
  } catch (error) {
    console.error("ERROR en handleTypeChange:", error); // CHIVATO DE ERRORES
    displayMessage('Error al cargar las plantillas.', 'error');
  } finally {
    hideLoading();
  }
}

function renderFormFromSchema(dataForEdit = null) {
  const container = modalClone.querySelector('#template-fields-container');
  if (!container || !currentTemplate) {
    if (container) container.innerHTML = '';
    updatePreview();
    return;
  }

  // Obtenemos los grupos de campos para el wizard
  fieldOrderGroups = currentTemplate.fieldOrder || [];
  totalSteps = fieldOrderGroups.length;
  currentStep = 1;
  allFields = getFormDefinition(currentTemplate);
  const details = dataForEdit ? dataForEdit.details : {};

  // --- Lógica para generar el HTML del Asistente (Wizard) ---

  // 1. Indicadores de progreso (los círculos de pasos)
  let progressHtml = fieldOrderGroups.map((group, index) => 
    `<div class="step-indicator ${index === 0 ? 'active' : ''}" data-step="${index + 1}">${group.groupName}</div>`
  ).join('');

  // 2. Contenido de cada paso (los campos del formulario)
  let stepsHtml = fieldOrderGroups.map((group, index) => {
    let stepFieldsHtml = (group.fields || []).map(fieldId => {
      const field = allFields.find(f => f.id === fieldId);
      if (!field) return '';
      
      const key = field.id;
      const value = details[key] !== undefined ? details[key] : (field.default !== undefined ? field.default : '');
      const required = field.optional === false;
      let fieldHtml = '';
      
      // Aquí va tu lógica SWITCH completa para cada tipo de campo (checkbox, image, repeater, etc.)
      // Esta parte es la que ya tenías y funcionaba bien.
        if (field.type === 'checkbox') {
            fieldHtml = `<div class="form-group-checkbox ${required ? 'required' : ''}"><input type="checkbox" id="field-${key}" data-key="${key}" ${value ? 'checked' : ''}><label class="form-label" for="field-${key}">${field.label}</label></div>`;
        } else if (field.type === 'image') {
            fieldHtml = `<div class="form-group ${required ? 'required' : ''}"><label class="form-label">${field.label}</label><div class="image-upload-container"><img id="preview-${key}" src="${value || 'assets/placeholder-image.png'}" alt="Vista previa" class="image-preview"><input type="hidden" id="field-${key}" data-key="${key}" value="${value || ''}"><button type="button" class="button button-secondary upload-image-btn" data-target-key="${key}"><i data-feather="upload"></i><span>Subir Imagen</span></button></div></div>`;
        } else if (field.type === 'repeater') {
            fieldHtml = `<div class="form-group repeater-group ${required ? 'required' : ''}" id="repeater-${key}" data-field-id="${key}"><label class="form-label">${field.label}</label><div class="repeater-items-container"></div><button type="button" class="button button-secondary add-repeater-item-btn" data-repeater-id="${key}" data-item-label="${field.itemLabel || 'Elemento'}"><i data-feather="plus"></i><span>Añadir ${field.itemLabel || 'Elemento'}</span></button></div>`;
        } else {
            fieldHtml = `<div class="form-group ${required ? 'required' : ''}"><label class="form-label" for="field-${key}">${field.label}</label>`;
            switch (field.type) {
                case 'textarea': fieldHtml += `<textarea id="field-${key}" data-key="${key}" rows="4" ${required ? 'required' : ''}>${value || ''}</textarea>`; break;
                case 'select':
                    fieldHtml += `<select id="field-${key}" class="selector" data-key="${key}" ${required ? 'required' : ''}><option value="">-- Selecciona --</option>`;
                    (field.options || []).forEach(opt => { fieldHtml += `<option value="${opt}" ${opt === value ? 'selected' : ''}>${opt}</option>`; });
                    fieldHtml += `</select>`; break;
                case 'multiselect':
                    const agents = availableAgents.get();
                    const agentOptions = agents.map(agent => `<option value="${agent.id}">${agent.name}</option>`).join('');
                    fieldHtml += `<select id="field-${key}" data-key="${key}" class="selector" multiple ${required ? 'required' : ''}>${agentOptions}</select><small>Mantén pulsada la tecla Ctrl (o Cmd en Mac) para seleccionar varios agentes.</small>`; break;
                default: fieldHtml += `<input type="${field.type || 'text'}" id="field-${key}" data-key="${key}" value="${value || ''}" ${required ? 'required' : ''}>`; break;
            }
            fieldHtml += `</div>`;
        }
      return fieldHtml;
    }).join('');

    return `<div class="form-step" id="step-${index + 1}" data-step="${index + 1}" style="display: ${index === 0 ? 'block' : 'none'};">${stepFieldsHtml}</div>`;
  }).join('');
  
  // 3. Botones de navegación (Anterior, Siguiente, Guardar)
  let navHtml = `<div id="wizard-navigation"><button type="button" id="prev-step-btn" class="button button-secondary" style="display: none;">Anterior</button><div><button type="button" id="next-step-btn" class="button button-primary">Siguiente</button><button type="submit" id="save-registro-btn" class="button button-primary" style="display: none;">Guardar Registro</button></div></div>`;

  // 4. Unimos todo y lo inyectamos en el contenedor
  container.innerHTML = `<div id="wizard-progress">${progressHtml}</div><div id="wizard-steps">${stepsHtml}</div>${navHtml}`;

  // Rellenamos los datos si estamos en modo edición (esta lógica es la original)
  const repeaterField = allFields.find(f => f.type === 'repeater');
  if (repeaterField && dataForEdit && details[repeaterField.id]) {
    details[repeaterField.id].forEach(itemData => {
      addRepeaterItem(repeaterField.id, itemData);
    });
  }

  // Conectamos los eventos a los nuevos botones de navegación
  modalClone.querySelector('#next-step-btn').addEventListener('click', handleNextStep);
  modalClone.querySelector('#prev-step-btn').addEventListener('click', handlePrevStep);

  updatePreview();
  if(window.feather) feather.replace();
}

function goToStep(stepNumber) {
  validateStep(currentStep);
  modalClone.querySelector(`.form-step[data-step="${currentStep}"]`).style.display = 'none';
  modalClone.querySelector(`.step-indicator[data-step="${currentStep}"]`).classList.remove('active');
  if (stepNumber > currentStep)
    modalClone.querySelector(`.step-indicator[data-step="${currentStep}"]`).classList.add('completed');
  currentStep = stepNumber;
  modalClone.querySelector(`.form-step[data-step="${currentStep}"]`).style.display = 'block';
  const currentIndicator = modalClone.querySelector(`.step-indicator[data-step="${currentStep}"]`);
  currentIndicator.classList.add('active');
  currentIndicator.classList.remove('completed');
  modalClone.querySelector('#prev-step-btn').style.display = currentStep > 1 ? 'inline-block' : 'none';
  modalClone.querySelector('#next-step-btn').style.display = currentStep < totalSteps ? 'inline-block' : 'none';
  modalClone.querySelector('#save-registro-btn').style.display = currentStep === totalSteps ? 'inline-block' : 'none';
}

function handleNextStep() {
  if (!validateStep(currentStep)) {
    displayMessage('Por favor, completa todos los campos obligatorios (*).', 'error');
    return;
  }
  if (currentStep < totalSteps) goToStep(currentStep + 1);
}

function handlePrevStep() {
  if (currentStep > 1) goToStep(currentStep - 1);
}

function validateStep(stepNumber) {
  const stepContainer = modalClone.querySelector(`#step-${stepNumber}`);
  if (!stepContainer) return true;
  const requiredFields = stepContainer.querySelectorAll('[required]');
  let isStepValid = true;
  requiredFields.forEach(field => {
    const parentGroup = field.closest('.form-group, .form-group-checkbox');
    if (!field.value.trim()) {
      isStepValid = false;
      field.classList.add('is-invalid');
      if (parentGroup) parentGroup.classList.add('is-invalid');
    } else {
      field.classList.remove('is-invalid');
      if (parentGroup) parentGroup.classList.remove('is-invalid');
    }
  });
  return isStepValid;
}

function addRepeaterItem(repeaterId, data = {}) {
  const repeaterGroup = allFields.find(f => f.id === repeaterId);
  if (!repeaterGroup) return;

  const container = modalClone.querySelector(`#repeater-${repeaterId} .repeater-items-container`);
  const itemIndex = container.children.length;
  const itemDiv = document.createElement('div');
  itemDiv.className = 'repeater-item';
  itemDiv.dataset.index = itemIndex;

  let itemHtml = `<div class="repeater-item-header"><h4>${repeaterGroup.itemLabel || 'Elemento'} #${itemIndex + 1}</h4><button type="button" class="icon-button delete-repeater-item-btn"><i data-feather="trash-2"></i></button></div>`;

  (repeaterGroup.itemFields || []).forEach(field => {
    const key = field.id;
    const value = data[key] !== undefined ? data[key] : (field.default !== undefined ? field.default : '');
    const required = field.optional === false;

    if (field.type === 'image') {
      const uniqueIdPrefix = `${repeaterId}-${itemIndex}-${key}`;
      itemHtml += `
        <div class="form-group ${required ? 'required' : ''}">
          <label class="form-label">${field.label}</label>
          <div class="image-upload-container">
            <img id="preview-${uniqueIdPrefix}" src="${value || 'assets/placeholder-image.png'}" alt="Vista previa" class="image-preview">
            <input type="hidden" id="field-${uniqueIdPrefix}" data-key="${key}" value="${value || ''}">
            <button type="button" class="button button-secondary upload-image-btn" data-target-prefix="${uniqueIdPrefix}" data-key="${key}">
              <i data-feather="upload"></i><span>Subir Imagen</span>
            </button>
          </div>
        </div>`;
    } else {
      itemHtml += `<div class="form-group ${required ? 'required' : ''}">
        <label class="form-label">${field.label}</label>
        <input type="${field.type || 'text'}" data-key="${key}" value="${value || ''}" ${required ? 'required' : ''}>
      </div>`;
    }
  });

  itemDiv.innerHTML = itemHtml;
  container.appendChild(itemDiv);
  if (window.feather) feather.replace();
}

function normalizeAgente(agente) {
  return {
    ...agente,
    normal_check: Boolean(agente.normal_check),
    nocturna_check: Boolean(agente.nocturna_check),
    festiva_check: Boolean(agente.festiva_check),
    festiva_noct_check: Boolean(agente.festiva_noct_check),
    normal_horas: agente.normal_horas ? String(Number(agente.normal_horas) || 0) : "0",
    nocturna_horas: agente.nocturna_horas ? String(Number(agente.nocturna_horas) || 0) : "0",
    festiva_horas: agente.festiva_horas ? String(Number(agente.festiva_horas) || 0) : "0",
    festiva_noct_horas: agente.festiva_noct_horas ? String(Number(agente.festiva_noct_horas) || 0) : "0",
    total_horas: agente.total_horas ? String(Number(agente.total_horas) || 0) : "0",
    tramos_html: agente.tramos
      ? `<ul style="margin:0; padding-left: 15px;">${agente.tramos.split('\n').map(s => `<li>${s.trim()}</li>`).join('')}</ul>`
      : ''
  };
}

function collectAndSanitizeData(sanitizeForSave = true) {
    const details = {};
    for (const field of allFields) {
        if (field.type === 'repeater') {
            const repeaterItems = [];
            const itemNodes = modalClone.querySelectorAll(`#repeater-${field.id} .repeater-item`);
            const repeaterDef = allFields.find(f => f.id === field.id);

            itemNodes.forEach(itemNode => {
                const itemData = {};
                if (repeaterDef && repeaterDef.itemFields) {
                    repeaterDef.itemFields.forEach(subField => {
                        const key = subField.id;
                        const element = itemNode.querySelector(`[data-key="${key}"]`);
                        
                        if (element) {
                            if (subField.type === 'checkbox') {
                                itemData[key] = element.checked;
                            } else if (subField.type === 'number') {
                                itemData[key] = sanitizeForSave ? (parseFloat(element.value) || 0) : element.value;
                            } else {
                                itemData[key] = element.value;
                            }
                        } else {
                            itemData[key] = subField.type === 'checkbox' ? false : (subField.type === 'number' ? (sanitizeForSave ? 0 : '') : '');
                        }
                    });
                }
                repeaterItems.push(itemData);
            });
            details[field.id] = repeaterItems;
        } else {
            const element = modalClone.querySelector(`#field-${field.id}`);
            if (element) {
                if (field.type === 'checkbox') {
                    details[field.id] = element.checked;
                } else if (field.type === 'number') {
                    details[field.id] = sanitizeForSave ? (parseFloat(element.value) || 0) : element.value;
                } else if (field.type === 'multiselect') {
                    details[field.id] = Array.from(element.selectedOptions).map(opt => opt.value);
                } else {
                    details[field.id] = element.value.trim();
                }
            } else {
                if (field.type === 'checkbox') {
                    details[field.id] = false;
                } else if (field.type === 'number') {
                    details[field.id] = sanitizeForSave ? 0 : '';
                } else if (field.type === 'multiselect') {
                    details[field.id] = [];
                } else {
                    details[field.id] = '';
                }
            }
        }
    }
    return details;
}

function updatePreview() {
    const previewContainer = modalClone.querySelector('#registro-preview-container iframe');
    if (!previewContainer) return;

    const previewDocument = previewContainer.contentDocument || previewContainer.contentWindow.document;
    if (!currentTemplate || !currentTemplate.content) {
        previewDocument.open();
        previewDocument.write('<html><head></head><body></body></html>');
        previewDocument.close();
        return;
    }

    let fullHtml = unescapeHtml(currentTemplate.content);
    const styleMatch = fullHtml.match(/<style>([\s\S]*?)<\/style>/i);
    const bodyMatch = fullHtml.match(/<body>([\s\S]*?)<\/body>/i);
    let templateStyles = styleMatch ? styleMatch[1] : '';
    let templateBody = bodyMatch ? bodyMatch[1] : fullHtml;

    const details = collectAndSanitizeData(false);

    if (details.agentes) {
        details.agentes = details.agentes.map(normalizeAgente);
    }
    
    try {
        const compiledTemplate = Handlebars.compile(templateBody);
        const renderedHtml = compiledTemplate(details);

        const zoomStyle = `
          body { 
            transform: scale(0.8); 
            transform-origin: top left; 
            width: 125%;
          }
        `;

        previewDocument.open();
        previewDocument.write(`<!DOCTYPE html><html><head><title>Vista Previa</title><style>${templateStyles} ${zoomStyle}</style></head><body>${renderedHtml}</body></html>`);
        previewDocument.close();

    } catch (error) {
        console.error("Error al compilar la plantilla con Handlebars:", error);
        previewDocument.open();
        previewDocument.write(`Error en la plantilla: ${error.message}`);
        previewDocument.close();
    }
}

async function handleImageUpload(uploadButton) {
  const targetPrefix = uploadButton.dataset.targetPrefix;
  const key = uploadButton.dataset.key;

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;

    showLoading('Procesando imagen...');
    try {
      const resizedFile = await resizeImage(file, { width: 800, height: 600, quality: 0.8 });
      showLoading('Subiendo imagen...');
      const imageUrl = await uploadRecordImage(resizedFile);

      const previewEl = modalClone.querySelector(`#preview-${targetPrefix}`);
      const fieldEl = modalClone.querySelector(`#field-${targetPrefix}`);

      if (previewEl) previewEl.src = imageUrl;
      if (fieldEl) fieldEl.value = imageUrl;
      
      updatePreview();
    } catch (error) {
      displayMessage(`Error al subir la imagen: ${error.message}`, 'error');
    } finally {
      hideLoading();
    }
  };
  input.click();
}

async function handleFormSubmit(event) {
    event.preventDefault();
    const form = event.target;

    // Validar el último paso si es un formulario con asistente
    if (totalSteps > 0 && !validateStep(currentStep)) {
      displayMessage('Por favor, completa todos los campos obligatorios (*).', 'error');
      return;
    }

    showLoading('Guardando registro...');
    try {
        const data = {
            direction: form.querySelector('#registro-direction').value,
            documentType: form.querySelector('#registro-type-select').value,
            subject: form.querySelector('#registro-asunto').value,
            details: {
                remitente: form.querySelector('#registro-remitente')?.value || '',
                destinatario: form.querySelector('#registro-destinatario')?.value || '',
            }
        };

        if (currentTemplate && allFields.length > 0) {
            // Si hay una plantilla, combinamos los datos dinámicos
            const dynamicDetails = collectAndSanitizeData(true);
            data.details = { ...data.details, ...dynamicDetails };
            data.templateUsed = currentTemplate.id;
        }

        if (!data.documentType || !data.subject) {
            throw new Error('El Tipo de Documento y el Asunto son obligatorios.');
        }

        if (editingRecordId) {
            await updateRegistro(editingRecordId, data);
            displayMessage('Registro actualizado con éxito.', 'success');
        } else {
            await createRegistro(data);
            displayMessage('Registro guardado con éxito.', 'success');
        }
        
        closeAndDestroyModal();
        if (onSaveSuccessCallback) onSaveSuccessCallback();

    } catch (error) {
        displayMessage(`Error al guardar: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

async function handleDelete() {
  if (!editingRecordId) return;
  const reason = prompt('Introduce el motivo de la eliminación (obligatorio):');
  if (reason === null || reason.trim() === '') {
    displayMessage('La eliminación fue cancelada.', 'info');
    return;
  }
  if (confirm('¿Estás seguro de que quieres eliminar este registro? Esta acción lo marcará como eliminado.')) {
    showLoading('Eliminando registro...');
    try {
      await markRegistroAsDeleted(editingRecordId, reason.trim());
      displayMessage('Registro eliminado con éxito.', 'success');
      closeAndDestroyModal();
      if (onSaveSuccessCallback) onSaveSuccessCallback();
    } catch (error) {
      displayMessage(`Error al eliminar: ${error.message}`, 'error');
    } finally {
      hideLoading();
    }
  }
}