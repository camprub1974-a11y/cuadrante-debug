// js/ui/serviceReportView.js

import { displayMessage, showLoading, hideLoading } from './viewManager.js';
import { showReportsListView } from '../main.js';
import {
  getServiceReportDetails,
  updateRequerimientoStatus,
  updateChecklistItemStatus,
  submitServiceReport,
  validateServiceReport,
  addRequerimiento,
  deleteRequerimiento,
  updateRequerimiento,
} from '../dataController.js';
import { openReportSummaryModal } from './reportSummaryModal.js';
import { formatDate } from '../utils.js';
import { getAgentName } from './scheduleRenderer.js';
import { currentUser } from '../state.js';

let currentReport = null;
let eventListenersInitialized = false;  

const SUMMARY_FIELD_LABELS = {
  estacionamiento_indebido: 'Estacionamiento Indebido', denuncias_trafico: 'Denuncias Tráfico', informes_trafico: 'Informes Tráfico', delitos_trafico: 'Delitos Seg. Vial', controles_trafico: 'Controles Tráfico', regulacion_trafico: 'Regulación Tráfico', deposito_vehiculos: 'Depósito Vehículos', diligencias_prevencion: 'Diligencias Prevención', otros_trafico: 'Otros (Tráfico)', contrap_patrimonio: 'Contra el Patrimonio', salud_publica: 'Contra la Salud Pública', denuncias_seguridad: 'Denuncias Seg. Ciudadana', identificaciones: 'Identificaciones', reyertas: 'Reyertas', violencia_genero: 'Violencia de Género', minutas: 'Minutas/Diligencias', detenidos_ciudadana: 'Detenidos', solicitud_datos_gc: 'Solicitud Datos GC', anomalias_via: 'Anomalías Vía Pública', vehiculos_abandonados: 'Vehículos Abandonados', denuncias_oomm: 'Denuncias O.O.M.M.', inspecciones_locales: 'Inspecciones Locales', inspecciones_obras: 'Inspecciones Obras', notificaciones: 'Notificaciones', informes_admin: 'Informes Administrativos', certificados_convivencia: 'Cert. Convivencia', auxilio_personas: 'Auxilio a Personas', fallecimientos: 'Fallecimientos', colab_bomberos: 'Colaboración Bomberos', colaboracion_gc: 'Colaboración GC', colab_sanitarios: 'Colaboración Sanitarios', intervencion_menores: 'Intervención Menores', req_ciudadanos: 'Requerimientos Ciudadanos', recepcion_llamadas: 'Recepción Llamadas', recepcion_denuncias: 'Recepción Denuncias', citaciones: 'Citaciones', diligencias_exposicion: 'Diligencias Exposición'
};
const SUMMARY_FIELD_ICONS = {
  estacionamiento_indebido: 'minus-circle', denuncias_trafico: 'shield', informes_trafico: 'file-text', delitos_trafico: 'alert-octagon', controles_trafico: 'bar-chart-2', regulacion_trafico: 'move', deposito_vehiculos: 'truck', diligencias_prevencion: 'folder', otros_trafico: 'more-horizontal', contrap_patrimonio: 'home', salud_publica: 'activity', denuncias_seguridad: 'alert-circle', identificaciones: 'users', reyertas: 'user-x', violencia_genero: 'alert-triangle', minutas: 'edit', detenidos_ciudadana: 'user-check', solicitud_datos_gc: 'share-2', anomalias_via: 'tool', vehiculos_abandonados: 'truck', denuncias_oomm: 'slash', inspecciones_locales: 'coffee', inspecciones_obras: 'hard-hat', notificaciones: 'mail', informes_admin: 'file', certificados_convivencia: 'award', auxilio_personas: 'heart', fallecimientos: 'user-minus', colab_bomberos: 'wind', colaboracion_gc: 'user-plus', colab_sanitarios: 'plus-circle', intervencion_menores: 'user', req_ciudadanos: 'phone-call', recepcion_llamadas: 'phone', recepcion_denuncias: 'edit-3', citaciones: 'send', diligencias_exposicion: 'book-open'
};

export async function renderServiceReport(reportId) {
  showLoading('Cargando datos del parte...');
  try {
    currentReport = await getServiceReportDetails(reportId);
    if (!currentReport || !currentReport.order) throw new Error('Los datos recibidos son incompletos.');

    renderHeader(currentReport);
    const canAgentEditReport = currentReport.status === 'open' || currentReport.status === 'returned';
    renderRequerimientos(currentReport.requerimientos || [], canAgentEditReport);
    renderChecklist(currentReport.order.checklist || [], canAgentEditReport);
    renderSummary(currentReport.summary);
    setupActionFooter(currentReport);
    initializeServiceReportEventListeners(); 

    if (window.feather) {
      feather.replace();
    }
  } catch (error) {
    console.error('Error al renderizar los datos del parte:', error);
    displayMessage(`No se pudieron cargar los datos del parte: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

// ✅ FUNCIÓN DE EVENTOS COMPLETAMENTE REVISADA Y CORREGIDA
function initializeServiceReportEventListeners() {
    if (eventListenersInitialized) return;

    const viewContainer = document.getElementById('service-report-view');
    if (!viewContainer) return;

    // --- Listener para CLICS (Botones) ---
    viewContainer.addEventListener('click', async (event) => {
        const button = event.target.closest('button');
        if (!button) return;

        const action = button.dataset.action;
        const itemRow = button.closest('.requerimiento-item-row');

        if (action === 'edit-req' && itemRow) {
            itemRow.classList.add('is-editing');
            itemRow.querySelector('.view-mode-content').style.display = 'none';
            itemRow.querySelector('.edit-mode-content').style.display = 'block';
            return;
        }

        if (action === 'cancel-edit-req' && itemRow) {
            if (!itemRow.dataset.id) {
                itemRow.remove();
            } else {
                itemRow.classList.remove('is-editing');
                itemRow.querySelector('.view-mode-content').style.display = 'block';
                itemRow.querySelector('.edit-mode-content').style.display = 'none';
            }
            return;
        }
        
        if (action === 'save-edit-req' && itemRow) {
            const requerimientoId = itemRow.dataset.id;
            const data = {
                hora: itemRow.querySelector('input[name="hora"]').value,
                requirente: itemRow.querySelector('input[name="requirente"]').value.trim(),
                motivo: itemRow.querySelector('textarea[name="motivo"]').value.trim(),
                comment: itemRow.querySelector('textarea[name="comentario"]').value.trim(),
            };
            if (!data.hora || !data.requirente || !data.motivo) {
                displayMessage('Los campos Hora, Requirente y Motivo son obligatorios.', 'warning');
                return;
            }
            showLoading('Guardando...');
            try {
                if (requerimientoId) {
                    await updateRequerimiento(currentReport.id, requerimientoId, data);
                    displayMessage('Requerimiento actualizado.', 'success');
                } else {
                    await addRequerimiento(currentReport.id, data);
                    displayMessage('Requerimiento añadido.', 'success');
                }
                await renderServiceReport(currentReport.id);
            } catch (error) {
                displayMessage(`Error al guardar: ${error.message}`, 'error');
            } finally {
                hideLoading();
            }
            return;
        }

        if (button.classList.contains('req-delete-btn')) {
            handleDeleteRequerimiento(button.dataset.id);
            return;
        }
        
        // ✅ CORRECCIÓN: Se añaden los casos para los botones de admin
        switch (button.id) {
            case 'back-to-reports-list-btn': showReportsListView(); break;
            case 'edit-summary-btn': openReportSummaryModal(currentReport); break;
            case 'submit-report-btn': handleSubmitReport(); break;
            case 'add-requerimiento-btn': handleAddNewRequerimiento(); break;
            case 'return-report-btn': handleValidation('returned'); break;
            case 'validate-report-btn': handleValidation('validated'); break;
        }
    });

    // --- ✅ CORRECCIÓN: Listener para CAMBIOS (Selectores de estado) ---
    viewContainer.addEventListener('change', (event) => {
        const radio = event.target.closest('input[type="radio"]');
        if (!radio) return;
        
        if (radio.name.startsWith('req-status-')) {
            handleRequerimientoChange(event);
        } else if (radio.name.startsWith('chk-status-')) {
            handleChecklistChange(event);
        }
    });
    
    // Listener para la actualización automática del resumen (ya estaba bien)
    document.addEventListener('reportSummaryUpdated', async () => {
        if (document.getElementById('service-report-view') && currentReport?.id) {
            showLoading('Actualizando resumen...');
            await renderServiceReport(currentReport.id);
            hideLoading();
        }
    });

    eventListenersInitialized = true;
}


function renderHeader(reportDetails) {
  const order = reportDetails.order;
  document.getElementById('report-view-title').textContent = order.title || 'Parte de Servicio';
  document.getElementById('report-order-ref').textContent = `Reg: ${order.order_reg_number || 'N/A'}`;
  const statusEl = document.getElementById('report-order-status');
  statusEl.className = `status-badge status-${(reportDetails.status || '').toLowerCase()}`;
  statusEl.textContent = reportDetails.status;
  document.getElementById('report-order-date').textContent = formatDate(order.service_date, 'dd/MM/yyyy');
  document.getElementById('report-order-shift').textContent = order.service_shift;
  document.getElementById('report-order-responsible').textContent = getAgentName(order.shift_manager_id) || 'No Asignado';
  const agentsEl = document.getElementById('report-order-agents');
  agentsEl.textContent = Array.isArray(order.assigned_agents) ? order.assigned_agents.map((id) => getAgentName(id)).join(', ') : 'N/A';
  const instructionsElement = document.getElementById('report-order-instructions');
  if (instructionsElement) {
    instructionsElement.textContent = order.description || 'No hay instrucciones generales para esta orden.';
  }
}

function renderRequerimientos(requerimientos, isEditable) {
    const container = document.querySelector('#requerimientos-list-container');
    if (!container) return;
    if (!requerimientos || requerimientos.length === 0) {
        container.innerHTML = `<div class="empty-state compact"><p>No hay requerimientos registrados.</p></div>`;
        return;
    }
    container.innerHTML = requerimientos.map(req => {
        const isRealizado = req.status === 'realizado';
        const hora = req.hora || '--:--';
        const requirente = req.requirente || 'No especificado';
        const motivo = req.motivo || req.description || 'Sin descripción';
        const comentario = req.comment || '';

        return `
            <div class="requerimiento-item-row" data-id="${req.id}">
                <div class="req-main-content">
                    <div class="view-mode-content">
                        <div class="req-info-header">
                            <span class="req-time">${hora}</span>
                            <span class="req-requerente">Requirente: <strong>${requirente}</strong></span>
                        </div>
                        <p class="req-motivo">${motivo}</p>
                        ${comentario ? `<p class="req-comentario"><strong>Resolución:</strong> ${comentario}</p>` : `<p class="req-comentario-empty"><em>(No hay comentarios de resolución)</em></p>`}
                    </div>

                   <div class="edit-mode-content" style="display: none;">
    <div class="form-grid-2-col" style="margin-bottom: 0.75rem;">
        <div class="form-group">
            <label class="form-label">Hora</label>
            <input type="time" class="form-control" name="hora" value="${hora}" />
        </div>
        <div class="form-group">
            <label class="form-label">Requirente</label>
            <input type="text" class="form-control" name="requirente" value="${requirente}" />
        </div>
    </div>
    <div class="form-group">
        <label class="form-label">Motivo del Requerimiento</label>
        <textarea class="form-control" name="motivo" rows="3">${motivo}</textarea>
    </div>
    <div class="form-group">
        <label class="form-label">Comentario de Resolución</label>
        <textarea class="form-control" name="comentario" rows="3">${comentario}</textarea>
    </div>
    <div class="inline-edit-actions">
        <button class="button button-secondary" data-action="cancel-edit-req">Cancelar</button>
        <button class="button button-primary" data-action="save-edit-req">Guardar</button>
    </div>
</div>
                </div>

                <div class="req-actions-group">
                    <div class="requerimiento-status-toggle">
                        <input type="radio" id="req-pen-${req.id}" name="req-status-${req.id}" value="pendiente" data-id="${req.id}" ${!isRealizado ? 'checked' : ''} ${!isEditable ? 'disabled' : ''}>
                        <label for="req-pen-${req.id}">Pendiente</label>
                        <input type="radio" id="req-rea-${req.id}" name="req-status-${req.id}" value="realizado" data-id="${req.id}" ${isRealizado ? 'checked' : ''} ${!isEditable ? 'disabled' : ''}>
                        <label for="req-rea-${req.id}">Realizado</label>
                    </div>
                    ${isEditable ? `
                    <div class="requerimiento-actions">
                        <button class="icon-button" data-action="edit-req" title="Editar / Añadir Comentario">
                            <i data-feather="edit-2"></i>
                        </button>
                        <button class="icon-button req-delete-btn" data-id="${req.id}" title="Borrar">
                            <i data-feather="trash-2"></i>
                        </button>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function renderChecklist(checklist, isEditable) {
    const container = document.getElementById('checklist-items-container');
    if (!container) return;
    if (!checklist || checklist.length === 0) {
        container.innerHTML = `<p class="info-message">Esta orden no tiene un checklist asociado.</p>`;
        return;
    }
    container.innerHTML = checklist.map((item, index) => {
        const isRealizado = item.status === 'realizado';
        return `
            <div class="requerimiento-item-row" data-index="${index}">
                <div class="requerimiento-info">
                    <div><b>Tarea</b><span>${item.item || '(Sin nombre)'}</span></div>
                </div>
                <div class="requerimiento-status-toggle">
                    <input type="radio" id="chk-pen-${index}" name="chk-status-${index}" value="pendiente" data-index="${index}" ${!isRealizado ? 'checked' : ''} ${!isEditable ? 'disabled' : ''}>
                    <label for="chk-pen-${index}">Pendiente</label>
                    <input type="radio" id="chk-rea-${index}" name="chk-status-${index}" value="realizado" data-index="${index}" ${isRealizado ? 'checked' : ''} ${!isEditable ? 'disabled' : ''}>
                    <label for="chk-rea-${index}">Realizado</label>
                </div>
            </div>
        `;
    }).join('');
}

function renderSummary(summaryData) {
    const container = document.getElementById('summary-view-container');
    if (!container) return;
    const entries = Object.entries(summaryData || {}).filter(([key, value]) => typeof value === 'number' && value > 0 && SUMMARY_FIELD_LABELS[key]);
    if (entries.length === 0) {
        container.innerHTML = '<p class="empty-state-text">No hay actuaciones registradas en el resumen.</p>';
        return;
    }
    container.innerHTML = entries.map(([key, value]) => {
        const iconName = SUMMARY_FIELD_ICONS[key] || 'list';
        return `
            <div class="stat-card compact">
                <i data-feather="${iconName}" class="stat-icon"></i>
                <span class="stat-value">${value}</span>
                <span class="stat-label">${SUMMARY_FIELD_LABELS[key]}</span>
            </div>
        `;
    }).join('');
}

function setupActionFooter(reportDetails) {
    const footer = document.getElementById('report-actions-footer');
    if (!footer) return;
    const user = currentUser.get();
    const isMando = user.role === 'admin' || user.role === 'supervisor';
    const canAgentEdit = reportDetails.status === 'open' || reportDetails.status === 'returned';
    let content = '';
    if (isMando) {
        if (reportDetails.status === 'pending_review') {
            content = `<button id="return-report-btn" class="button button-secondary">Devolver para Corrección</button>
                       <button id="validate-report-btn" class="button button-success">Aprobar Parte</button>`;
        }
    } else {
        if (canAgentEdit) {
            content = `<button id="edit-summary-btn" class="button button-secondary"><i data-feather="edit"></i> Editar Resumen</button>
                       <button id="submit-report-btn" class="button button-primary"><i data-feather="send"></i> Finalizar y Enviar</button>`;
        }
    }
    footer.innerHTML = content;
}

// ✅ AÑADE ESTA NUEVA FUNCIÓN a serviceReportView.js
// Esta función crea dinámicamente una fila en modo de edición.
function handleAddNewRequerimiento() {
    const container = document.getElementById('requerimientos-list-container');
    if (!container) return;
    
    // Evita añadir más de una fila nueva a la vez
    if (container.querySelector('.requerimiento-item-row:not([data-id])')) {
        displayMessage('Ya hay un nuevo requerimiento en proceso. Guárdalo o cancélalo primero.', 'info');
        return;
    }

     const newRowHtml = `
        <div class="requerimiento-item-row is-editing">
            <div class="req-main-content">
                <div class="view-mode-content" style="display: none;"></div>
                <div class="edit-mode-content" style="display: block;">
                    <div class="form-grid-2-col" style="margin-bottom: 0.75rem;">
                        <div class="form-group">
                            <label class="form-label">Hora</label>
                            <input type="time" class="form-control" name="hora" />
                        </div>
                        <div class="form-group">
                            <label class="form-label">Requirente</label>
                            <input type="text" class="form-control" name="requirente" placeholder="Nombre o entidad" />
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Motivo del Requerimiento</label>
                        <textarea class="form-control" name="motivo" rows="3" placeholder="Describe brevemente el motivo..."></textarea>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Comentario de Resolución (Opcional)</label>
                        <textarea class="form-control" name="comentario" rows="3" placeholder="Añade aquí las acciones realizadas..."></textarea>
                    </div>
                    <div class="inline-edit-actions">
                        <button class="button button-secondary" data-action="cancel-edit-req">Cancelar</button>
                        <button class="button button-primary" data-action="save-edit-req">Guardar</button>
                    </div>
                </div>
            </div>
            <div class="req-actions-group"></div>
        </div>
    `;

    // Inserta la nueva fila al principio de la lista
    container.insertAdjacentHTML('afterbegin', newRowHtml);
    if(window.feather) feather.replace(); // Refresca los iconos si es necesario
    
    // Pon el foco en el primer campo de texto para comodidad del usuario
    container.querySelector('textarea[name="motivo"]').focus();
}

async function handleDeleteRequerimiento(requerimientoId) {
    if (!currentReport) return;
    if (confirm('¿Seguro que quieres eliminar este requerimiento?')) {
        showLoading('Eliminando...');
        try {
            await deleteRequerimiento(currentReport.id, requerimientoId);
            displayMessage('Requerimiento eliminado.', 'success');
            await renderServiceReport(currentReport.id);
        } catch (error) {
            displayMessage(`Error: ${error.message}`, 'error');
        } finally {
            hideLoading();
        }
    }
}

async function handleRequerimientoChange(event) {
    const radio = event.target;
    if (!radio || !currentReport) return;
    const requerimientoId = radio.dataset.id; 
    const newStatus = radio.value;
    showLoading('Actualizando estado...');
    try {
        await updateRequerimientoStatus({
            reportId: currentReport.id,
            orderId: currentReport.order.id,
            requerimientoId: requerimientoId,
            newStatus: newStatus
        });
        displayMessage('Estado actualizado.', 'success');
        const reqToUpdate = currentReport.requerimientos.find(r => r.id === requerimientoId);
        if(reqToUpdate) reqToUpdate.status = newStatus;
    } catch (error) {
        displayMessage(`Error al actualizar: ${error.message}`, 'error');
        const oldStatus = newStatus === 'realizado' ? 'pendiente' : 'realizado';
        const oldRadio = document.querySelector(`input[name="req-status-${requerimientoId}"][value="${oldStatus}"]`);
        if(oldRadio) oldRadio.checked = true;
    } finally {
        hideLoading();
    }
}

async function handleChecklistChange(event) {
    const radio = event.target;
    const itemIndex = parseInt(radio.dataset.index, 10);
    const newStatus = radio.value;
    showLoading('Actualizando tarea...');
    try {
        await updateChecklistItemStatus({
            reportId: currentReport.id,
            orderId: currentReport.order.id,
            itemIndex: itemIndex,
            newStatus: newStatus
        });
        displayMessage('Tarea actualizada.', 'success');
        const updatedDetails = await getServiceReportDetails(currentReport.id);
        currentReport.order.checklist = updatedDetails.order.checklist;
    } catch (error) {
        displayMessage(`Error: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

async function handleSubmitReport() {
    if (!currentReport || !confirm('¿Seguro que quieres finalizar y enviar este parte para su revisión?')) return;
    showLoading('Enviando parte...');
    try {
        await submitServiceReport(currentReport.id);
        displayMessage('Parte enviado para revisión.', 'success');
        showReportsListView();
    } catch (error) {
        displayMessage(`Error al enviar: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

async function handleValidation(newStatus) {
    if (!currentReport) return;
    let comments = '';

    // El prompt para pedir comentarios solo aparecerá si se devuelve el parte
    if (newStatus === 'returned') {
        comments = prompt('Introduce los motivos para la devolución del parte:');
        if (comments === null) { // Si el admin cancela el prompt
            displayMessage('La devolución fue cancelada.', 'info');
            return;
        }
    }

    showLoading('Procesando...');
    try {
        await validateServiceReport({
            reportId: currentReport.id,
            newStatus: newStatus,
            comments: comments,
        });
        displayMessage(`El parte ha sido marcado como '${newStatus}'.`, 'success');

        // --- ✅ ESTA ES LA LÓGICA CLAVE DE LA SOLUCIÓN ---
        if (newStatus === 'validated') {
            // Si el parte se valida, volvemos a la lista principal.
            showReportsListView();
        } else {
            // Si se devuelve, refrescamos la vista para ver el nuevo estado.
            await renderServiceReport(currentReport.id);
        }
        
    } catch (error) {
        displayMessage(`Error al validar: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}