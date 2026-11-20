import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// Evita que atrás/adelante muestre una página en caché (bfcache) con sesión vieja.
window.addEventListener('pageshow', (e) => { if (e.persisted) window.location.reload(); });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
