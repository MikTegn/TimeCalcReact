import { useState } from 'react'
import { useStore } from '../state/store.tsx'

export function ActivityEditor() {
  const { ds, dispatch } = useStore()
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<Record<string, string>>({})

  const commitRename = (from: string) => {
    const to = renaming[from]
    if (to === undefined || to.trim() === from) {
      setRenaming((r) => {
        const { [from]: _, ...rest } = r
        return rest
      })
      return
    }
    dispatch({ type: 'renameActivity', from, to })
    setRenaming((r) => {
      const { [from]: _, ...rest } = r
      return rest
    })
  }

  const addNew = () => {
    const name = newName.trim()
    if (!name) return
    if (ds.activities.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
      setError(`"${name}" finns redan.`)
      return
    }
    dispatch({ type: 'addActivity', activity: { name, defaults: { report: true, bank: true, normal: true }, derivedReport: false } })
    setNewName('')
    setError(null)
  }

  return (
    <div className="panel pad">
      <div className="section-title" style={{ marginTop: 0 }}>
        Aktiviteter
      </div>
      <p className="hint">
        Flaggorna här är standardvärden för nya veckor. Varje vecka kan ha egna flaggor (ändra i veckovyn) om en aktivitet
        tillfälligt inte ska räknas till tidbanken, t.ex.
      </p>
      <table className="activity-table">
        <thead>
          <tr>
            <th>Namn</th>
            <th>Kod</th>
            <th>Rpt</th>
            <th>Bank</th>
            <th>Normal</th>
            <th>Härledd</th>
          </tr>
        </thead>
        <tbody>
          {ds.activities.map((a) => (
            <tr key={a.name}>
              <td>
                <input
                  type="text"
                  value={renaming[a.name] ?? a.name}
                  onChange={(e) => setRenaming((r) => ({ ...r, [a.name]: e.target.value }))}
                  onBlur={() => commitRename(a.name)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
              </td>
              <td style={{ color: 'var(--ink-faint)', fontSize: 12 }}>{a.code ?? ''}</td>
              {(['report', 'bank', 'normal'] as const).map((k) => (
                <td key={k}>
                  <input
                    type="checkbox"
                    checked={a.defaults[k]}
                    onChange={(e) => dispatch({ type: 'setActivityDefault', name: a.name, key: k, value: e.target.checked })}
                  />
                </td>
              ))}
              <td style={{ color: 'var(--ink-faint)', fontSize: 12 }}>{a.derivedReport ? 'ur logg' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="toolbar" style={{ marginTop: 14 }}>
        <input
          type="text"
          placeholder="Ny aktivitet…"
          value={newName}
          onChange={(e) => {
            setNewName(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && addNew()}
          style={{ border: '1px solid var(--line-strong)', borderRadius: 3, padding: '5px 8px', minWidth: 220 }}
        />
        <button className="btn" onClick={addNew}>
          Lägg till
        </button>
      </div>
      {error && <p style={{ color: 'var(--warn)', fontSize: 12.5 }}>{error}</p>}
    </div>
  )
}
