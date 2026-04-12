import { createContext, useContext } from 'react'

export const VisitedContext = createContext({
  visited: [],
  toggle: () => {},
  isVisited: () => false,
})

export function useVisitedContext() {
  return useContext(VisitedContext)
}
