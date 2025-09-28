import globals from 'globals';
import js from '@eslint/js';
import pluginSecurity from 'eslint-plugin-security';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  // 1. Configuración global para todos los archivos .js
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser, // Entiende las variables del navegador (window, document, etc.)
        ...globals.node, // Entiende las variables de Node.js (para archivos .cjs)
      },
    },
  },

  // 2. Carga las reglas recomendadas por ESLint
  js.configs.recommended,

  // 3. Carga las reglas recomendadas del plugin de seguridad
  pluginSecurity.configs.recommended,

  // 4. Desactiva reglas que chocan con Prettier (siempre debe ser la última)
  eslintConfigPrettier,

  // 5. Tus reglas personalizadas (puedes añadir más si quieres)
  {
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'warn',
    },
  },
];
