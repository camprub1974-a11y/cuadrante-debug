// public/js/auth.js

/**
 * Maneja el envío del formulario de inicio de sesión.
 */
async function handleLoginFormSubmit() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const loginErrorMsg = document.getElementById('login-error-msg');
  loginErrorMsg.textContent = ''; // Limpiar mensajes de error previos
  showLoading(); // Mostrar spinner de carga

  try {
    // 'auth' está globalmente disponible desde firebase-config.js
    await auth.signInWithEmailAndPassword(email, password);
    // La lógica de éxito (mostrar contenido, etc.) se maneja en auth.onAuthStateChanged en main.js
  } catch (error) {
    hideLoading(); // Ocultar spinner
    // Mostrar mensaje de error al usuario
    let errorMessage = 'Correo o contraseña incorrectos.';
    if (error.code === 'auth/wrong-password') {
      errorMessage = 'Contraseña incorrecta.';
    } else if (error.code === 'auth/user-not-found') {
      errorMessage = 'Usuario no encontrado.';
    } else if (error.code === 'auth/invalid-email') {
      errorMessage = 'Formato de correo electrónico inválido.';
    }
    loginErrorMsg.textContent = errorMessage;
    console.error('Error de inicio de sesión:', error);
  }
}

/**
 * Maneja el clic en el botón de cerrar sesión.
 */
async function handleLogoutButtonClick() {
  showLoading(); // Mostrar spinner de carga
  try {
    // 'auth' está globalmente disponible desde firebase-config.js
    await auth.signOut();
    // La lógica de éxito (mostrar pantalla de login) se maneja en auth.onAuthStateChanged en main.js
  } catch (error) {
    hideLoading(); // Ocultar spinner
    displayMessage('Error al cerrar sesión.', 'error');
    console.error('Error al cerrar sesión:', error);
  }
}
