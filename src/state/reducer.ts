import {
  addActivity,
  applyDefaultWorkLog,
  clearReported,
  DEFAULT_DAY_TEMPLATE,
  MAX_LOG_ROWS,
  renameActivity,
} from '../engine/index.ts'
import type { Activity, Config, Dataset, Day, Flags, LogRow, Week } from '../engine/index.ts'

export type Action =
  | { type: 'load'; ds: Dataset }
  | { type: 'setWorkday'; week: string; day: number; value: boolean }
  | { type: 'setStart'; week: string; day: number; value: number | null }
  | { type: 'setRow'; week: string; day: number; row: number; patch: Partial<LogRow> }
  | { type: 'addRow'; week: string; day: number }
  | { type: 'removeRow'; week: string; day: number; row: number }
  | { type: 'setReported'; week: string; day: number; activity: string; value: number | null }
  | { type: 'setFlag'; week: string; activity: string; key: keyof Flags; value: boolean }
  | { type: 'applyDefaultWeek'; week: string }
  | { type: 'clearReported'; week: string }
  | { type: 'setConfig'; patch: Partial<Config> }
  | { type: 'renameActivity'; from: string; to: string }
  | { type: 'addActivity'; activity: Activity }
  | { type: 'setActivityDefault'; name: string; key: keyof Flags; value: boolean }

function mapWeek(ds: Dataset, id: string, fn: (w: Week) => Week): Dataset {
  return { ...ds, weeks: ds.weeks.map((w) => (w.id === id ? fn(w) : w)) }
}

function mapDay(ds: Dataset, weekId: string, dayIdx: number, fn: (d: Day) => Day): Dataset {
  return mapWeek(ds, weekId, (w) => ({ ...w, days: w.days.map((d, i) => (i === dayIdx ? fn(d) : d)) }))
}

export function reducer(ds: Dataset, a: Action): Dataset {
  switch (a.type) {
    case 'load':
      return a.ds
    case 'setWorkday':
      return mapDay(ds, a.week, a.day, (d) => ({ ...d, workday: a.value }))
    case 'setStart':
      return mapDay(ds, a.week, a.day, (d) => ({ ...d, start: a.value }))
    case 'setRow':
      return mapDay(ds, a.week, a.day, (d) => ({ ...d, rows: d.rows.map((r, i) => (i === a.row ? { ...r, ...a.patch } : r)) }))
    case 'addRow':
      return mapDay(ds, a.week, a.day, (d) => (d.rows.length >= MAX_LOG_ROWS ? d : { ...d, rows: [...d.rows, { activity: '', end: null }] }))
    case 'removeRow':
      return mapDay(ds, a.week, a.day, (d) => ({ ...d, rows: d.rows.filter((_, i) => i !== a.row) }))
    case 'setReported':
      return mapDay(ds, a.week, a.day, (d) => {
        const reported = { ...d.reported }
        if (a.value === null) delete reported[a.activity]
        else reported[a.activity] = a.value
        return { ...d, reported }
      })
    case 'setFlag':
      return mapWeek(ds, a.week, (w) => {
        const base = w.flags[a.activity] ?? ds.activities.find((x) => x.name === a.activity)?.defaults ?? { report: false, bank: false, normal: false }
        return { ...w, flags: { ...w.flags, [a.activity]: { ...base, [a.key]: a.value } } }
      })
    case 'applyDefaultWeek':
      return mapWeek(ds, a.week, (w) => applyDefaultWorkLog(w, ds.activities, ds.config.defaultDay ?? DEFAULT_DAY_TEMPLATE).week)
    case 'clearReported':
      return mapWeek(ds, a.week, clearReported)
    case 'setConfig':
      return { ...ds, config: { ...ds.config, ...a.patch } }
    case 'renameActivity':
      return renameActivity(ds, a.from, a.to) ?? ds
    case 'addActivity':
      return addActivity(ds, a.activity) ?? ds
    case 'setActivityDefault':
      return { ...ds, activities: ds.activities.map((x) => (x.name === a.name ? { ...x, defaults: { ...x.defaults, [a.key]: a.value } } : x)) }
  }
}
