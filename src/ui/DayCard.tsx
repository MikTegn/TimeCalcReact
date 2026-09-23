import { useState } from 'react'
import type { Activity, Day, DayCalc } from '../engine/index.ts'
import { formatDuration, formatTime, parseTime } from '../engine/index.ts'
import { capitalize, weekdayName } from './format.ts'
import { useStore } from '../state/store.tsx'

/** Textfält bundet till en tid (klockslag). Håller ett lokalt utkast så att ogiltig text inte kastas bort medan man skriver. */
function TimeField({ value, onChange, placeholder }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? formatTime(value)
  const invalid = draft !== null && parseTime(draft) === undefined
  return (
    <input
      className={`time-input num${invalid ? ' invalid' : ''}`}
      value={shown}
      placeholder={placeholder ?? '–:–'}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const parsed = draft === null ? undefined : parseTime(draft)
        if (parsed !== undefined) onChange(parsed)
        setDraft(null)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') setDraft(null)
      }}
    />
  )
}

function LogRowEditor({ weekId, dayIdx, rowIdx, activity, end, duration, activities }: {
  weekId: string
  dayIdx: number
  rowIdx: number
  activity: string
  end: number | null
  duration: number | null
  activities: Activity[]
}) {
  const { dispatch } = useStore()
  return (
    <div className="log-row">
      <select value={activity} onChange={(e) => dispatch({ type: 'setRow', week: weekId, day: dayIdx, row: rowIdx, patch: { activity: e.target.value } })}>
        <option value="">– aktivitet –</option>
        {activities.map((a) => (
          <option key={a.name} value={a.name}>
            {a.name}
          </option>
        ))}
      </select>
      <TimeField value={end} onChange={(v) => dispatch({ type: 'setRow', week: weekId, day: dayIdx, row: rowIdx, patch: { end: v } })} />
      <span className={`dur num${duration !== null && duration < 0 ? ' neg' : ''}`}>{duration !== null ? formatDuration(duration) : ''}</span>
      <button className="row-remove" title="Ta bort raden" onClick={() => dispatch({ type: 'removeRow', week: weekId, day: dayIdx, row: rowIdx })}>
        ×
      </button>
    </div>
  )
}

export function DayCard({ weekId, dayIdx, day, calc, activities }: { weekId: string; dayIdx: number; day: Day; calc: DayCalc; activities: Activity[] }) {
  const { dispatch } = useStore()
  return (
    <div className={`day-card${day.workday ? '' : ' rest'}`}>
      <div className="day-head">
        <span className="name">{capitalize(weekdayName(day.date))}</span>
        <span className="date num">{day.date.slice(8, 10)}/{day.date.slice(5, 7)}</span>
      </div>
      <div className="day-body">
        <label className="day-toggle">
          <input type="checkbox" checked={day.workday} onChange={(e) => dispatch({ type: 'setWorkday', week: weekId, day: dayIdx, value: e.target.checked })} />
          Arbetsdag
        </label>
        <div className="start-row" style={{ marginTop: 6 }}>
          Start
          <TimeField value={day.start} onChange={(v) => dispatch({ type: 'setStart', week: weekId, day: dayIdx, value: v })} />
        </div>
        {day.rows.map((row, i) => (
          <LogRowEditor
            key={i}
            weekId={weekId}
            dayIdx={dayIdx}
            rowIdx={i}
            activity={row.activity}
            end={row.end}
            duration={calc.durations[i] ?? null}
            activities={activities}
          />
        ))}
        {day.rows.length < 21 && (
          <button className="add-row" onClick={() => dispatch({ type: 'addRow', week: weekId, day: dayIdx })}>
            + rad
          </button>
        )}
      </div>
      <div className="day-foot">
        <span>Loggat</span>
        <span className="num">{formatDuration(calc.summed)}</span>
      </div>
    </div>
  )
}
