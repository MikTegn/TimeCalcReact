import { useState } from 'react'
import type { Activity, Flags, WeekCalc } from '../engine/index.ts'
import { formatHours, minutesToHours, parseHours } from '../engine/index.ts'
import { plainHours } from './format.ts'
import { useStore } from '../state/store.tsx'

function HoursField({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? plainHours(value)
  return (
    <input
      className="hours num"
      value={shown}
      placeholder="–"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const parsed = draft === null ? undefined : parseHours(draft)
        if (parsed !== undefined) onChange(parsed)
        setDraft(null)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

/** Rapporterade timmar för en dag, en aktivitet i taget – och veckans A/B/C-flaggor. */
export function ReportedTable({ weekId, activities, calc }: { weekId: string; activities: Activity[]; calc: WeekCalc }) {
  const { ds, dispatch } = useStore()
  const week = ds.weeks.find((w) => w.id === weekId)!
  const flagsOf = (name: string): Flags => week.flags[name] ?? activities.find((a) => a.name === name)!.defaults

  return (
    <div className="panel pad" style={{ marginBottom: 20 }}>
      <div className="section-title">Rapporterade timmar</div>
      <div style={{ overflowX: 'auto' }}>
        <table className="reported-table">
          <thead>
            <tr>
              <th>Aktivitet</th>
              {calc.days.map((d, i) => (
                <th key={i} className="num" style={{ textAlign: 'center' }}>
                  {d.date.slice(8, 10)}/{d.date.slice(5, 7)}
                </th>
              ))}
              <th className="num" style={{ textAlign: 'right' }}>
                Vecka
              </th>
              <th>Räknas till</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((act) => {
              const wk = calc.activities.find((a) => a.name === act.name)!
              const flags = flagsOf(act.name)
              return (
                <tr key={act.name}>
                  <td>{act.name}</td>
                  {calc.days.map((d, i) => (
                    <td key={i} style={{ textAlign: 'center' }}>
                      {act.derivedReport ? (
                        <span className="num" style={{ color: 'var(--ink-faint)' }}>
                          {d.reported[act.name] !== null ? formatHours(d.reported[act.name]) : ''}
                        </span>
                      ) : (
                        <HoursField
                          value={ds.weeks.find((w) => w.id === weekId)!.days[i].reported[act.name] ?? null}
                          onChange={(v) => dispatch({ type: 'setReported', week: weekId, day: i, activity: act.name, value: v })}
                        />
                      )}
                    </td>
                  ))}
                  <td className="num" style={{ textAlign: 'right' }}>
                    {wk.reported !== null ? formatHours(wk.reported) : ''}
                    {wk.registered !== null && wk.reported !== null && Math.abs(wk.reported - minutesToHours(wk.registered)) > 0.25 + 1e-9 && (
                      <span className="diff neg"> (logg {formatHours(minutesToHours(wk.registered))})</span>
                    )}
                  </td>
                  <td>
                    {(['report', 'bank', 'normal'] as const).map((k) => (
                      <label key={k} className="flag-check">
                        <input
                          type="checkbox"
                          checked={flags[k]}
                          onChange={(e) => dispatch({ type: 'setFlag', week: weekId, activity: act.name, key: k, value: e.target.checked })}
                        />
                        {k === 'report' ? 'Rpt' : k === 'bank' ? 'Bank' : 'Normal'}
                      </label>
                    ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
