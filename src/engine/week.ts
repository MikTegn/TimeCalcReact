import type {
  Activity,
  ActivityCalc,
  Config,
  Day,
  DayCalc,
  Flags,
  Minutes,
  Warning,
  Week,
  WeekCalc,
} from './types.ts'
import { decimalHoursToTimeMinutes, minutesToHours, sameName, timeAsDecimalHours } from './time.ts'

/** Tidsloggen har rad 25–45 i originalet; fler rader räknas inte. */
export const MAX_LOG_ROWS = 21

/** Gränser från villkorsformateringen i arbetsboken. */
export const TOLERANCE = {
  activityHours: 0.25,
  dayTotalHours: 0.5,
  weekRegVsReportedHours: 0.5,
} as const

const EPS = 1e-9

/**
 * Varaktighet per loggrad: I25 = H25 − H24 om båda är tider, annars tom.
 * En rad utan tid bryter kedjan – raden efter får ingen varaktighet.
 */
export function durationsOf(day: Pick<Day, 'start' | 'rows'>): (Minutes | null)[] {
  const out: (Minutes | null)[] = []
  let prev: Minutes | null = day.start
  for (const row of day.rows.slice(0, MAX_LOG_ROWS)) {
    out.push(prev !== null && row.end !== null ? row.end - prev : null)
    prev = row.end
  }
  return out
}

export function flagsFor(week: Week, activity: Activity): Flags {
  return week.flags[activity.name] ?? activity.defaults
}

function calcDay(day: Day, activities: Activity[], flagsOf: (a: Activity) => Flags): DayCalc {
  const durations = durationsOf(day)
  const rows = day.rows.slice(0, MAX_LOG_ROWS)

  const registered: Record<string, Minutes | null> = {}
  const reported: Record<string, number | null> = {}
  let summed = 0
  let rptRegistered = 0
  let rptReported = 0
  let reportedAll = 0

  for (const act of activities) {
    // SUMIF(G25:G45, aktivitet, I25:I45)
    let sum = 0
    if (act.name !== '') {
      rows.forEach((row, i) => {
        const d = durations[i]
        if (d !== null && sameName(row.activity, act.name)) sum += d
      })
    }

    const manual = act.derivedReport ? undefined : day.reported[act.name]
    // H4 visas om något rapporterats eller något loggats. Lunch (H21) visas bara om något loggats.
    const shown = act.derivedReport ? sum !== 0 : manual !== undefined || sum !== 0
    registered[act.name] = shown ? sum : null
    reported[act.name] = act.derivedReport ? (shown ? timeAsDecimalHours(sum) : null) : (manual ?? null)

    summed += registered[act.name] ?? 0
    reportedAll += reported[act.name] ?? 0
    if (flagsOf(act).report) {
      rptRegistered += registered[act.name] ?? 0
      rptReported += reported[act.name] ?? 0
    }
  }

  return {
    date: day.date,
    workday: day.workday,
    countsRegistered: day.workday || day.forceRegistered,
    durations,
    registered,
    reported,
    summed,
    totalDuration: durations.reduce<number>((acc, d) => acc + (d ?? 0), 0),
    rptRegistered,
    rptReported,
    reportedAll,
  }
}

export function calcWeek(week: Week, activities: Activity[], config: Config): WeekCalc {
  const flagsOf = (a: Activity) => flagsFor(week, a)
  const days = week.days.map((d) => calcDay(d, activities, flagsOf))

  // E4:F21 – per aktivitet över veckan
  const acts: ActivityCalc[] = activities.map((act) => {
    let reg = 0
    let rep = 0
    for (const d of days) {
      if (d.countsRegistered) reg += d.registered[act.name] ?? 0
      if (d.workday) rep += d.reported[act.name] ?? 0
    }
    const named = act.name !== ''
    return {
      name: act.name,
      flags: flagsOf(act),
      registered: named && reg !== 0 ? reg : null,
      reported: named && rep !== 0 ? rep : null,
    }
  })

  const sumReported = (pick: (f: Flags) => boolean) =>
    acts.reduce((acc, a) => (pick(a.flags) ? acc + (a.reported ?? 0) : acc), 0)

  const workdays = week.days.slice(0, config.workdaysPerWeek).filter((d) => d.workday).length
  const expectedHours = (config.weeklyHours * workdays) / config.workdaysPerWeek

  const rptHours = sumReported((f) => f.report)
  const bankHours = sumReported((f) => f.bank)
  const normalHours = sumReported((f) => f.normal)
  const rptRegistered = days.reduce((acc, d) => (d.countsRegistered ? acc + d.rptRegistered : acc), 0)

  const registered = days.reduce((acc, d) => acc + d.totalDuration, 0)
  const summed = days.reduce((acc, d) => acc + d.summed, 0)
  const reportedHours = days.reduce((acc, d) => acc + d.reportedAll, 0)
  const reportedAsTime = decimalHoursToTimeMinutes(reportedHours)

  const calc: WeekCalc = {
    id: week.id,
    label: week.label,
    days,
    activities: acts,
    workdays,
    expectedHours,
    rptHours,
    rptRegistered,
    bankHours,
    normalHours,
    bankDiff: bankHours - expectedHours,
    normalDiff: normalHours - expectedHours,
    registered,
    summed,
    unmapped: registered - summed,
    reportedHours,
    reportedAsTime,
    regVsReported: Math.abs(registered - reportedAsTime),
    warnings: [],
  }
  calc.warnings = collectWarnings(activities, calc)
  return calc
}

/** Återskapar villkorsformateringen ("Field warning") i veckobladen. */
function collectWarnings(activities: Activity[], calc: WeekCalc): Warning[] {
  const out: Warning[] = []

  calc.days.forEach((d, day) => {
    // I4:I20 – tom rapporterad cell räknas som 0, men bara om loggad tid finns (H4 visas)
    for (const act of activities) {
      if (act.derivedReport) continue
      const reg = d.registered[act.name]
      if (reg === null) continue
      const rep = d.reported[act.name] ?? 0
      const a = rep
      const b = minutesToHours(reg)
      if (Math.abs(a - b) > TOLERANCE.activityHours + EPS) out.push({ code: 'dayActivity', day, activity: act.name, a, b })
    }
    // I22
    const a = d.rptReported
    const b = minutesToHours(d.rptRegistered)
    if (Math.abs(a - b) > TOLERANCE.dayTotalHours + EPS) out.push({ code: 'dayTotal', day, a, b })

    if (d.durations.some((x) => x !== null && x < 0)) out.push({ code: 'negativeDuration', day })
  })

  // F4:F21 – båda cellerna måste ha värde, annars blir formeln ett fel och ingen markering visas
  for (const act of calc.activities) {
    if (act.registered === null || act.reported === null) continue
    const b = minutesToHours(act.registered)
    if (Math.abs(act.reported - b) > TOLERANCE.activityHours + EPS)
      out.push({ code: 'activityWeek', activity: act.name, a: act.reported, b })
  }

  // F22
  if (Math.abs(calc.rptHours - minutesToHours(calc.rptRegistered)) > TOLERANCE.activityHours + EPS)
    out.push({ code: 'rptWeek', a: calc.rptHours, b: minutesToHours(calc.rptRegistered) })

  // C24
  if (Math.abs(calc.normalDiff) > EPS) out.push({ code: 'normalDiff', a: calc.normalDiff })

  // E34
  if (Math.abs(calc.unmapped) > EPS) out.push({ code: 'unmapped', a: calc.unmapped })

  // E37
  if (minutesToHours(calc.regVsReported) > TOLERANCE.weekRegVsReportedHours + EPS)
    out.push({ code: 'regVsReported', a: minutesToHours(calc.registered), b: minutesToHours(calc.reportedAsTime) })

  return out
}
