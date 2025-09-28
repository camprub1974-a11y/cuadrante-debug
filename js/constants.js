// js/constants.js

export const SHIFT_TYPE_MAP = {
  M: 'M',
  T: 'T',
  N: 'N',
  L: 'L',
  D: 'D',
  V: 'V',
  I: 'I',
  B: 'B',
  P: 'P',
  '-': '-',
};
export const FULL_SHIFT_TYPE_MAP = {
  M: 'Mañana',
  T: 'Tarde',
  N: 'Noche',
  L: 'Libre',
  D: 'Disponible',
  V: 'Vacaciones',
  I: 'Incapacidad',
  B: 'Baja',
  P: 'Permiso',
  '-': 'Sin Asignación',
};

// [MODIFICACIÓN CLAVE] Mapeo de tipos de servicios extraordinarios y sus precios corregidos
export const EXTRA_SERVICE_TYPES = {
  diurno: { name: 'Diurno', price: 25 },
  nocturno: { name: 'Nocturno', price: 32 },
  festivo: { name: 'Festivo', price: 35 },
  festivo_nocturno: { name: 'Festivo Nocturno', price: 38 },
};
