import { useRef, useState } from 'react'
import { useStore } from '../state/store.tsx'
import { validateDataset, downloadJson } from '../state/storage.ts'
import { WeekView } from './WeekView.tsx'
import { YearOverview } from './YearOverview.tsx'
import { ActivityEditor } from './ActivityEditor.tsx'

type Tab = 'week' | 'year' | 'activities'

/** Veckan som innehåller dagens datum, om den finns i datasetet. */
function findTodayWeekId(ds: ReturnType<typeof useStore>['ds']): string | null {
  const today = new Date().toISOString().slice(0, 10)
  for (const w of ds.weeks) {
    const dates = w.days.map((d) => d.date)
    if (dates.length && today >= dates[0] && today <= dates[dates.length - 1]) return w.id
  }
  return null
}

export function App() {
  const { ds, year, dispatch, saveFailed, resetToSeed } = useStore()
  const [tab, setTab] = useState<Tab>('week')
  const [weekId, setWeekId] = useState<string>(() => findTodayWeekId(ds) ?? ds.weeks[0]?.id ?? '')
  const [importError, setImportError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const activeWeek = ds.weeks.some((w) => w.id === weekId) ? weekId : ds.weeks[0]?.id ?? ''

  const handleImport = (file: File) => {
    file
      .text()
      .then((text) => {
        const parsed = validateDataset(JSON.parse(text))
        if (typeof parsed === 'string') {
          setImportError(parsed)
          return
        }
        setImportError(null)
        dispatch({ type: 'load', ds: parsed })
        setWeekId(parsed.weeks[0]?.id ?? '')
      })
      .catch(() => setImportError('Kunde inte läsa filen – är det giltig JSON?'))
  }

  const totalWarnings = year.weeks.reduce((acc, w) => acc + w.warnings.length, 0)

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <h1>TimeCalc</h1>
          <span className="year num">{ds.config.year}</span>
        </div>
        <div className="app-actions">
          <span className={`save-status${saveFailed ? ' failed' : ''}`}>{saveFailed ? 'Sparades inte lokalt' : 'Sparat lokalt'}</span>
          <button className="btn btn-small" onClick={() => downloadJson(ds)}>
            Exportera
          </button>
          <button className="btn btn-small" onClick={() => fileInput.current?.click()}>
            Importera
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleImport(file)
              e.target.value = ''
            }}
          />
          <button
            className="btn btn-small btn-danger"
            onClick={() => {
              if (confirm('Rensa alla lokala ändringar och börja om från utgångsdata?')) void resetToSeed()
            }}
          >
            Börja om
          </button>
        </div>
      </header>

      {importError && (
        <div className="warning-item" style={{ marginBottom: 14 }}>
          <span className="mark">IMPORT</span>
          <span>{importError}</span>
        </div>
      )}

      <nav className="tabs">
        <button className={`tab${tab === 'week' ? ' active' : ''}`} onClick={() => setTab('week')}>
          Vecka
        </button>
        <button className={`tab${tab === 'year' ? ' active' : ''}`} onClick={() => setTab('year')}>
          Översikt {totalWarnings > 0 && <span style={{ color: 'var(--warn)' }}>({totalWarnings})</span>}
        </button>
        <button className={`tab${tab === 'activities' ? ' active' : ''}`} onClick={() => setTab('activities')}>
          Aktiviteter
        </button>
      </nav>

      {ds.weeks.length === 0 ? (
        <div className="empty-state">Inga veckor i det här datasetet.</div>
      ) : tab === 'week' ? (
        <WeekView weekId={activeWeek} onSelectWeek={setWeekId} />
      ) : tab === 'year' ? (
        <YearOverview
          currentWeek={activeWeek}
          onSelectWeek={(id) => {
            setWeekId(id)
            setTab('week')
          }}
        />
      ) : (
        <ActivityEditor />
      )}
    </div>
  )
}
