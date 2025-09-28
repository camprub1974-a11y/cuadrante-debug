// Archivo: js/ui/personaModal.js

import { displayMessage, showLoading, hideLoading } from './viewManager.js';
// NOTA: Necesitarás crear las funciones savePersona y updatePersona en dataController.js
import { savePersona, updatePersona } from '../dataController.js'; 

let modal, form, modalTitle, personaIdInput, dniInput, nombreInput, apellidosInput, moteInput, telefonoInput, fechaNacimientoInput, domicilioInput;
let onSaveCallback = null;

function initializePersonaModal() {
    modal = document.getElementById('persona-modal');
    form = document.getElementById('persona-form');
    modalTitle = document.getElementById('persona-modal-title');
    personaIdInput = document.getElementById('persona-id');
    dniInput = document.getElementById('persona-dni');
    nombreInput = document.getElementById('persona-nombre');
    apellidosInput = document.getElementById('persona-apellidos');
    moteInput = document.getElementById('persona-mote');
    telefonoInput = document.getElementById('persona-telefono');
    fechaNacimientoInput = document.getElementById('persona-fechaNacimiento');
    domicilioInput = document.getElementById('persona-domicilio');

    form.addEventListener('submit', handleFormSubmit);
    modal.querySelector('.close-button').addEventListener('click', () => modal.classList.add('hidden'));
}

export function openPersonaModal(callback, personaData = null) {
    if (!modal) initializePersonaModal();
    
    onSaveCallback = callback;
    form.reset();
    personaIdInput.value = '';
    dniInput.readOnly = false;

    if (personaData) {
        modalTitle.textContent = 'Editar Persona';
        personaIdInput.value = personaData.id;
        dniInput.value = personaData.dni || '';
        dniInput.readOnly = true; // El DNI (ID) no se puede editar
        nombreInput.value = personaData.nombre || '';
        apellidosInput.value = personaData.apellidos || '';
        moteInput.value = personaData.mote || '';
        telefonoInput.value = personaData.telefono || '';
        fechaNacimientoInput.value = personaData.fechaNacimiento ? new Date(personaData.fechaNacimiento.seconds * 1000).toISOString().split('T')[0] : '';
        domicilioInput.value = personaData.domicilioCompleto || '';
    } else {
        modalTitle.textContent = 'Nueva Persona';
    }

    modal.classList.remove('hidden');
    if(window.feather) feather.replace();
}

async function handleFormSubmit(event) {
    event.preventDefault();
    showLoading('Guardando...');

    const personaId = personaIdInput.value;
    const data = {
        dni: dniInput.value.trim().toUpperCase(),
        nombre: nombreInput.value.trim(),
        apellidos: apellidosInput.value.trim(),
        mote: moteInput.value.trim(),
        telefono: telefonoInput.value.trim(),
        fechaNacimiento: fechaNacimientoInput.value ? new Date(fechaNacimientoInput.value) : null,
        domicilioCompleto: domicilioInput.value.trim()
    };

    try {
        if (personaId) {
            // Editando una persona existente
            await updatePersona(personaId, data);
            displayMessage('Persona actualizada con éxito.', 'success');
        } else {
            // Creando una nueva persona (el ID será el DNI)
            await savePersona(data.dni, data);
            displayMessage('Persona creada con éxito.', 'success');
        }
        modal.classList.add('hidden');
        if (onSaveCallback) onSaveCallback();
    } catch (error) {
        displayMessage(`Error al guardar: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}