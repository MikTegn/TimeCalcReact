import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { Dispatch, ReactNode } from 'react'
import { calcYear } from '../engine/index.ts'
import type { Dataset, YearCalc } from '../engine/index.ts'
import { reducer } from './reducer.ts'
import type { Action } from './reducer.ts'
import { clearStored, loadSeedOrEmpty, loadStored, saveStored } from './storage.ts'

interface Store {
  ds: Dataset
  year: YearCalc
  dispatch: Dispatch<Action>
  /** Kastar lokala ändringar och läser om seed-filen (eller ett tomt år). */
  resetToSeed: () => Promise<void>
  saveFailed: boolean
}

const Ctx = createContext<Store | null>(null)

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore måste användas inom <StoreProvider>')
  return s
}

/** Laddar sparade data (localStorage) eller seed-filen, och visar `fallback` under tiden. */
export function StoreProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [initial, setInitial] = useState<Dataset | null>(() => loadStored())
  useEffect(() => {
    if (initial) return
    let cancelled = false
    void loadSeedOrEmpty().then((ds) => {
      if (!cancelled) setInitial(ds)
    })
    return () => {
      cancelled = true
    }
  }, [initial])

  if (!initial) return <>{fallback}</>
  return <Loaded initial={initial}>{children}</Loaded>
}

function Loaded({ initial, children }: { initial: Dataset; children: ReactNode }) {
  const [ds, dispatch] = useReducer(reducer, initial)
  const [saveFailed, setSaveFailed] = useState(false)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setSaveFailed(!saveStored(ds))
  }, [ds])

  const year = useMemo(() => calcYear(ds), [ds])
  const store = useMemo<Store>(
    () => ({
      ds,
      year,
      dispatch,
      saveFailed,
      resetToSeed: async () => {
        clearStored()
        dispatch({ type: 'load', ds: await loadSeedOrEmpty() })
      },
    }),
    [ds, year, saveFailed],
  )
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

