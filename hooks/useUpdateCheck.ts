'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface UpdateInfo {
  newVersion: string;
  releaseNotes: string;
}

interface UseUpdateCheckOptions {
  versionUrl?: string;
  pollInterval?: number;
  enableServiceWorker?: boolean;
  enablePolling?: boolean;
}

interface UseUpdateCheckReturn {
  hasUpdate: boolean;
  updateInfo: UpdateInfo | null;
  applyUpdate: () => void;
  dismissUpdate: () => void;
  checkNow: () => void;
  lastChecked: Date | null;
}

const INSTALLED_VERSION_KEY = 'app_installed_version';
const SEEN_VERSION_KEY = 'app_update_seen_version';

export function useUpdateCheck({
  versionUrl = '/api/version',
  pollInterval = 5 * 60 * 1000,
  enableServiceWorker = false,
  enablePolling = true,
}: UseUpdateCheckOptions = {}): UseUpdateCheckReturn {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  const triggerUpdate = useCallback((info: UpdateInfo) => {
    // Jangan tampilkan kalau versi ini sudah pernah di-dismiss user
    const seenVersion = localStorage.getItem(SEEN_VERSION_KEY);
    if (seenVersion === info.newVersion) return;

    setUpdateInfo(info);
    setHasUpdate(true);
  }, []);

  // ─── Polling ───────────────────────────────────────────────────────────────
  const pollVersion = useCallback(async () => {
    try {
      const res = await fetch(versionUrl, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setLastChecked(new Date());

      if (!data.version) return;

      // Ambil versi yang sudah terinstall di browser user
      const installedVersion = localStorage.getItem(INSTALLED_VERSION_KEY);

      if (!installedVersion) {
        // Pertama kali buka app — simpan versi sekarang, tidak perlu notifikasi
        localStorage.setItem(INSTALLED_VERSION_KEY, data.version);
        return;
      }

      if (data.version !== installedVersion) {
        // Ada versi baru! Tampilkan banner
        triggerUpdate({
          newVersion: data.version,
          releaseNotes: data.notes || 'Pembaruan baru tersedia.',
        });
      }
    } catch {
      // Gagal diam-diam
    }
  }, [versionUrl, triggerUpdate]);

  useEffect(() => {
    if (!enablePolling) return;

    // Tunda 3 detik agar tidak langsung jalan saat reload
    const initialDelay = setTimeout(() => {
      pollVersion();
      const id = setInterval(pollVersion, pollInterval);
      return () => clearInterval(id);
    }, 3000);

    return () => clearTimeout(initialDelay);
  }, [enablePolling, pollInterval, pollVersion]);

  // ─── Service Worker (opsional) ─────────────────────────────────────────────
  useEffect(() => {
    if (!enableServiceWorker || typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return;
      swRegistrationRef.current = registration;

      const handleUpdate = (reg: ServiceWorkerRegistration) => {
        const newSW = reg.installing;
        if (!newSW) return;
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            triggerUpdate({
              newVersion: 'Versi terbaru',
              releaseNotes: 'Pembaruan tersedia. Muat ulang untuk mendapatkan fitur terbaru.',
            });
          }
        });
      };

      if (registration.waiting && navigator.serviceWorker.controller) {
        triggerUpdate({
          newVersion: 'Versi terbaru',
          releaseNotes: 'Pembaruan sudah siap. Muat ulang untuk menerapkannya.',
        });
      }

      registration.addEventListener('updatefound', () => handleUpdate(registration));
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }, [enableServiceWorker, triggerUpdate]);

  // ─── Actions ───────────────────────────────────────────────────────────────
  const applyUpdate = useCallback(() => {
    if (updateInfo?.newVersion) {
      // Tandai versi baru sebagai "sudah terinstall"
      localStorage.setItem(INSTALLED_VERSION_KEY, updateInfo.newVersion);
      // Tandai juga sebagai "sudah dilihat" agar tidak muncul lagi
      localStorage.setItem(SEEN_VERSION_KEY, updateInfo.newVersion);
    }

    const sw = swRegistrationRef.current;
    if (sw?.waiting) {
      sw.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  }, [updateInfo]);

  const dismissUpdate = useCallback(() => {
    if (updateInfo?.newVersion) {
      // Tandai sudah dilihat, tidak muncul lagi untuk versi ini
      localStorage.setItem(SEEN_VERSION_KEY, updateInfo.newVersion);
    }
    setHasUpdate(false);
    setUpdateInfo(null);
  }, [updateInfo]);

  const checkNow = useCallback(() => {
    localStorage.removeItem(SEEN_VERSION_KEY);
    if (enablePolling) pollVersion();
    if (enableServiceWorker && swRegistrationRef.current) {
      swRegistrationRef.current.update().catch(() => {});
    }
  }, [enablePolling, enableServiceWorker, pollVersion]);

  return { hasUpdate, updateInfo, applyUpdate, dismissUpdate, checkNow, lastChecked };
}