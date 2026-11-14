import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'

declare const __APP_BUILD_VERSION__: string;

let refreshing = false;

async function forceRefreshCachesAndReload(targetVersion?: string) {
  if (refreshing) return;
  try {
    if (targetVersion) {
      const lastUpdatedTo = sessionStorage.getItem('plasiyer_updated_to_version');
      if (lastUpdatedTo === targetVersion) return;
      sessionStorage.setItem('plasiyer_updated_to_version', targetVersion);
    }
  } catch {
    // ignore storage errors
  }

  refreshing = true;
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    // ignore
  }

  try {
    if ('caches' in window && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // ignore
  }

  window.location.replace(window.location.pathname + '?v=' + Date.now());
}

async function checkLiveServerVersion() {
  if (typeof window === 'undefined' || !navigator.onLine || refreshing) return;
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) return;
    const data = (await res.json()) as { version?: string };
    if (
      data?.version &&
      typeof __APP_BUILD_VERSION__ !== 'undefined' &&
      data.version !== __APP_BUILD_VERSION__
    ) {
      await forceRefreshCachesAndReload(data.version);
    }
  } catch {
    // Çevrimdışı veya yerel geliştirme ortamında sessizce devam et
  }
}

if (typeof window !== 'undefined') {
  // Dağıtım sonrası eski chunk hash hatası oluşursa sayfayı temiz şekilde yenile
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        console.log('🔄 Yeni Service Worker aktifleşti, sayfa yenileniyor...');
        window.location.reload();
      }
    });
  }

  // Mobil PWA açılışında, sekme öne geldiğinde ve internet bağlandığında anında sürüm kontrolü yap
  checkLiveServerVersion();
  window.addEventListener('pageshow', () => {
    checkLiveServerVersion();
  });
  window.addEventListener('focus', () => {
    checkLiveServerVersion();
  });
  window.addEventListener('online', () => {
    checkLiveServerVersion();
  });
}

// Auto-register service worker for PWA offline & Android WebAPK support (skip on localhost so local server is always live)
const isLocalhostHost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

if (isLocalhostHost && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  }).catch(() => {});
}

const updateSW = !isLocalhostHost
  ? registerSW({
      immediate: true,
      onNeedRefresh() {
        console.log('🔄 Yeni sürüm algılandı, güncelleniyor...');
        updateSW(true);
      },
      onRegistered(registration) {
        if (registration) {
          // Açılışta beklemeden anında SW güncellemesini denetle
          registration.update().catch(() => {});

          // 60 saniyede bir ve uygulama öne geldiğinde yeni sürüm kontrolü yap
          setInterval(() => {
            registration?.update().catch(() => {});
            checkLiveServerVersion();
          }, 60000);

          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
              registration?.update().catch(() => {});
              checkLiveServerVersion();
            }
          });
        }
      },
    })
  : () => Promise.resolve();

// Mobil sanal klavye açıldığında input veya textarea'nın klavye altında kalmasını önleme
if (typeof window !== 'undefined') {
  window.addEventListener(
    'focusin',
    (e) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) &&
        target.getAttribute('type') !== 'checkbox' &&
        target.getAttribute('type') !== 'radio' &&
        target.getAttribute('type') !== 'button' &&
        target.getAttribute('type') !== 'submit' &&
        target.getAttribute('data-no-autoscroll') !== 'true'
      ) {
        // Klavyenin açılma animasyonunu bekleyip hedef alanı görünür alanın merkezine kaydır
        setTimeout(() => {
          try {
            target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          } catch {
            target.scrollIntoView(false);
          }
        }, 150);

        setTimeout(() => {
          try {
            target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          } catch {
            target.scrollIntoView(false);
          }
        }, 350);
      }
    },
    { passive: true }
  );
}

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__PLASIYER_BOOTED__ = true;
  try {
    sessionStorage.removeItem('plasiyer_sw_healed');
    // URL'de geçici kurtarma parametresi (?v=...) varsa geçmişi kirletmeden temizle
    if (window.location.search.includes('v=')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('v');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
  } catch {
    // ignore storage errors
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
