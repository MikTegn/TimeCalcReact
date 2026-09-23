import type { WeekCalc } from '../engine/index.ts'
import { describeWarning } from './format.ts'

const LABELS: Record<string, string> = {
  dayActivity: 'DAG',
  dayTotal: 'DAG',
  activityWeek: 'VECKA',
  rptWeek: 'VECKA',
  normalDiff: 'NORMALTID',
  unmapped: 'OKÄND TID',
  regVsReported: 'AVVIKELSE',
  negativeDuration: 'FEL',
}

export function WarningsList({ calc }: { calc: WeekCalc }) {
  if (calc.warnings.length === 0) {
    return (
      <div className="all-clear">
        <span>✓</span> Inga avvikelser den här veckan.
      </div>
    )
  }
  return (
    <div className="warnings">
      {calc.warnings.map((w, i) => (
        <div className="warning-item" key={i}>
          <span className="mark">{LABELS[w.code]}</span>
          <span>{describeWarning(w, calc)}</span>
        </div>
      ))}
    </div>
  )
}
