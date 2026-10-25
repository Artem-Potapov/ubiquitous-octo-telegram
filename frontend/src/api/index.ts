// The single switch between simulated and real data.
// Set VITE_USE_MOCK_API=false (e.g. in frontend/.env.local) once FastAPI is running.

import type { CareApi } from './contract'
import { mockBackend } from './mockBackend'
import { httpBackend } from './httpBackend'

export const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API !== 'false'

export const api: CareApi = USE_MOCK_API ? mockBackend : httpBackend
