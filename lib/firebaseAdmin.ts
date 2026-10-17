import admin from 'firebase-admin';

/**
 * Lazy-init Firebase Admin. Panggil hanya dari dalam request handler,
 * jangan di top-level module, supaya `npm run build` tidak gagal
 * saat env var belum tersedia.
 */
export function getFirebaseAdmin() {
  if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !rawPrivateKey) {
      throw new Error('Firebase Admin env vars tidak lengkap (projectId/clientEmail/privateKey)');
    }

    // Buang kutip nyasar, lalu ubah \n / \\n (satu atau lebih backslash) jadi newline asli
    const privateKey = rawPrivateKey
      .trim()
      .replace(/^["']|["']$/g, '')
      .replace(/\\+n/g, '\n')
      .replace(/\r/g, '');

    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  }
  return admin;
}