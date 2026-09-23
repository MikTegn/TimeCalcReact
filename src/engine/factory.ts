import type { Activity, Config, Dataset, Day, DayTemplate, Flags, Week } from './types.ts'
import { sameName } from './time.ts'

/** Standardvecka från makrot SetupDefaultWorkLog: 9:00, 12:00 arbete, 13:00 lunch, 17:42 arbete, 7,7 h rapporterat. */
export const DEFAULT_DAY_TEMPLATE: DayTemplate = {
  start: 9 * 60,
  rows: [
    { activity: 'MT Amodo', end: 12 * 60 },
    { activity: 'Lunch', end: 13 * 60 },
    { activity: 'MT Amodo', end: 17 * 60 + 42 },
  ],
  reportedActivity: 'MT Amodo',
  reportedHours: 38.5 / 5,
}

export const DEFAULT_CONFIG: Omit<Config, 'year'> = { weeklyHours: 38.5, workdaysPerWeek: 5, openingBank: 0 }

/** Minsta möjliga aktivitetslista för ett tomt dataset. */
export const STARTER_ACTIVITIES: Activity[] = [
  { name: 'Arbete', defaults: { report: true, bank: true, normal: true }, derivedReport: false },
  { name: 'Semester', defaults: { report: true, bank: true, normal: true }, derivedReport: false },
  { name: 'Sjuk', defaults: { report: true, bank: false, normal: false }, derivedReport: false },
  { name: 'Lunch', defaults: { report: false, bank: false, normal: false }, derivedReport: true },
]

const pad2 = (n: number) => String(n).padStart(2, '0')
const isoDate = (t: number) => new Date(t).toISOString().slice(0, 10)
const DAY_MS = 24 * 3600 * 1000

/** Måndagen i ISO-vecka 1 (UTC, så sommartid inte spelar in). */
function isoWeekOneMonday(year: number): number {
  const jan4 = Date.UTC(year, 0, 4)
  const dow = (new Date(jan4).getUTCDay() + 6) % 7 // måndag = 0
  return jan4 - dow * DAY_MS
}

export function flagsFromDefaults(activities: Activity[]): Record<string, Flags> {
  return Object.fromEntries(activities.map((a) => [a.name, { ...a.defaults }]))
}

export function createEmptyWeek(id: string, label: string, mondayMs: number, activities: Activity[]): Week {
  const days: Day[] = Array.from({ length: 5 }, (_, i) => ({
    date: isoDate(mondayMs + i * DAY_MS),
    workday: true,
    forceRegistered: false,
    start: null,
    rows: [],
    reported: {},
  }))
  return { id, label, days, flags: flagsFromDefaults(activities) }
}

/**
 * Tomt år med samma veckoindelning som originalet: V01 börjar på måndagen i ISO-vecka 1 och veckor
 * skapas så länge måndagen infaller under året (2025 ger 53 veckor; V53 börjar 29 dec).
 */
export function createEmptyDataset(year: number, activities: Activity[] = STARTER_ACTIVITIES, config: Partial<Config> = {}): Dataset {
  const weeks: Week[] = []
  const lastDay = Date.UTC(year, 11, 31)
  for (let monday = isoWeekOneMonday(year), n = 1; monday <= lastDay; monday += 7 * DAY_MS, n++) {
    const label = `V${pad2(n)}`
    weeks.push(createEmptyWeek(label, label, monday, activities))
  }
  return { version: 1, config: { ...DEFAULT_CONFIG, ...config, year }, activities, weeks }
}

/**
 * Makrot SetupDefaultWorkLog: fyller arbetsdagarna med standardloggen och rapporterar
 * standardtimmar på mallens aktivitet. Aktiviteter som saknas i listan hoppas över (returneras i `skipped`).
 */
export function applyDefaultWorkLog(
  week: Week,
  activities: Activity[],
  template: DayTemplate = DEFAULT_DAY_TEMPLATE,
): { week: Week; skipped: string[] } {
  const known = (name: string) => activities.some((a) => sameName(a.name, name))
  const skipped = new Set<string>()
  const rows = template.rows.filter((r) => (known(r.activity) ? true : (skipped.add(r.activity), false)))
  const canReport = known(template.reportedActivity)
  if (!canReport) skipped.add(template.reportedActivity)
  const reportedName = activities.find((a) => sameName(a.name, template.reportedActivity))?.name

  const days = week.days.map((d) => {
    if (!d.workday) return d
    return {
      ...d,
      start: template.start,
      rows: rows.map((r) => ({ activity: activities.find((a) => sameName(a.name, r.activity))!.name, end: r.end })),
      reported: reportedName ? { ...d.reported, [reportedName]: template.reportedHours } : d.reported,
    }
  })
  return { week: { ...week, days }, skipped: [...skipped] }
}

/** Makrot ClearDefaultReportTimes: tömmer alla manuellt rapporterade timmar i veckan. */
export function clearReported(week: Week): Week {
  return { ...week, days: week.days.map((d) => ({ ...d, reported: {} })) }
}

/** Byter namn på en aktivitet överallt (loggrader, rapporterade timmar, flaggor). Returnerar null om namnet är ogiltigt/upptaget. */
export function renameActivity(ds: Dataset, oldName: string, newName: string): Dataset | null {
  const name = newName.trim()
  if (name === '' || ds.activities.some((a) => a.name !== oldName && sameName(a.name, name))) return null
  const swap = (s: string) => (s === oldName ? name : s)
  return {
    ...ds,
    activities: ds.activities.map((a) => (a.name === oldName ? { ...a, name } : a)),
    weeks: ds.weeks.map((w) => ({
      ...w,
      flags: Object.fromEntries(Object.entries(w.flags).map(([k, v]) => [swap(k), v])),
      days: w.days.map((d) => ({
        ...d,
        rows: d.rows.map((r) => ({ ...r, activity: swap(r.activity) })),
        reported: Object.fromEntries(Object.entries(d.reported).map(([k, v]) => [swap(k), v])),
      })),
    })),
  }
}

/** Lägger till en aktivitet och ger alla veckor dess standardflaggor. Returnerar null om namnet är ogiltigt/upptaget. */
export function addActivity(ds: Dataset, activity: Activity): Dataset | null {
  const name = activity.name.trim()
  if (name === '' || ds.activities.some((a) => sameName(a.name, name))) return null
  return {
    ...ds,
    activities: [...ds.activities, { ...activity, name }],
    weeks: ds.weeks.map((w) => ({ ...w, flags: { ...w.flags, [name]: { ...activity.defaults } } })),
  }
}
