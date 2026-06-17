import React, { createContext, useCallback, useContext, useRef, useState } from 'react'
import { ConfirmDialog } from '../components/ui.jsx'

const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState(null)
  const resolver = useRef(null)

  // Returns a promise that resolves to true/false.
  const confirm = useCallback((opts) => {
    setOptions(opts)
    setOpen(true)
    return new Promise((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const handleResolve = useCallback((value) => {
    setOpen(false)
    if (resolver.current) {
      resolver.current(value)
      resolver.current = null
    }
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog open={open} options={options} onResolve={handleResolve} />
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}
