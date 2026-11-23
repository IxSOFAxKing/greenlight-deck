import { createRoot } from 'react-dom/client'
import { App } from './App'
import { controller } from './input/controller'
import { SettingsProvider, ToastProvider, UpdateProvider } from './state'
import './styles.css'

controller.start()

createRoot(document.getElementById('root')!).render(
  <SettingsProvider>
    <ToastProvider>
      <UpdateProvider>
        <App />
      </UpdateProvider>
    </ToastProvider>
  </SettingsProvider>,
)
