import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
createApp(App).mount('#app')

// Installable web app: keep the browser's install prompt for our own "Install" button.
addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.__installPrompt = e; dispatchEvent(new Event('kurinji-installable')) })
if (import.meta.env.PROD && 'serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}))
