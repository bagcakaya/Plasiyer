import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'

let refreshing = false;
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      console.log('🔄 Yeni Service Worker aktifleşti, sayfa yenileniyor...');
      window.location.reload();
    }
  });
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
      // 5 saniyede bir yeni sürüm kontrolü yap
      setInterval(() => {
        registration.update().catch(() => {});
      }, 5000);
    }
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
