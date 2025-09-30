import admin from 'firebase-admin';
import serviceAccount from './serviceAccountKey.json' with { type: 'json' };
import docData from './documentTemplate.json' with { type: 'json' };

// Inicializar el SDK de Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Función para subir el documento
async function uploadTemplate() {
  try {
    const docRef = db.doc('documentTemplates/aMTklbKuGRj8OPJW3CP8');
    await docRef.set(docData, { merge: true });
    console.log('Documento subido con éxito.');
  } catch (err) {
    console.error('Error subiendo documento:', err);
  }
}

// Ejecutar la función
uploadTemplate();
