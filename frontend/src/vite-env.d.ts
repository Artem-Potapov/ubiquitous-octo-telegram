/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "false" switches the app from the simulated backend to the real FastAPI service. */
  readonly VITE_USE_MOCK_API?: string
  /** Base URL of the FastAPI service, e.g. http://localhost:8000 */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
