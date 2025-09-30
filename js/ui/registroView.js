import { displayMessage, showLoading, hideLoading } from './viewManager.js';
import { getRegistros, createRegistro, updateRegistro, getRegistroById, markRegistroAsDeleted } from '../dataController.js';
import { openRegistroModal } from './registroModal.js';
import { format } from 'date-fns';
import { currentUser } from '../state.js';

let isInitialized = false;
let currentSubview = 'entrada';

// --- FUNCIÓN PRINCIPAL DE RENDERIZADO ---
export function renderRegistroView(subview = 'entrada') {
  currentSubview = subview;
  if (!isInitialized) {
    setupEventListeners();
    populateFilters(); // Rellenamos los filtros de tipo una sola vez
    isInitialized = true;
  }
  updateViewForSubview();
  loadAndRenderRegistros();
}

export function resetRegistroView() {
  isInitialized = false;
}

// --- LÓGICA DE LA INTERFAZ (PESTAÑAS Y FORMULARIO) ---
function updateViewForSubview() {
  document.querySelectorAll('.sub-nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.subview === currentSubview);
  });

  const addEntradaBtn = document.getElementById('add-entrada-btn');
  const createSalidaBtn = document.getElementById('create-salida-btn');

  if (addEntradaBtn) addEntradaBtn.classList.toggle('hidden', currentSubview !== 'entrada');
  if (createSalidaBtn) createSalidaBtn.classList.toggle('hidden', currentSubview !== 'salida');
  
  closeEntradaForm();
}

function openEntradaForm(data = null) {
  const entradaFormContainer = document.getElementById('entrada-form-container');
  const entradaForm = document.getElementById('entrada-form');
  const entradaFormTitle = document.getElementById('entrada-form-title');
  const entradaIdInput = document.getElementById('entrada-id');
  
  if (!entradaFormContainer || !entradaForm) return;

  entradaForm.reset();
  if (data) {
    // --- Lógica de Edición ---
    entradaFormTitle.textContent = 'Editar Registro de Entrada';
    entradaIdInput.value = data.id;
    document.getElementById('entrada-numero-registro').value = data.registrationNumber || '';
    document.getElementById('entrada-fecha').value = data.fechaPresentacion ? format(data.fechaPresentacion.toDate(), 'yyyy-MM-dd') : '';
    document.getElementById('entrada-interesado').value = data.interesado || '';
    document.getElementById('entrada-tipo-documento').value = data.documentType || '';
    document.getElementById('entrada-estado').value = data.estado || 'pendiente';
    document.getElementById('entrada-asunto').value = data.subject || '';
    document.getElementById('entrada-referencia').value = data.referencia || '';
    document.getElementById('entrada-observaciones').value = data.observaciones || '';
  } else {
    // --- Lógica de Creación ---
    entradaFormTitle.textContent = 'Nuevo Registro de Entrada';
    entradaIdInput.value = '';
    document.getElementById('entrada-fecha').value = format(new Date(), 'yyyy-MM-dd');
  }
  entradaFormContainer.classList.remove('hidden');
}

function closeEntradaForm() {
  const entradaFormContainer = document.getElementById('entrada-form-container');
  if (entradaFormContainer) {
    entradaFormContainer.classList.add('hidden');
    const entradaForm = document.getElementById('entrada-form');
    if (entradaForm) entradaForm.reset();
  }
}

// --- GESTIÓN DE EVENTOS ---
function setupEventListeners() {
  const viewContent = document.getElementById('registro-view-content');
  if (!viewContent || viewContent.dataset.listenerAttached) return;

  viewContent.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;

    // Pestañas (Entrada / Salida)
    if (button.matches('.sub-nav-tab')) {
      currentSubview = button.dataset.subview;
      updateViewForSubview();
      loadAndRenderRegistros();
      return;
    }

    // Botones de acción principales y del formulario
    switch (button.id) {
      case 'add-entrada-btn': openEntradaForm(); break;
      case 'create-salida-btn': openRegistroModal({ direction: 'salida', callback: loadAndRenderRegistros }); break;
      case 'cancel-entrada-btn': closeEntradaForm(); break;
      case 'apply-registro-filters-btn': loadAndRenderRegistros(); break;
      case 'clear-registro-filters-btn': clearFiltersAndRender(); break;
    }
    
    // Acciones de la tabla
    const recordId = event.target.closest('tr')?.dataset.id;
    if (recordId) {
      if (button.classList.contains('button-edit')) handleRecordEdit(recordId);
      if (button.classList.contains('button-delete')) handleDeleteRecordClick(recordId);
      // Incluimos los botones de la versión anterior que faltaban
      if (button.classList.contains('btn-finalizar-salida')) finalizarConDocumento(recordId);
      if (button.classList.contains('btn-finalizar-sin-salida')) finalizarSinDocumento(recordId);
      if (button.classList.contains('btn-adjuntar')) adjuntarArchivo(recordId);
    }
  });

  const entradaForm = document.getElementById('entrada-form');
  if (entradaForm) entradaForm.addEventListener('submit', handleSaveEntrada);
  
  viewContent.dataset.listenerAttached = 'true';
}


// --- LÓGICA DE DATOS (FILTROS, GUARDADO, CARGA) ---

function populateFilters() {
  const typeFilterSelect = document.getElementById('registro-filter-type');
  if (!typeFilterSelect) return;
  const tiposDeEntrada = [
    { value: 'oficio_judicial', text: 'Oficio Judicial' },
    { value: 'req_administracion', text: 'Requerimiento Administración' },
    { value: 'sol_aseguradora', text: 'Solicitud Aseguradora' },
    { value: 'instancia_general', text: 'Instancia General' },
    { value: 'comunicacion_interna', text: 'Comunicación Interna' }
  ];
  typeFilterSelect.innerHTML = '<option value="">Todos los tipos</option>';
  tiposDeEntrada.forEach(tipo => {
    const option = document.createElement('option');
    option.value = tipo.value;
    option.textContent = tipo.text;
    typeFilterSelect.appendChild(option);
  });
}

function getCurrentFilters() {
  const filters = {}; // Creamos un objeto vacío

  const interesado = document.getElementById('registro-filter-interesado')?.value?.trim();
  const fecha = document.getElementById('registro-filter-date')?.value;
  const tipo = document.getElementById('registro-filter-type')?.value;

  // Solo añadimos una propiedad al objeto si tiene un valor real
  if (interesado) {
    filters.interesado = interesado;
  }
  if (fecha) {
    filters.fecha = fecha;
  }
  if (tipo) {
    filters.tipo = tipo;
  }

  return filters;
}

function clearFiltersAndRender() {
  document.getElementById('registro-filter-interesado').value = '';
  document.getElementById('registro-filter-date').value = '';
  document.getElementById('registro-filter-type').value = '';
  loadAndRenderRegistros();
}

async function handleSaveEntrada(event) {
  event.preventDefault();
  const tipo = document.getElementById('entrada-tipo-documento').value;
  if (!tipo) {
    displayMessage('Debes seleccionar un tipo de documento válido.', 'error');
    return;
  }
  
  showLoading('Guardando registro...');
  try {
    const agent = currentUser.get();
    const editingId = document.getElementById('entrada-id').value;
    
    const registroData = {
      fechaPresentacion: new Date(document.getElementById('entrada-fecha').value),
      interesado: document.getElementById('entrada-interesado').value.trim(),
      referencia: document.getElementById('entrada-referencia').value.trim(),
      estado: document.getElementById('entrada-estado').value,
      subject: document.getElementById('entrada-asunto').value.trim(),
      observaciones: document.getElementById('entrada-observaciones').value.trim(),
      direction: 'entrada',
      createdByAgentId: agent?.agentId || null,
      createdByAgentName: agent?.displayName || 'Sistema'
    };

    if (editingId) {
        await updateRegistro(editingId, registroData);
        displayMessage('Registro actualizado con éxito.', 'success');
    } else {
        await createRegistro(tipo, registroData);
        displayMessage('Registro de entrada creado con éxito.', 'success');
    }

    closeEntradaForm();
    clearFiltersAndRender();
  } catch (error) {
    displayMessage(`Error al guardar: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

async function loadAndRenderRegistros() {
  console.log("--- INICIANDO CARGA DE REGISTROS ---"); // CHIVATO DE INICIO
  showLoading('Cargando registros...');
  try {
    const filters = getCurrentFilters();
    filters.direction = currentSubview;
    
    // ✅ CHIVATO 1: Ver qué filtros se están enviando al backend
    console.log("CHIVATO 1: Filtros enviados al backend:", filters);

    const registros = await getRegistros(filters);
    
    // ✅ CHIVATO 2: Ver qué respuesta llega desde el backend
    console.log("CHIVATO 2: Registros recibidos del backend:", registros);

    renderRegistrosTable(registros);
  } catch(error) {
      console.error("ERROR en loadAndRenderRegistros:", error); // CHIVATO DE ERROR
      displayMessage(`Error al cargar registros: ${error.message}`, 'error');
  } finally {
      hideLoading();
  }
}

function renderRegistrosTable(registros) {
  const container = document.getElementById('registros-list-container');
  if (!container) return;
  if (!Array.isArray(registros) || registros.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>No se encontraron registros que coincidan con la búsqueda.</p></div>`;
    return;
  }
  
  let html = `<table class="data-table"><thead>
    <tr>
      <th>Nº Registro</th>
      <th>S. Referencia</th>
      <th>Asunto</th>
      <th>Interesado/Dest.</th>
      <th>Agente</th>
      <th>Fecha</th>
      <th>Estado</th>
      <th>Acciones</th>
    </tr>
  </thead><tbody>`;
  
  registros.forEach(reg => {
    const fecha = reg.fechaPresentacion?.toDate ? format(reg.fechaPresentacion.toDate(), 'dd/MM/yyyy') : 'N/A';
    const estadoClass = (reg.estado || 'default').toLowerCase();
    const estadoText = reg.estado ? reg.estado.charAt(0).toUpperCase() + reg.estado.slice(1) : 'N/A';

    html += `<tr data-id="${reg.id}">
      <td>${reg.registrationNumber || 'N/A'}</td>
      <td>${reg.referencia || ''}</td>
      <td>${reg.subject || ''}</td>
      <td>${reg.interesado || ''}</td>
      <td>${reg.createdByAgentName || 'Sin Agente'}</td>
      <td>${fecha}</td>
      <td><span class="status-badge status-${estadoClass}">${estadoText}</span></td>
      <td class="actions-cell">
        <button class="icon-button button-edit" title="Editar"><i data-feather="edit-2"></i></button>
        <button class="icon-button btn-finalizar-salida" title="Finalizar con documento de salida"><i data-feather="file-plus"></i></button>
        <button class="icon-button btn-finalizar-sin-salida" title="Finalizar"><i data-feather="check"></i></button>
        <button class="icon-button btn-adjuntar" title="Adjuntar archivo"><i data-feather="paperclip"></i></button>
        <button class="icon-button button-delete" title="Eliminar"><i data-feather="trash-2"></i></button>
      </td>
    </tr>`;
  });
  
  html += `</tbody></table>`;
  container.innerHTML = html;

  // ✅ LÍNEA CRÍTICA AÑADIDA: Dibuja los iconos después de crear la tabla.
  if (window.feather) {
    feather.replace();
  }
}


// --- ACCIONES DE LA TABLA ---

async function handleRecordEdit(recordId) {
  showLoading('Cargando datos...');
  try {
    const recordData = await getRegistroById(recordId);
    if (currentSubview === 'entrada') {
      openEntradaForm(recordData);
    } else {
      openRegistroModal({ dataForEdit: recordData, direction: 'salida', callback: loadAndRenderRegistros });
    }
  } catch(error) {
    displayMessage(error.message, 'error');
  } finally {
    hideLoading();
  }
}

async function handleDeleteRecordClick(recordId) {
  const reason = prompt('Introduce el motivo de la eliminación (obligatorio):');
  if (reason === null || reason.trim() === '') {
    displayMessage('Eliminación cancelada.', 'info');
    return;
  }
  if (confirm('¿Seguro que quieres eliminar este registro?')) {
    showLoading('Eliminando...');
    try {
      await markRegistroAsDeleted(recordId, reason);
      displayMessage('Registro eliminado con éxito.', 'success');
      loadAndRenderRegistros();
    } catch (error) {
      displayMessage(`Error al eliminar: ${error.message}`, 'error');
    } finally {
      hideLoading();
    }
  }
}

function finalizarConDocumento(recordId) {
  openRegistroModal({ parentId: recordId, direction: 'salida', callback: loadAndRenderRegistros });
}

async function finalizarSinDocumento(recordId) {
  if (!confirm('¿Finalizar este registro de entrada sin generar documento de salida?')) return;
  showLoading('Finalizando...');
  try {
    await updateRegistro(recordId, { estado: 'finalizado' });
    displayMessage('Registro finalizado.', 'success');
    loadAndRenderRegistros();
  } catch (err) {
    displayMessage('Error al finalizar.', 'error');
  } finally {
    hideLoading();
  }
}

async function adjuntarArchivo(recordId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = "*/*";
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    showLoading('Subiendo archivo...');
    try {
      await uploadRegistroFile(recordId, file);
      displayMessage('Archivo adjuntado.', 'success');
    } catch (err) {
      displayMessage('Error al subir archivo.', 'error');
    } finally {
      hideLoading();
    }
  };
  input.click();
}