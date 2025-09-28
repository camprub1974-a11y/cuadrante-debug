// js/ui/serviceOrderModal.js

import { displayMessage, showLoading, hideLoading } from './viewManager.js';
// ✅ Importamos las funciones necesarias, incluyendo la que busca por ID
import { createServiceOrder, updateServiceOrder, getServiceOrderById } from '../dataController.js';
import { formatDate } from '../utils.js';

let modal, form, modalTitle, titleInput, dateInput, shiftSelect, descriptionInput, saveButton;
let taskListContainer, newTaskInput, addTaskBtn;
let orderIdInput; // Usaremos un input oculto para el ID
let tasks = [];
let onSaveCallback = null;
let isInitialized = false;

export function initializeServiceOrderModal(onSave) {
  if (isInitialized) return;

  modal = document.getElementById('service-order-modal');
  if (!modal) {
    console.error('Error Crítico: El modal #service-order-modal no fue encontrado en el HTML.');
    return;
  }

  form = modal.querySelector('#service-order-form');
  modalTitle = modal.querySelector('#service-order-modal-title');
  titleInput = modal.querySelector('#order-title');
  dateInput = modal.querySelector('#order-date');
  shiftSelect = modal.querySelector('#order-shift');
  descriptionInput = modal.querySelector('#order-description');
  saveButton = modal.querySelector('#save-order-btn');
  taskListContainer = modal.querySelector('#task-list-container');
  newTaskInput = modal.querySelector('#new-task-input');
  addTaskBtn = modal.querySelector('#add-task-btn');

  // Creamos un input oculto para manejar el ID de la orden
  orderIdInput = document.createElement('input');
  orderIdInput.type = 'hidden';
  orderIdInput.id = 'service-order-id';
  form.prepend(orderIdInput);

  onSaveCallback = onSave;

  const elements = {
    form,
    modalTitle,
    titleInput,
    dateInput,
    shiftSelect,
    descriptionInput,
    saveButton,
    taskListContainer,
    newTaskInput,
    addTaskBtn,
  };
  for (const key in elements) {
    if (!elements[key]) {
      console.error(`Error de inicialización: El elemento del modal '${key}' no fue encontrado.`);
      return;
    }
  }

  const closeButtons = modal.querySelectorAll('.close-button');
  closeButtons.forEach((btn) => btn.addEventListener('click', hideServiceOrderModal));

  modal.addEventListener('click', (event) => {
    if (event.target === modal) hideServiceOrderModal();
  });

  form.addEventListener('submit', handleFormSubmit);
  addTaskBtn.addEventListener('click', handleAddTask);

  taskListContainer.addEventListener('click', (event) => {
    const deleteBtn = event.target.closest('.delete-task-btn');
    if (deleteBtn) {
      const taskIndex = deleteBtn.closest('.task-item').dataset.index;
      handleDeleteTask(parseInt(taskIndex, 10));
    }
  });

  isInitialized = true;
}

// ✅ FUNCIÓN CORREGIDA Y COMPLETADA
export async function openServiceOrderModal(orderId = null, callback) {
  if (!isInitialized) initializeServiceOrderModal(callback);
  onSaveCallback = callback;

  form.reset();
  tasks = [];
  orderIdInput.value = '';

  if (orderId) {
    // --- MODO EDICIÓN ---
    modalTitle.textContent = 'Editar Orden de Servicio';
    saveButton.textContent = 'Guardar Cambios';
    showLoading('Cargando orden...');
    try {
      const orderData = await getServiceOrderById(orderId);

      // Rellenamos el formulario con los datos de la orden
      orderIdInput.value = orderData.id;
      titleInput.value = orderData.title;
      dateInput.value = formatDate(orderData.service_date, 'yyyy-MM-dd'); // Formato para input[type=date]
      shiftSelect.value = orderData.service_shift;
      descriptionInput.value = orderData.description || '';
      tasks = orderData.checklist || [];
    } catch (error) {
      displayMessage(`Error al cargar la orden: ${error.message}`, 'error');
      hideServiceOrderModal();
      return;
    } finally {
      hideLoading();
    }
  } else {
    // --- MODO CREACIÓN ---
    modalTitle.textContent = 'Crear Nueva Orden de Servicio';
    saveButton.textContent = 'Guardar Orden';
  }

  renderTasks();
  modal.classList.remove('hidden');

  if (window.feather) {
    feather.replace();
  }
}

function hideServiceOrderModal() {
  if (modal) {
    modal.classList.add('hidden');
  }
}

function renderTasks() {
  if (!taskListContainer) return;
  if (tasks.length === 0) {
    taskListContainer.innerHTML = '<div class="no-tasks">No hay tareas añadidas</div>';
    return;
  }

  taskListContainer.innerHTML = tasks
    .map(
      (task, index) => `
        <div class="task-item" data-index="${index}">
            <span>${task.item}</span>
            <button type="button" class="icon-button delete-task-btn" title="Eliminar Tarea">
                <i data-feather="trash-2"></i>
            </button>
        </div>
    `
    )
    .join('');

  if (window.feather) {
    feather.replace();
  }
}

function handleAddTask() {
  const taskDescription = newTaskInput.value.trim();
  if (taskDescription) {
    tasks.push({ item: taskDescription, status: 'pendiente' }); // Usamos el nuevo formato
    newTaskInput.value = '';
    renderTasks();
  }
}

function handleDeleteTask(index) {
  tasks.splice(index, 1);
  renderTasks();
}

async function handleFormSubmit(event) {
  event.preventDefault();
  const orderId = orderIdInput.value; // Leemos el ID desde el input oculto

  const orderData = {
    title: titleInput.value.trim(),
    service_date: dateInput.value,
    service_shift: shiftSelect.value,
    description: descriptionInput.value.trim(),
    checklist: tasks,
  };

  if (!orderData.title || !orderData.service_date || !orderData.service_shift) {
    displayMessage('Los campos Título, Fecha y Turno son obligatorios.', 'warning');
    return;
  }

  showLoading('Guardando...');
  try {
    if (orderId) {
      // Si hay un ID, actualizamos
      await updateServiceOrder(orderId, orderData);
      displayMessage('Orden actualizada con éxito', 'success');
    } else {
      // Si no hay ID, creamos
      await createServiceOrder(orderData);
      displayMessage('Orden creada con éxito', 'success');
    }

    hideServiceOrderModal();
    if (onSaveCallback) {
      onSaveCallback();
    }
  } catch (error) {
    displayMessage(`Error al guardar: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}
