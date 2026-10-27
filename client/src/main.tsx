import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'

// Auto-register service worker for PWA offline & Android WebAPK support
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Yeni sürüm algılandığında derhal yeni servis worker'ı devreye al ve sayfayı yenile
    console.log('🔄 Yeni sürüm yüklendi, sayfa güncelleniyor...');
    updateSW(true);
  },
  onRegistered(registration) {
    if (registration) {
      // 15 saniyede bir yeni sürüm kontrolü yap
      setInterval(() => {
        registration.update();
      }, 15000);
    }
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
