import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
createApp(App).mount('#app')

// Installable web app: keep the browser's install prompt for our own "Install" button.
addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.__installPrompt = e; dispatchEvent(new Event('kurinji-installable')) })
// The Android app (Capacitor) ships every file inside the APK: no service worker needed there.
const native = !!window.Capacitor?.isNativePlatform?.()
if (native) {
  document.documentElement.classList.add('native-app')
  // Android back button: close the map/journal, else open the pause menu
  import('@capacitor/app').then(({ App }) => App.addListener('backButton', () => dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' })))).catch(() => {})
} else if (import.meta.env.PROD && 'serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}))
