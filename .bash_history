ls
unzip nombre_de_tu_zip.zip
unzip cudrantes.zip
unzip Cudrantes.zip
cd cudrantes
cd Cudrantes
ls
firebase use cuadrante-81ca7
firebase deploy --only firestore
mv firestore.indexes..json firestore.indexes.json
firebase deploy --only firestore
cd ~/Cuadrantes # o el directorio de tu proyecto si no es Cuadrantes
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only hosting
cd functions
npm install
cd..
firebase deploy --only functions
cd..
cd ..
firebase deploy --only functions
cd functions
edit package.json
unzip Cudrantes.zip
cd Cudrantes
firebase use cuadrante-81ca7
cd functions
rm -rf node_modules package-lock.json
npm install
cd ..
firebase deploy --only functions
firebase deploy --only hosting
firebase deploy --only firestore
ls
edit firebase.json
mv firestore.rules Cuadrantes/
cd ..
mv firestore.rules Cuadrantes/
cd..
firebase deploy --only firestore
cd Cudrantes
firebase deploy --only firestore
firebase deploy --only hosting --force
cd Cudrantes
firebase deploy --only hosting --force
cd Cudrantes
firebase deploy --only hosting --force
cd Cudrantes
firebase deploy --only hosting --force
cd Cudrantes
firebase deploy --only hosting --force
firebase deploy --force
firebase deploy --only hosting --force
// js/main.js
// -- INICIO DEL NUEVO SISTEMA GUARDIÁN --
// 1. Definimos dos guardianes y almacenamos el estado de autenticación.
let isDomReady = false;
let authState = { ready: false, user: null };
// 2. Creamos la función que intentará arrancar la aplicación.
function tryStartApp() {     // Solo se ejecuta si AMBOS guardianes están en 'true'.;     if (isDomReady && authState.ready) {
}
// 3. Listener para cuando el DOM está listo.
document.addEventListener('DOMContentLoaded', () => {
});
// 4. Listener para cuando el estado de autenticación de Firebase está listo.
auth.onAuthStateChanged(user => {
});
// -- FIN DEL NUEVO SISTEMA GUARDIÁN --
function switchView(viewType) {
}
// El resto de las funciones se mantienen igual, pero ahora se llamarán de forma segura.
async function initializeAuthenticatedApp(user) {
}
function initializeUnauthenticatedApp() {     app.elements.authStatus.textContent = 'Inicia sesión.';     app.elements.logoutButton.style.display = 'none';     app.elements.authContainer.style.display = 'block';     app.elements.appContent.style.display = 'none';          if (app.elements.scheduleContent) {
}
// -- INICIO DEL NUEVO SISTEMA GUARDIÁN --
// 1. Definimos dos guardianes y almacenamos el estado de autenticación.
let isDomReady = false;
let authState = { ready: false, user: null };
// 2. Creamos la función que intentará arrancar la aplicación.
function tryStartApp() {     // Solo se ejecuta si AMBOS guardianes están en 'true'.;     if (isDomReady && authState.ready) {
}
// 3. Listener para cuando el DOM está listo.
document.addEventListener('DOMContentLoaded', () => {
}   hideLoading(); // Nos aseguramos de que el spinner no se quede atascado.n.</p>';ersonId);ntUserGuardId : null;'`);
firebase deploy --only hosting --force
rm -rf Cudrantes
cd..
cd ~
rm -rf Cudrantes
unzip Cudrantes.zip
cd Cudrantes
firebase deploy --only hosting --force
ls -l
mv Cudrantes Cudrantes_Desarrollo
cd Cudrantes_Desarrollo
ls -l public
firebase hosting:channel:deploy desarrollo-calendario
firebase deploy --only hosting --force
firebase hosting:channel:deploy desarrollo-calendario
firebase deploy --only functions
cd functions
rm -rf node_modules package-lock.json
npm install
cd ..
firebase deploy --only functions
cd functions
rm -rf node_modules package-lock.json
npm install
cd ..
firebase deploy --only functions
cd functions
rm -rf node_modules package-lock.json
npm install
cd..
firebase deploy --only functions
cd..
cd ..
firebase functions:delete updateShiftV2 --region us-central1 --force
cd functions
rm -rf node_modules package-lock.json
npm install
cd ..
firebase deploy --only functions
cd ~/Cudrantes_Desarrollo
firebase hosting:clone cuadrante-81ca7:desarrollo-calendario live
firebase hosting:clone cuadrante-81ca7:desarrollo-calendario cuadrante-81ca7:live
firebase deploy --only hosting
firebase deploy --only hosting --force
cd cudrantes_desarrollo
cd Cudrantes_Desarrollo
firebase deploy --only hosting
ls
zip -r cudrantes_desarrollo_backup.zip .
ls -l
cd Cudrantes_Desarrollo
firebase deploy --only hosting
firebase deploy --only hosting --force
firebase hosting:channel:deploy desarrollo
ls -l public/
firebase hosting:channel:deploy desarrollo
unzip Cudrantes_Desarrollo.zip
cd Cudrantes_Desarrollo
curl -X POST "https://updatesolicitudstatus-131147165591.us-central1.run.app" -H "Authorization: bearer $(gcloud auth print-identity-token)" -H "Content-Type: application/json" -d '{  "solicitudId": "rE47xRvMNqRLw1K3TOSf",  "newStatus": "Aprobado",  "commentsAdmin": "Solicitud de prueba de Asuntos Propios aprobada.",  "reviewedByUserId": "b6jb8Gh7pVWXxGhx79gWdqeqUIT2" }'curl -X POST "https://updateSolicitudStatus-XXXXXXXXXX.us-central1.r.cloudfunctions.net/updateSolicitudStatus" -H "Authorization: bearer $(gcloud auth print-identity-token)" -H "Content-Type: application/json" -d '{
  "solicitudId": "rE47XvRwNQrRLw1K3TOSf",
  "newStatus": "Aprobado",
  "commentsAdmin": "Solicitud de prueba de Asuntos Propios aprobada.",
  "reviewedByUserId": "b6jB8Gh7pVWXGhx79gIwdqegUIT2"
}'
curl -X POST "https://us-central1-cuadrante-81ca7.cloudfunctions.net/updateSolicitudStatus" -H "Authorization: bearer $(gcloud auth print-identity-token)" -H "Content-Type: application/json" -d '{
  "solicitudId": "rE47xRvMNqRLw1K3TOSf",
  "newStatus": "Aprobado",
  "commentsAdmin": "Solicitud de prueba de Asuntos Propios aprobada.",
  "reviewedByUserId": "b6jb8Gh7pVWXxGhx79gWdqeqUIT2"
}'
nano request.json
curl -X POST "https://us-central1-cuadrante-81ca7.cloudfunctions.net/updateSolicitudStatus" -H "Authorization: bearer $(gcloud auth print-identity-token)" -H "Content-Type: application/json" --data @request.json
curl -X POST "https://us-central1-cuadrante-81ca7.cloudfunctions.net/updateSolicitudStatus" -H "Authorization: bearer $(gcloud auth print-identity-token)" -H "Content-Type: application/json" --data @request.json
nano request.json
curl -X POST "https://us-central1-cuadrante-81ca7.cloudfunctions.net/updateSolicitudStatus" -H "Authorization: bearer $(gcloud auth print-identity-token)" -H "Content-Type: application/json" --data @request.json
nano request.json
curl -X POST "https://us-central1-cuadrante-81ca7.cloudfunctions.net/updateSolicitudStatus" -H "Authorization: bearer $(gcloud auth print-identity-token)" -H "Content-Type: application/json" --data @request.json
curl -X POST "https://us-central1-cuadrante-81ca7.cloudfunctions.net/updateSolicitudStatus" -H "Authorization: bearer $(gcloud auth print-identity-token)" -H "Content-Type: application/json" --data @request.json
curl -X POST "https://us-central1-cuadrante-81ca7.cloudfunctions.net/updateSolicitudStatus" -H "Authorization: bearer $(gcloud auth print-identity-token)" -H "Content-Type: application/json" --data @request.json
gsutil cors set cors.json gs://cuadrante-81ca7.appspot.com
gsutil cors set cors.json gs://cuadrante-81ca7.firebaseapp.com
gsutil cors set cors.json gs://cuadrante-81ca7.firebasestorage.app
gsutil ls
gsutil ls gs://cuadrante-81ca7.firebasestorage.app/
cat cors.json
nano cors.json
gsutil cors set cors.json gs://cuadrante-81ca7.firebasestorage.app/
unzip cuadrante-vite.zip
cd cuadrante-vite
npm install
cd functions
npm install
cd..
nvm install 18
nvm use 18
node --version
cd functions
npm install
cd cuadrante-vite
cd functions
npm install
nvm install 20
nvm use 20
node --version
npm install
cd ..
firebase login
firebase login --no-localhost
firebase use cuadrante-81ca7
firebase deploy
cd functions
npm install --save firebase-functions@latest
firebase deploy
ls -lh
unzip cuadrante-vite.zip
firebase deploy --only hosting
cd cuadrante-vite
firebase deploy --only hosting
