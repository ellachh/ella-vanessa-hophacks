import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SpacetimeDBProvider } from 'spacetimedb/react'

import App from './App.tsx'
import { DbConnection } from './module_bindings'
import { DATABASE_NAME, SPACETIME_URI } from './config'
import './index.css'

/**
 * The provider takes the *builder*, not a built connection — it calls .build()
 * itself. Passing a built connection is the easy mistake here.
 *
 * The token is remembered so a refresh keeps the same Identity. Without it you
 * get a new identity every reload and your own claims stop looking like yours.
 */
const connectionBuilder = DbConnection.builder()
  .withUri(SPACETIME_URI)
  .withDatabaseName(DATABASE_NAME)
  .withToken(localStorage.getItem('relay.token') ?? undefined)
  .onConnect((_conn, _identity, token) => {
    try {
      localStorage.setItem('relay.token', token)
    } catch {
      // Private browsing — a fresh identity per load is survivable.
    }
  })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      <App />
    </SpacetimeDBProvider>
  </StrictMode>,
)
