import { useMemo } from 'react'
import { calcWeek } from '../engine/index.ts'
import { formatHours, formatSigned } from '../engine/index.ts'
import { dateRange } from './format.ts'
import { DayCard } from './DayCard.tsx'
import { ReportedTable } from './ReportedTable.tsx'
import { WarningsList } from './WarningsList.tsx'
import { useStore } from '../state/store.tsx'

const signClass = (n: number) => (n > 5e-10 ? 'pos' : n < -5e-10 ? 'neg' : '')

export function WeekView({ weekId, onSelectWeek }: { weekId: string; onSelectWeek: (id: string) => void }) {
  const { ds, dispatch, year } = useStore()
  const idx = ds.weeks.findIndex((w) => w.id === weekId)
  const week = ds.weeks[idx]
  const calc = useMemo(() => calcWeek(week, ds.activities, ds.config), [week, ds.activities, ds.config])
  const balance = year.rows[idx]?.bankBalance ?? 0

  if (!week) return null

  return (
    <div>
      <div className="week-nav">
        <button className="btn btn-small" disabled={idx === 0} onClick={() => onSelectWeek(ds.weeks[idx - 1].id)}>
          ← Föreg.
        </button>
        <select value={weekId} onChange={(e) => onSelectWeek(e.target.value)}>
          {ds.weeks.map((w) => (
            <option key={w.id} value={w.id}>
              {w.label}
            </option>
          ))}
        </select>
        <span className="range">{dateRange(week.days[0]?.date ?? '', week.days[week.days.length - 1]?.date ?? '')}</span>
        <button className="btn btn-small" disabled={idx === ds.weeks.length - 1} onClick={() => onSelectWeek(ds.weeks[idx + 1].id)}>
          Nästa →
        </button>
        <span className="spacer" />
        <button className="btn btn-small" onClick={() => dispatch({ type: 'applyDefaultWeek', week: weekId })}>
          Fyll standardvecka
        </button>
        <button className="btn btn-small btn-danger" onClick={() => dispatch({ type: 'clearReported', week: weekId })}>
          Töm rapporterat
        </button>
      </div>

      <div className="week-summary">
        <div className="cell">
          <div className="label">Förväntad tid</div>
          <div className="value num">{formatHours(calc.expectedHours)} h</div>
        </div>
        <div className="cell">
          <div className="label">Tidbank denna vecka</div>
          <div className={`value num ${signClass(calc.bankDiff)}`}>{formatSigned(calc.bankDiff)} h</div>
        </div>
        <div className="cell">
          <div className="label">Tidbank totalt</div>
          <div className={`value num ${signClass(balance)}`}>{formatHours(balance)} h</div>
        </div>
        <div className="cell">
          <div className="label">Normaltid, avvikelse</div>
          <div className={`value num ${signClass(calc.normalDiff)}`}>{formatSigned(calc.normalDiff)} h</div>
        </div>
        <div className="cell">
          <div className="label">Rpt.Tid</div>
          <div className="value num">{formatHours(calc.rptHours)} h</div>
        </div>
      </div>

      <div className="day-grid">
        {week.days.map((d, i) => (
          <DayCard key={d.date} weekId={weekId} dayIdx={i} day={d} calc={calc.days[i]} activities={ds.activities} />
        ))}
      </div>

      <ReportedTable weekId={weekId} activities={ds.activities} calc={calc} />

      <div className="section-title">Kontroll</div>
      <WarningsList calc={calc} />
    </div>
  )
}
