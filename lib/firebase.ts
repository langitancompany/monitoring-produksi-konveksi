// lib/firebase.ts
import { initializeApp, getApp, getApps } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyAkYsPPuWL_h6Dyp_mLGR1TKgVw4RnqKPg",
  authDomain: "notifikasi-lco-superapp.firebaseapp.com",
  projectId: "notifikasi-lco-superapp",
  storageBucket: "notifikasi-lco-superapp.firebasestorage.app",
  messagingSenderId: "246581954990",
  appId: "1:246581954990:web:0d29f7711b2bb0ef16e03f"
};

// Pola Singleton agar tidak inisialisasi ulang
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Kita export function async untuk mendapatkan messaging
// agar komponen bisa menunggu sampai browser benar-benar siap
const getFCM = async () => {
  const isSupportedBrowser = await isSupported();
  if (isSupportedBrowser) {
    return getMessaging(app);
  }
  return null;
};

export { app, getFCM, getToken };