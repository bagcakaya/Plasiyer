import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'

let refreshing = false;
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
}

// Auto-register service worker for PWA offline & Android WebAPK support
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('🔄 Yeni sürüm algılandı, güncelleniyor...');
    updateSW(true);
  },
  onRegistered(registration) {
    if (registration) {
      // 60 saniyede bir ve uygulama öne geldiğinde yeni sürüm kontrolü yap
      setInterval(() => {
        registration?.update().catch(() => {});
      }, 60000);

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration?.update().catch(() => {});
        }
      });
    }
  },
});

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
