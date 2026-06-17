import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { DeviceProvider } from './state/DeviceContext.jsx'
import { ToastProvider } from './state/ToastContext.jsx'
import { ConfirmProvider } from './state/ConfirmContext.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <ConfirmProvider>
        <DeviceProvider>
          <App />
        </DeviceProvider>
      </ConfirmProvider>
    </ToastProvider>
  </React.StrictMode>
)
