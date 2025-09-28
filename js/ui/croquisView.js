// js/ui/croquisView.js (VERSIÓN FINAL Y CORREGIDA)

import { showLoading, hideLoading, displayMessage } from './viewManager.js';
import { initializeCroquisModal, openCroquisModal } from './croquisModal.js';
import { getSketches, generateSketchPdf, deleteSketch, getSketchById } from '../dataController.js';
import { formatDate } from '../utils.js';
import { currentUser } from '../state.js';

let listContainer, filterLugar, filterFecha, filterImplicados, applyFiltersBtn, clearFiltersBtn;
let isInitialized = false;
let currentSketches = [];

export function initializeCroquisView() {
  if (isInitialized) return;

  initializeCroquisModal();

  listContainer = document.getElementById('croquis-list-container');
  const createCroquisBtn = document.getElementById('create-croquis-btn');
  filterLugar = document.getElementById('croquis-filter-lugar');
  filterFecha = document.getElementById('croquis-filter-fecha');
  filterImplicados = document.getElementById('croquis-filter-implicados');
  applyFiltersBtn = document.getElementById('apply-croquis-filters-btn');
  clearFiltersBtn = document.getElementById('clear-croquis-filters-btn');

  if (
    !listContainer ||
    !createCroquisBtn ||
    !applyFiltersBtn ||
    !clearFiltersBtn ||
    !filterLugar ||
    !filterFecha ||
    !filterImplicados
  ) {
    console.error('Faltan elementos de la interfaz en la vista de Croquis.');
    return;
  }

  createCroquisBtn.addEventListener('click', () => openCroquisModal(renderCroquisView));
  listContainer.addEventListener('click', handleTableClicks);
  applyFiltersBtn.addEventListener('click', applyFiltersAndRender);
  clearFiltersBtn.addEventListener('click', () => {
    filterLugar.value = '';
    filterFecha.value = '';
    filterImplicados.value = '';
    applyFiltersAndRender();
  });

  isInitialized = true;
}

export async function renderCroquisView() {
  if (!isInitialized) {
    initializeCroquisView();
  }

  showLoading('Cargando croquis...');
  if (listContainer) {
    listContainer.innerHTML = '<p class="info-message">Cargando...</p>';
  }

  try {
    const sketches = await getSketches();
    currentSketches = sketches;
    applyFiltersAndRender();
  } catch (error) {
    displayMessage(`Error al cargar croquis: ${error.message}`, 'error');
    if (listContainer) {
      listContainer.innerHTML = `<p class="error-message">No se pudieron cargar los croquis.</p>`;
    }
  } finally {
    hideLoading();
  }
}

function applyFiltersAndRender() {
  if (!currentSketches) {
    renderSketchesTable([]);
    return;
  }

  const lugarFilter = filterLugar.value.toLowerCase();
  const fechaFilter = filterFecha.value;
  const implicadosFilter = filterImplicados.value.toLowerCase();

  const filteredSketches = currentSketches.filter((sketch) => {
    const matchesLugar = lugarFilter
      ? (sketch.lugar || '').toLowerCase().includes(lugarFilter)
      : true;
    // ✅ FILTRO DE FECHA MÁS SEGURO: Comprueba que la fecha exista antes de intentar usarla.
    const matchesFecha = fechaFilter
      ? sketch.fechaSuceso &&
        typeof sketch.fechaSuceso.toISOString === 'function' &&
        sketch.fechaSuceso.toISOString().split('T')[0] === fechaFilter
      : true;
    const matchesImplicados = implicadosFilter
      ? (sketch.implicados || '').toLowerCase().includes(implicadosFilter)
      : true;
    return matchesLugar && matchesFecha && matchesImplicados;
  });

  renderSketchesTable(filteredSketches);
}

// ✅ FUNCIÓN MEJORADA con async/await para mayor claridad
async function handleTableClicks(event) {
  const btn = event.target.closest('button');
  if (!btn) return;
  const sketchRow = btn.closest('tr');
  if (!sketchRow) return;
  const sketchId = sketchRow.dataset.id;
  if (!sketchId) return;

  if (btn.classList.contains('view-sketch-btn')) {
    // En lugar de abrir el modal, buscamos el croquis y abrimos su imageUrl si existe
    const sketch = currentSketches.find((s) => s.id === sketchId);
    if (sketch && sketch.imageUrl) {
      window.open(sketch.imageUrl, '_blank');
    } else {
      displayMessage('Este croquis no tiene una imagen para visualizar.', 'info');
    }
  } else if (btn.classList.contains('edit-sketch-btn')) {
    showLoading('Cargando datos...');
    try {
      const sketchToEdit = await getSketchById(sketchId);
      openCroquisModal(renderCroquisView, sketchToEdit);
    } catch (error) {
      displayMessage(`Error al cargar el croquis: ${error.message}`, 'error');
    } finally {
      hideLoading();
    }
  } else if (btn.classList.contains('pdf-sketch-btn')) {
    showLoading('Generando PDF...');
    try {
      const result = await generateSketchPdf(sketchId);
      if (result && result.success && result.pdfUrl) {
        window.open(result.pdfUrl, '_blank');
        displayMessage('PDF listo.', 'success');
      } else {
        const errorMessage = result?.message || 'La función no devolvió una respuesta válida.';
        displayMessage(errorMessage, 'error');
      }
    } catch (error) {
      displayMessage(`Error al generar el PDF: ${error.message}`, 'error');
    } finally {
      hideLoading();
    }
  } else if (btn.classList.contains('delete-sketch-btn')) {
    if (
      confirm(
        '¿Estás seguro de que deseas eliminar este croquis? Esta acción no se puede deshacer.'
      )
    ) {
      showLoading('Eliminando...');
      try {
        await deleteSketch(sketchId);
        displayMessage('Croquis eliminado con éxito.', 'success');
        await renderCroquisView();
      } catch (error) {
        displayMessage(`Error al eliminar: ${error.message}`, 'error');
      } finally {
        hideLoading();
      }
    }
  }
}

function renderSketchesTable(sketches) {
  if (!listContainer) return;

  if (!sketches || sketches.length === 0) {
    listContainer.innerHTML =
      '<p class="info-message">No se encontraron croquis que coincidan con los filtros.</p>';
    return;
  }

  const user = currentUser.get();

  const tableHtml = `
        <table class="data-table">
            <thead>
                <tr><th>Lugar</th><th>Fecha Suceso</th><th>Implicados</th><th>Documento</th><th>Acciones</th></tr>
            </thead>
            <tbody>
                ${sketches
                  .map((sketch) => {
                    const canDelete = user && user.role === 'admin';
                    return `
                    <tr data-id="${sketch.id}">
                        <td>${sketch.lugar || '---'}</td>
                        <td>${sketch.fechaSuceso ? formatDate(sketch.fechaSuceso, 'dd/MM/yyyy HH:mm') : 'Fecha Inválida'}</td>
                        <td>${sketch.implicados || '---'}</td>
                        <td style="text-transform: capitalize;">${sketch.documentoRealizado || '---'}</td>
                        <td class="actions-cell">
                            <button class="button button-icon button-secondary view-sketch-btn" title="Ver Imagen del Croquis"><span class="material-icons">visibility</span></button>
                            <button class="button button-icon button-edit edit-sketch-btn" title="Editar Datos"><span class="material-icons">edit</span></button>
                            <button class="button button-icon button-primary pdf-sketch-btn" title="Generar PDF Completo"><span class="material-icons">picture_as_pdf</span></button>
                            ${canDelete ? `<button class="button button-icon button-danger delete-sketch-btn" title="Eliminar Croquis"><span class="material-icons">delete</span></button>` : ''}
                        </td>
                    </tr>
                `;
                  })
                  .join('')}
            </tbody>
        </table>
    `;
  listContainer.innerHTML = tableHtml;
}

export function resetCroquisView() {
  isInitialized = false;
  currentSketches = [];
}
