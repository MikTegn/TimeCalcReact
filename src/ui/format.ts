import { formatDuration, formatHours, formatSigned } from '../engine/index.ts'
import type { Warning, WeekCalc } from '../engine/index.ts'

const WEEKDAYS = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

const parse = (iso: string) => new Date(`${iso}T00:00:00Z`)

export function weekdayName(iso: string): string {
  return WEEKDAYS[parse(iso).getUTCDay()]
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "6 jan" */
export function shortDate(iso: string): string {
  const d = parse(iso)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/** "30 dec – 3 jan" */
export function dateRange(fromIso: string, toIso: string): string {
  return `${shortDate(fromIso)} – ${shortDate(toIso)}`
}

/** Decimaltimme till text utan avrundning utöver 4 decimaler, med komma ("7,7"). För inmatningsfält. */
export function plainHours(h: number | null | undefined): string {
  if (h === null || h === undefined) return ''
  return String(Number(h.toFixed(4))).replace('.', ',')
}

/** Nyckel för att slå upp en varning för en aktivitet en viss dag. */
export const dayActivityKey = (day: number, activity: string) => `${day}:${activity}`

export function describeWarning(w: Warning, week: WeekCalc): string {
  const dayName = w.day !== undefined ? capitalize(weekdayName(week.days[w.day].date)) : ''
  const h = (x: number | undefined) => formatHours(x ?? 0)
  switch (w.code) {
    case 'dayActivity':
      return `${dayName}, ${w.activity}: rapporterat ${h(w.a)} h men loggat ${h(w.b)} h`
    case 'dayTotal':
      return `${dayName}: rapporterat ${h(w.a)} h men loggat ${h(w.b)} h (aktiviteter som räknas i Rpt)`
    case 'activityWeek':
      return `${w.activity}: rapporterat ${h(w.a)} h över veckan men loggat ${h(w.b)} h`
    case 'rptWeek':
      return `Veckans Rpt-tid: rapporterat ${h(w.a)} h men loggat ${h(w.b)} h`
    case 'normalDiff':
      return `Normaltiden avviker ${formatSigned(w.a ?? 0)} h från förväntad tid`
    case 'unmapped':
      return `${formatDuration(w.a ?? 0)} loggad tid hör inte till någon aktivitet i listan (fel namn eller tom aktivitet)`
    case 'regVsReported':
      return `Loggad tid (${h(w.a)} h) och rapporterad tid (${h(w.b)} h) skiljer sig med mer än 0,5 h`
    case 'negativeDuration':
      return `${dayName}: en sluttid ligger före föregående tid`
  }
}
