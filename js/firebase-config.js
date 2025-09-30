// cuadrante-vite/js/firebase-config.js

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions'; // ✅ AÑADIDO: Importa getFunctions

// Tu configuración de Firebase
const firebaseConfig = {
  // CORRECCIÓN: Usar solo una apiKey (la correcta)
  apiKey: 'AIzaSyC3hw8eM7QfwB3mvDOeKlu5PTYR53wxm-c',
  authDomain: 'cuadrante-81ca7.firebaseapp.com',
  projectId: 'cuadrante-81ca7',
  storageBucket: 'cuadrante-81ca7.firebasestorage.app',
  messagingSenderId: '131147165591',
  appId: '1:131147165591:web:dee8b8d512f33ddd2a1ed2',
  measurementId: 'G-63J8PECHRE',
};

// Inicializa Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app); // ✅ AÑADIDO: Inicializa y exporta functions
