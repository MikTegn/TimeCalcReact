import type { Dataset, YearCalc, YearRow } from './types.ts'
import { calcWeek } from './week.ts'

/**
 * Motsvarar bladet Overview: förväntad tid, tidbanksdifferens och löpande saldo per vecka
 * samt årssummor per aktivitet.
 *
 * Tidbanken räknas från varje veckas egna flaggor (kolumn B i veckobladet). Originalets Overview har
 * en separat global flaggrad ("Till tidbank: x") som kan avvika – se README.
 */
export function calcYear(ds: Dataset): YearCalc {
  const weeks = ds.weeks.map((w) => calcWeek(w, ds.activities, ds.config))

  let bank = ds.config.openingBank
  let normal = ds.config.openingBank
  const rows: YearRow[] = weeks.map((w) => {
    bank += w.bankDiff
    normal += w.normalDiff
    return {
      id: w.id,
      label: w.label,
      expectedHours: w.expectedHours,
      bankHours: w.bankHours,
      bankDiff: w.bankDiff,
      bankBalance: bank,
      normalDiff: w.normalDiff,
      normalBalance: normal,
    }
  })

  const activityTotals: Record<string, number> = {}
  for (const act of ds.activities) {
    activityTotals[act.name] = weeks.reduce((acc, w) => acc + (w.activities.find((a) => a.name === act.name)?.reported ?? 0), 0)
  }
  const grandTotalHours = Object.values(activityTotals).reduce((a, b) => a + b, 0)

  return { weeks, rows, activityTotals, grandTotalHours, finalBankBalance: bank }
}
