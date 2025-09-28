// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  // Asegúrate de que esta sección 'resolve' exista o añádela
  resolve: {
    // Forzar a Vite a usar una única instancia de nanostores,
    // útil si tienes dependencias que también usan nanostores.
    dedupe: ['nanostores'],
  },
  // Si tienes otras configuraciones de Vite (plugins, build, etc.), colócalas aquí
  // plugins: [react()], // Ejemplo si usaras React
  // build: { /* ... */ }
});
