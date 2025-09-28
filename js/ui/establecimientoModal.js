// Archivo: js/ui/establecimientoModal.js

import { displayMessage, showLoading, hideLoading } from './viewManager.js';
import { saveEstablecimiento, updateEstablecimiento } from '../dataController.js'; 

let modal, form, modalTitle, establecimientoIdInput, cifInput, nombreComercialInput, licenciaActividadInput, titularDniInput, telefonoInput, direccionInput;
let onSaveCallback = null;

export function initializeEstablecimientoModal() {
    modal = document.getElementById('establecimiento-modal');
    form = document.getElementById('establecimiento-form');
    modalTitle = document.getElementById('establecimiento-modal-title');
    establecimientoIdInput = document.getElementById('establecimiento-id');
    cifInput = document.getElementById('establecimiento-cif');
    nombreComercialInput = document.getElementById('establecimiento-nombreComercial');
    licenciaActividadInput = document.getElementById('establecimiento-licenciaActividad');
    titularDniInput = document.getElementById('establecimiento-titular-dni');
    telefonoInput = document.getElementById('establecimiento-telefono');
    direccionInput = document.getElementById('establecimiento-direccion');

    form.addEventListener('submit', handleFormSubmit);
    modal.querySelectorAll('.close-button').forEach(btn => btn.addEventListener('click', () => modal.classList.add('hidden')));
}

export function openEstablecimientoModal(callback, establecimientoData = null) {
    if (!modal) initializeEstablecimientoModal();
    
    onSaveCallback = callback;
    form.reset();
    establecimientoIdInput.value = '';
    cifInput.readOnly = false;

    if (establecimientoData) {
        modalTitle.textContent = 'Editar Establecimiento';
        establecimientoIdInput.value = establecimientoData.id;
        cifInput.value = establecimientoData.cif || '';
        cifInput.readOnly = true; // El CIF (ID) no se puede editar
        nombreComercialInput.value = establecimientoData.nombreComercial || '';
        licenciaActividadInput.value = establecimientoData.licenciaActividad || '';
        titularDniInput.value = establecimientoData.titularDni || '';
        telefonoInput.value = establecimientoData.telefono || '';
        direccionInput.value = establecimientoData.direccion || '';
    } else {
        modalTitle.textContent = 'Nuevo Establecimiento';
    }

    modal.classList.remove('hidden');
    if(window.feather) feather.replace();
}

async function handleFormSubmit(event) {
    event.preventDefault();
    showLoading('Guardando...');

    const establecimientoId = establecimientoIdInput.value;
    const data = {
        cif: cifInput.value.trim().toUpperCase(),
        nombreComercial: nombreComercialInput.value.trim(),
        licenciaActividad: licenciaActividadInput.value.trim(),
        titularDni: titularDniInput.value.trim().toUpperCase(),
        telefono: telefonoInput.value.trim(),
        direccion: direccionInput.value.trim()
    };

    try {
        if (establecimientoId) {
            // Editando un establecimiento existente
            await updateEstablecimiento(establecimientoId, data);
            displayMessage('Establecimiento actualizado con éxito.', 'success');
        } else {
            // Creando un nuevo establecimiento (el ID será el CIF)
            await saveEstablecimiento(data.cif, data);
            displayMessage('Establecimiento creado con éxito.', 'success');
        }
        modal.classList.add('hidden');
        if (onSaveCallback) onSaveCallback();
    } catch (error) {
        displayMessage(`Error al guardar: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}