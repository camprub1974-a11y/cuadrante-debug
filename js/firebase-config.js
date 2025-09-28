// cuadrante-vite/js/firebase-config.js

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions'; // ✅ AÑADIDO: Importa getFunctions

// Tu configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", // Clave de API falsa
  authDomain: "proyecto-falso-12345.firebaseapp.com", // Dominio falso
  projectId: "proyecto-falso-12345", // ID de proyecto falso
  storageBucket: "proyecto-falso-12345.appspot.com", // Bucket de almacenamiento falso
  messagingSenderId: "123456789012", // ID de remitente falso
  appId: "1:123456789012:web:12345abcde67890fgh123", // ID de aplicación falsa
  measurementId: "G-XXXXXXXXXX" // ID de medición falsa
};
// Inicializa Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app); // ✅ AÑADIDO: Inicializa y exporta functions
