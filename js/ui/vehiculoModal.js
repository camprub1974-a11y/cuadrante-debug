// RUTA: js/ui/vehiculoModal.js (NUEVO ARCHIVO)

import { displayMessage, showLoading, hideLoading } from './viewManager.js';
import { saveVehiculo, updateVehiculo } from '../dataController.js';

let modal, form, modalTitle, vehiculoIdInput, matriculaInput, marcaInput, modeloInput, colorInput, titularDniInput, telefonoInput, observacionesInput;
let onSaveCallback = null;

function initializeVehiculoModal() {
    modal = document.getElementById('vehiculo-modal');
    form = document.getElementById('vehiculo-form');
    modalTitle = document.getElementById('vehiculo-modal-title');
    vehiculoIdInput = document.getElementById('vehiculo-id');
    matriculaInput = document.getElementById('vehiculo-matricula');
    marcaInput = document.getElementById('vehiculo-marca');
    modeloInput = document.getElementById('vehiculo-modelo');
    colorInput = document.getElementById('vehiculo-color');
    titularDniInput = document.getElementById('vehiculo-titular-dni');
    telefonoInput = document.getElementById('vehiculo-telefono');
    observacionesInput = document.getElementById('vehiculo-observaciones');

    form.addEventListener('submit', handleFormSubmit);
    modal.querySelectorAll('.close-button').forEach(btn => btn.addEventListener('click', () => modal.classList.add('hidden')));
}

export function openVehiculoModal(callback, vehiculoData = null) {
    if (!modal) initializeVehiculoModal();

    onSaveCallback = callback;
    form.reset();
    vehiculoIdInput.value = '';
    matriculaInput.readOnly = false;

    if (vehiculoData) {
        modalTitle.textContent = 'Editar Vehículo';
        vehiculoIdInput.value = vehiculoData.id;
        matriculaInput.value = vehiculoData.id || '';
        matriculaInput.readOnly = true; // La matrícula (ID) no se puede editar
        marcaInput.value = vehiculoData.marca || '';
        modeloInput.value = vehiculoData.modelo || '';
        colorInput.value = vehiculoData.color || '';
        titularDniInput.value = vehiculoData.titularDni || '';
        telefonoInput.value = vehiculoData.telefonoContacto || '';
        observacionesInput.value = vehiculoData.observaciones || '';
    } else {
        modalTitle.textContent = 'Nuevo Vehículo';
    }

    modal.classList.remove('hidden');
    if(window.feather) feather.replace();
}

async function handleFormSubmit(event) {
    event.preventDefault();
    showLoading('Guardando...');

    const vehiculoId = vehiculoIdInput.value;
    const data = {
        marca: marcaInput.value.trim(),
        modelo: modeloInput.value.trim(),
        color: colorInput.value.trim(),
        titularDni: titularDniInput.value.trim().toUpperCase(),
        telefonoContacto: telefonoInput.value.trim(),
        observaciones: observacionesInput.value.trim()
    };

    try {
        if (vehiculoId) {
            // Editando un vehículo existente
            await updateVehiculo(vehiculoId, data);
            displayMessage('Vehículo actualizado con éxito.', 'success');
        } else {
            // Creando un nuevo vehículo (el ID será la matrícula)
            const matricula = matriculaInput.value.trim().toUpperCase();
            if (!matricula) {
                throw new Error('La matrícula es obligatoria.');
            }
            await saveVehiculo(matricula, data);
            displayMessage('Vehículo creado con éxito.', 'success');
        }
        modal.classList.add('hidden');
        if (onSaveCallback) onSaveCallback();
    } catch (error) {
        displayMessage(`Error al guardar: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}