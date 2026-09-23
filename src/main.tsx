import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { StoreProvider } from './state/store.tsx'
import { App } from './ui/App.tsx'
import './ui/styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Hittar inte #root')

createRoot(root).render(
  <StrictMode>
    <StoreProvider fallback={<div className="app"><p className="hint">Laddar…</p></div>}>
      <App />
    </StoreProvider>
  </StrictMode>,
)
