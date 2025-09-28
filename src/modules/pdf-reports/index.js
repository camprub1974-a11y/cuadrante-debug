[
  {
    origin: [
      'http://localhost:5173',
      'http://localhost:5000',
      'http://127.0.0.1:5173',
      'http://0.0.0.0:5173',
    ],
    method: ['GET', 'PUT', 'POST', 'DELETE'],
    responseHeader: [
      'Content-Type',
      'Firebase-Storage-Resumable-Upload-Protocol',
      'x-firebase-storage-upload-string',
      'Access-Control-Allow-Origin',
    ],
    maxAgeSeconds: 3600,
  },
  {
    origin: ['https://cuadrante-81ca7.web.app', 'https://cuadrante-81ca7.firebaseapp.com'],
    method: ['GET', 'PUT', 'POST', 'DELETE'],
    responseHeader: [
      'Content-Type',
      'Firebase-Storage-Resumable-Upload-Protocol',
      'x-firebase-storage-upload-string',
      'Access-Control-Allow-Origin',
    ],
    maxAgeSeconds: 3600,
  },
];
