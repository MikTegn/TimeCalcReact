import { formatHours, formatSigned } from '../engine/index.ts'
import { useStore } from '../state/store.tsx'

const signClass = (n: number) => (n > 5e-10 ? 'pos' : n < -5e-10 ? 'neg' : '')

export function YearOverview({ currentWeek, onSelectWeek }: { currentWeek: string; onSelectWeek: (id: string) => void }) {
  const { ds, year } = useStore()
  const activitiesWithHours = ds.activities.filter((a) => Math.abs(year.activityTotals[a.name] ?? 0) > 1e-9)

  return (
    <div>
      <div className="panel pad" style={{ marginBottom: 20 }}>
        <div className="section-title" style={{ marginTop: 0 }}>
          Veckor
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="overview-table">
            <thead>
              <tr>
                <th>Vecka</th>
                <th>Förväntad</th>
                <th>Tidbank</th>
                <th>Diff</th>
                <th>Saldo</th>
                <th>Normaltid diff</th>
                <th>Varningar</th>
              </tr>
            </thead>
            <tbody>
              {year.rows.map((r, i) => (
                <tr key={r.id} className={r.id === currentWeek ? 'current' : ''} onClick={() => onSelectWeek(r.id)}>
                  <td>{r.label}</td>
                  <td className="num">{formatHours(r.expectedHours)}</td>
                  <td className="num">{formatHours(r.bankHours)}</td>
                  <td className={`num ${signClass(r.bankDiff)}`}>{formatSigned(r.bankDiff)}</td>
                  <td className={`num ${signClass(r.bankBalance)}`}>{formatHours(r.bankBalance)}</td>
                  <td className={`num ${signClass(r.normalDiff)}`}>{formatSigned(r.normalDiff)}</td>
                  <td className="num">{year.weeks[i].warnings.length || ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Slutsaldo</td>
                <td />
                <td />
                <td />
                <td className={`num ${signClass(year.finalBankBalance)}`}>{formatHours(year.finalBankBalance)}</td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="panel pad">
        <div className="section-title" style={{ marginTop: 0 }}>
          Summa per aktivitet
        </div>
        <table className="overview-table">
          <thead>
            <tr>
              <th>Aktivitet</th>
              <th>Timmar</th>
            </tr>
          </thead>
          <tbody>
            {activitiesWithHours.map((a) => (
              <tr key={a.name}>
                <td>{a.name}</td>
                <td className="num">{formatHours(year.activityTotals[a.name])}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Totalt</td>
              <td className="num">{formatHours(year.grandTotalHours)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
