import type { Dataset } from '../engine/index.ts'
import { createEmptyDataset } from '../engine/index.ts'

const KEY = 'timecalc:dataset:v1'

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

/** Grundläggande strukturkontroll av inläst JSON. Returnerar datasetet eller ett felmeddelande på svenska. */
export function validateDataset(x: unknown): Dataset | string {
  if (!isObj(x) || x.version !== 1) return 'Filen är inte en TimeCalc-export (version 1 väntades).'
  const { config, activities, weeks } = x
  if (!isObj(config) || typeof config.weeklyHours !== 'number' || typeof config.workdaysPerWeek !== 'number' || typeof config.openingBank !== 'number' || typeof config.year !== 'number')
    return 'Inställningarna (config) saknas eller är ofullständiga.'
  if (!Array.isArray(activities) || activities.length === 0) return 'Aktivitetslistan saknas eller är tom.'
  const seen = new Set<string>()
  for (const a of activities) {
    if (!isObj(a) || typeof a.name !== 'string' || a.name.trim() === '' || !isObj(a.defaults)) return 'En aktivitet är ogiltig.'
    const key = a.name.toLowerCase()
    if (seen.has(key)) return `Aktivitetsnamnet "${a.name}" förekommer flera gånger (versaler ignoreras).`
    seen.add(key)
  }
  if (!Array.isArray(weeks)) return 'Veckolistan saknas.'
  for (const w of weeks) {
    if (!isObj(w) || typeof w.id !== 'string' || typeof w.label !== 'string' || !Array.isArray(w.days) || !isObj(w.flags)) return 'En vecka är ogiltig.'
    for (const d of w.days) {
      if (!isObj(d) || typeof d.date !== 'string' || !Array.isArray(d.rows) || !isObj(d.reported)) return `Veckan ${w.label} har en ogiltig dag.`
    }
  }
  return x as unknown as Dataset
}

export function loadStored(): Dataset | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = validateDataset(JSON.parse(raw))
    return typeof parsed === 'string' ? null : parsed
  } catch {
    return null
  }
}

/** Returnerar false om lagringen misslyckades (t.ex. full kvot eller privat läge). */
export function saveStored(ds: Dataset): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(ds))
    return true
  } catch {
    return false
  }
}

export function clearStored(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignoreras */
  }
}

/** Första start: försök läsa seed-filen som `scripts/import_xlsm.py` skapar, annars ett tomt år. */
export async function loadSeedOrEmpty(): Promise<Dataset> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}seed/timecalc.json`)
    if (res.ok) {
      const parsed = validateDataset(await res.json())
      if (typeof parsed !== 'string') return parsed
    }
  } catch {
    /* ingen seed – börja tomt */
  }
  return createEmptyDataset(new Date().getFullYear())
}

export function downloadJson(ds: Dataset): void {
  const blob = new Blob([JSON.stringify(ds, null, 1)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `timecalc-${ds.config.year}.json`
  a.click()
  URL.revokeObjectURL(url)
}
