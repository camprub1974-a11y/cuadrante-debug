// js/ui/requestPermissionModal.js

import { showLoading, hideLoading, displayMessage } from './viewManager.js';
import { currentUser, availableAgents } from '../state.js';
import {
  getPermissionTypes,
  addSolicitud,
  uploadFile,
  updateNotificationCount,
} from '../dataController.js'; // Añadido updateNotificationCount

let requestPermissionModal = null;
let permissionRequestForm = null;
let requestAgentSelect = null;
let requestTypeSelect = null;
let closeButton = null; // Se obtiene en initializeRequestPermissionModal
let requestStartDateInput = null;
let requestEndDateInput = null;
let requestCommentsInput = null;
let requestAttachmentInput = null;

let permissionTypes = [];
let uploadedFileUrl = null;

// Esta función solo inicializa el modal principal
export function initializeRequestPermissionModal() {
  console.log('[DEBUG - RequestPermissionModal] initializeRequestPermissionModal llamado.');
  requestPermissionModal = document.getElementById('request-permission-modal');
  if (!requestPermissionModal) {
    console.error(
      'ERROR - RequestPermissionModal: Modal #request-permission-modal no encontrado. ABORTANDO INICIALIZACIÓN.'
    );
    return;
  }
  // Asegurarse de que el closeButton se obtiene correctamente usando la clase
  closeButton = requestPermissionModal.querySelector('.close-button');
  if (closeButton) {
    closeButton.addEventListener('click', hideRequestPermissionModal);
  } else {
    console.warn(
      'WARN - RequestPermissionModal: Botón de cierre (.close-button) no encontrado en el modal principal.'
    );
  }
  console.log(
    '[DEBUG - RequestPermissionModal] Modal principal de solicitud de permiso inicializado.'
  );
}

// Inicialización de elementos internos y listeners (se llama la primera vez que se abre el modal)
async function _initializeInternalDOMElements() {
  if (permissionRequestForm) {
    // Si ya se inicializaron
    console.log('[DEBUG - RequestPermissionModal] Elementos internos ya inicializados.');
    return true;
  }

  console.log(
    '[DEBUG - RequestPermissionModal] Inicializando elementos internos del modal por primera vez...'
  );
  permissionRequestForm = requestPermissionModal.querySelector('#permission-request-form');
  requestAgentSelect = requestPermissionModal.querySelector('#request-agent-select');
  requestTypeSelect = requestPermissionModal.querySelector('#request-type-select');
  requestStartDateInput = requestPermissionModal.querySelector('#request-start-date');
  requestEndDateInput = requestPermissionModal.querySelector('#request-end-date');
  requestCommentsInput = requestPermissionModal.querySelector('#request-comments');
  requestAttachmentInput = requestPermissionModal.querySelector('#request-attachment');

  // === NUEVOS LOGS DE DEPURACIÓN ESPECÍFICOS ===
  console.log('Elementos RequestPermissionModal - Estado de obtención (después de querySelector):');
  console.log('  permissionRequestForm:', !!permissionRequestForm, permissionRequestForm);
  console.log('  requestAgentSelect:', !!requestAgentSelect, requestAgentSelect);
  console.log('  requestTypeSelect:', !!requestTypeSelect, requestTypeSelect);
  console.log('  requestStartDateInput:', !!requestStartDateInput, requestStartDateInput);
  console.log('  requestEndDateInput:', !!requestEndDateInput, requestEndDateInput);
  console.log('  requestCommentsInput:', !!requestCommentsInput, requestCommentsInput);
  console.log('  requestAttachmentInput:', !!requestAttachmentInput, requestAttachmentInput);
  // === FIN NUEVOS LOGS ===

  if (
    !permissionRequestForm ||
    !requestAgentSelect ||
    !requestTypeSelect ||
    !requestStartDateInput ||
    !requestEndDateInput ||
    !requestCommentsInput ||
    !requestAttachmentInput
  ) {
    console.error(
      'ERROR - RequestPermissionModal: Fallo al encontrar elementos DOM internos cruciales. Verifique IDs en index.html.'
    );
    const missing = [];
    if (!permissionRequestForm) missing.push('permissionRequestForm');
    if (!requestAgentSelect) missing.push('requestAgentSelect');
    if (!requestTypeSelect) missing.push('requestTypeSelect');
    if (!requestStartDateInput) missing.push('requestStartDateInput');
    if (!requestEndDateInput) missing.push('requestEndDateInput');
    if (!requestCommentsInput) missing.push('requestCommentsInput');
    if (!requestAttachmentInput) missing.push('requestAttachmentInput');
    console.error('Elementos faltantes:', missing.join(', '));
    displayMessage('Error: No se pudo cargar el formulario de solicitud. Recargue.', 'error');
    return false;
  }

  // Adjuntar listeners (solo una vez)
  if (permissionRequestForm) permissionRequestForm.addEventListener('submit', handleSubmitRequest);

  await loadPermissionTypesAndPopulateSelect(); // Carga y puebla los tipos de permiso
  console.log(
    '[DEBUG - RequestPermissionModal] Elementos internos y listeners inicializados completamente.'
  );
  return true;
}

async function loadPermissionTypesAndPopulateSelect() {
  if (!requestTypeSelect) return;
  console.log('[DEBUG - RequestPermissionModal] Cargando tipos de permiso para selector.');
  try {
    permissionTypes = await getPermissionTypes();
    let optionsHtml = '<option value="">-- Selecciona un tipo --</option>';
    if (permissionTypes && permissionTypes.length > 0) {
      permissionTypes.forEach((type) => {
        optionsHtml += `<option value="${type.id}">${type.name}</option>`;
      });
    }
    requestTypeSelect.innerHTML = optionsHtml;
    console.log('[DEBUG - RequestPermissionModal] Selector de tipo de permiso poblado.');
  } catch (error) {
    displayMessage('Error al cargar tipos de permiso.', 'error');
    console.error('ERROR - RequestPermissionModal: Error al cargar tipos de permiso:', error);
  }
}

export function showRequestPermissionModal() {
  console.log('[DEBUG - RequestPermissionModal] showRequestPermissionModal llamado.');
  if (!requestPermissionModal) {
    console.error(
      '[ERROR - RequestPermissionModal] Modal de solicitud de permiso no inicializado. No se puede mostrar.'
    );
    return;
  }
  const initialized = _initializeInternalDOMElements();
  if (!initialized) {
    console.error(
      '[ERROR - RequestPermissionModal] Falló la inicialización de elementos internos. No se muestra el modal.'
    );
    return;
  }

  if (permissionRequestForm) permissionRequestForm.reset();
  uploadedFileUrl = null;
  populateAgentSelectForRequest();
  requestPermissionModal.classList.remove('hidden');
  requestPermissionModal.style.display = 'flex';
  console.log(
    '[DEBUG - RequestPermissionModal] Modal de solicitud de permiso visible. (display: flex)'
  );
}

export function hideRequestPermissionModal() {
  console.log('[DEBUG - RequestPermissionModal] hideRequestPermissionModal llamado.');
  if (requestPermissionModal) {
    requestPermissionModal.classList.add('hidden');
    requestPermissionModal.style.display = 'none';
    console.log(
      '[DEBUG - RequestPermissionModal] Modal de solicitud de permiso oculto. (display: none)'
    );
  }
}

function populateAgentSelectForRequest() {
  if (!requestAgentSelect) {
    console.warn('[DEBUG - RequestPermissionModal] requestAgentSelect no encontrado al poblar.');
    return;
  }
  const user = currentUser.get();
  const agents = availableAgents.get();
  let optionsHtml = '';

  if (!user || !agents || agents.length === 0) {
    console.warn(
      '[DEBUG - RequestPermissionModal] No hay usuario o agentes disponibles para poblar el selector de solicitud.'
    );
    requestAgentSelect.innerHTML = '<option value="">No hay agentes</option>';
    requestAgentSelect.disabled = true;
    return;
  }

  if (user.role === 'admin') {
    agents.forEach(
      (agent) => (optionsHtml += `<option value="${agent.id}">${agent.name}</option>`)
    );
    requestAgentSelect.disabled = false;
    console.log(
      '[DEBUG - RequestPermissionModal] Selector de agente para solicitud poblado (Admin).'
    );
  } else {
    // Rol 'guard'
    const userAgent = agents.find((a) => String(a.id) === String(user.agentId));
    if (userAgent) {
      optionsHtml = `<option value="${userAgent.id}">${userAgent.name}</option>`;
    } else {
      optionsHtml = `<option value="">Tu agente no encontrado</option>`;
      console.warn(
        '[DEBUG - RequestPermissionModal] Agente del guardia no encontrado al poblar selector de solicitud.'
      );
    }
    requestAgentSelect.disabled = true;
    console.log(
      '[DEBUG - RequestPermissionModal] Selector de agente para solicitud poblado (Guardia).'
    );
  }
  requestAgentSelect.innerHTML = optionsHtml;
}

async function handleSubmitRequest(event) {
  event.preventDefault();
  console.log('[DEBUG - RequestPermissionModal] handleSubmitRequest llamado.');

  // Asegurarse de que los inputs existan antes de acceder a sus valores
  if (
    !requestAgentSelect ||
    !requestTypeSelect ||
    !requestStartDateInput ||
    !requestEndDateInput ||
    !requestCommentsInput ||
    !requestAttachmentInput
  ) {
    console.error('ERROR - RequestPermissionModal: Algunos inputs del formulario no encontrados.');
    displayMessage(
      'Error interno: Algunos campos del formulario no están listos. Recargue.',
      'error'
    );
    return;
  }

  const requestData = {
    agentId: String(requestAgentSelect.value),
    typeId: requestTypeSelect.value,
    startDate: requestStartDateInput.value,
    endDate: requestEndDateInput.value,
    commentsAgent: requestCommentsInput.value,
    attachments: uploadedFileUrl
      ? [{ url: uploadedFileUrl, name: requestAttachmentInput.files[0]?.name || 'adjunto' }]
      : [],
  };

  if (
    !requestData.agentId ||
    !requestData.typeId ||
    !requestData.startDate ||
    !requestData.endDate
  ) {
    displayMessage('Por favor, completa todos los campos obligatorios.', 'warning');
    console.warn('[DEBUG - RequestPermissionModal] Campos obligatorios faltantes en la solicitud.');
    return;
  }

  showLoading();
  try {
    console.log('[DEBUG - RequestPermissionModal] Intentando enviar solicitud:', requestData);
    const file = requestAttachmentInput.files[0];
    if (file) {
      const user = currentUser.get();
      const filePath = `solicitudes_adjuntos/${user.uid}/${Date.now()}_${file.name}`;
      console.log('[DEBUG - RequestPermissionModal] Subiendo archivo adjunto:', filePath);
      uploadedFileUrl = await uploadFile(file, filePath);
      requestData.attachments = [{ url: uploadedFileUrl, name: file.name }];
      console.log('[DEBUG - RequestPermissionModal] Archivo subido. URL:', uploadedFileUrl);
    }

    await addSolicitud(requestData);
    displayMessage('Solicitud de permiso enviada con éxito.', 'success');
    console.log('[DEBUG - RequestPermissionModal] Solicitud de permiso enviada con éxito.');
    hideRequestPermissionModal();
    await updateNotificationCount(); // Actualizar notificaciones
  } catch (error) {
    console.error('ERROR - RequestPermissionModal: Error al enviar solicitud:', error);
    displayMessage(`Error al enviar la solicitud: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}
