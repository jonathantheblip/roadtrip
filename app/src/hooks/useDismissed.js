import { useCallback, useState } from 'react'

function storageKey(person) {
  return `rt_dismissed_${person}`
}

function readDismissed(person) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(person))) || []
  } catch {
    return []
  }
}

function writeDismissed(person, ids) {
  try {
    localStorage.setItem(storageKey(person), JSON.stringify(ids))
  } catch { /* quota */ }
}

export function useDismissed(activePerson) {
  const [dismissed, setDismissed] = useState(() => readDismissed(activePerson))
  const [toast, setToast] = useState(null)

  const dismiss = useCallback((id) => {
    setDismissed((prev) => {
      const next = [...prev, id]
      writeDismissed(activePerson, next)
      return next
    })
    setToast(id)
    setTimeout(() => setToast((cur) => (cur === id ? null : cur)), 5000)
  }, [activePerson])

  const undo = useCallback(() => {
    if (!toast) return
    setDismissed((prev) => {
      const next = prev.filter((d) => d !== toast)
      writeDismissed(activePerson, next)
      return next
    })
    setToast(null)
  }, [toast, activePerson])

  const restore = useCallback((id) => {
    setDismissed((prev) => {
      const next = prev.filter((d) => d !== id)
      writeDismissed(activePerson, next)
      return next
    })
  }, [activePerson])

  const isDismissed = useCallback((id) => dismissed.includes(id), [dismissed])

  return { dismissed, dismiss, undo, restore, isDismissed, toast }
}
