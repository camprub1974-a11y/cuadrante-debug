// seed_permission_types.js

// --- INICIO DE LA SECCIÓN MODIFICADA ---

// Se utiliza el import por defecto de 'firebase-admin' para mayor compatibilidad.
import admin from 'firebase-admin';

// Se importan los módulos nativos de Node.js para leer el archivo JSON de forma manual y segura.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Se construye la ruta al archivo 'serviceAccountKey.json' y se carga su contenido.
// Este método es el más robusto y evita los errores de importación de JSON.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serviceAccountPath = join(__dirname, 'serviceAccountKey.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

// --- FIN DE LA SECCIÓN MODIFICADA ---

// **IMPORTANTE: Ruta a tu Service Account Key**
// El código anterior ya se encarga de localizar tu serviceAccountKey.json.

// Inicializa el SDK de Firebase Admin (Esta línea ahora funcionará correctamente)
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Obtiene una referencia a Firestore
const db = admin.firestore();

// Define los datos de los tipos de permiso y licencia (SIN CAMBIOS)
const permissionTypesData = [
  {
    id: 'vacaciones',
    name: 'Vacaciones',
    initial_quadrant: 'P',
    initial_gestion: 'V',
    category: 'permiso',
    requiresApproval: true,
    active: true,
    description: 'Disfrute de vacaciones retribuidas.',
  },
  {
    id: 'asuntos_particulares',
    name: 'Asuntos Particulares',
    initial_quadrant: 'P',
    initial_gestion: 'AP',
    category: 'permiso',
    requiresApproval: true,
    active: true,
    description: 'Días de permiso por asuntos particulares.',
  },
  {
    id: 'deber_inexcusable',
    name: 'Deber Inexcusable',
    initial_quadrant: 'P',
    initial_gestion: 'DI',
    category: 'permiso',
    requiresApproval: false,
    active: true,
    description:
      'Permiso por el tiempo indispensable para el cumplimiento de un deber inexcusable de carácter público o personal.',
  },
  {
    id: 'traslado_domicilio',
    name: 'Traslado Domicilio',
    initial_quadrant: 'P',
    initial_gestion: 'TD',
    category: 'permiso',
    requiresApproval: false,
    active: true,
    description: 'Permiso por traslado de domicilio sin cambio de residencia.',
  },
  {
    id: 'examenes_prenatales_parto',
    name: 'Exámenes Prenatales / Parto',
    initial_quadrant: 'P',
    initial_gestion: 'EPP',
    category: 'permiso',
    requiresApproval: false,
    active: true,
    description:
      'Permiso para la realización de exámenes prenatales y técnicas de preparación al parto.',
  },
  {
    id: 'fallecimiento_enf_grave_familiar',
    name: 'Fallecimiento / Enf. Grave Familiar',
    initial_quadrant: 'P',
    initial_gestion: 'FGF',
    category: 'permiso',
    requiresApproval: false,
    active: true,
    description:
      'Permiso por fallecimiento, accidente o enfermedad grave de un familiar hasta segundo grado.',
  },
  {
    id: 'tecnicas_reproduccion_asistida',
    name: 'Técnicas Reprod. Asistida',
    initial_quadrant: 'P',
    initial_gestion: 'TRA',
    category: 'permiso',
    requiresApproval: true,
    active: true,
    description: 'Permiso para someterse a técnicas de fecundación o reproducción asistida.',
  },
  {
    id: 'lactancia',
    name: 'Lactancia',
    initial_quadrant: 'P',
    initial_gestion: 'L',
    category: 'permiso',
    requiresApproval: false,
    active: true,
    description: 'Permiso por lactancia de un hijo menor de doce meses.',
  },
  {
    id: 'licencia_asuntos_propios_no_retribuida',
    name: 'Licencia Asuntos Propios (No Retr.)',
    initial_quadrant: 'Lc',
    initial_gestion: 'LAP',
    category: 'licencia',
    requiresApproval: true,
    active: true,
    description: 'Licencia sin retribución por asuntos propios.',
  },
  {
    id: 'licencia_enfermedad_con_baja',
    name: 'Licencia por Enfermedad (con Baja)',
    initial_quadrant: 'Lc',
    initial_gestion: 'LEB',
    category: 'enfermedad',
    requiresApproval: false,
    active: true,
    description: 'Licencia por proceso patológico con baja médica.',
  },
  {
    id: 'enfermedad_sin_baja',
    name: 'Enfermedad sin Baja Médica',
    initial_quadrant: 'ESB',
    initial_gestion: 'ESB',
    category: 'enfermedad_sin_baja',
    requiresApproval: false,
    active: true,
    description:
      'Ausencia por enfermedad o accidente que no da lugar a incapacidad temporal (menor de cuatro días).',
  },
  {
    id: 'cambio_turno_solicitud',
    name: 'Solicitud de Cambio de Turno',
    initial_quadrant: 'CT',
    initial_gestion: 'CT',
    category: 'cambio_turno',
    requiresApproval: true,
    active: true,
    description:
      'Solicitud de cambio de turno con otro compañero. (El cuadrante mostrará el turno final).',
  },
];

// Función para subir los datos (SIN CAMBIOS)
async function uploadPermissionTypes() {
  console.log('Subiendo tipos de permiso a Firestore...');
  for (const type of permissionTypesData) {
    try {
      const docRef = db.collection('permissionTypes').doc(type.id);
      const { id, ...dataWithoutId } = type;
      await docRef.set(dataWithoutId);
      console.log(`Documento ${type.id} subido/actualizado.`);
    } catch (error) {
      console.error(`Error al subir el documento ${type.id}:`, error);
    }
  }
  console.log('Subida de tipos de permiso finalizada.');
  process.exit();
}

uploadPermissionTypes();
