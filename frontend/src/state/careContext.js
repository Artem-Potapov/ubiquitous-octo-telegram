import { createContext, useContext } from 'react'

export const CareContext = createContext(null)

/** Access the shared care-network data and actions from any component. */
export function useCare() {
  const ctx = useContext(CareContext)
  if (!ctx) throw new Error('useCare must be used inside <CareProvider>')
  return ctx
}
