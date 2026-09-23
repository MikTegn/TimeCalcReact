/**
 * Jämför motorn med Excels egna beräknade värden för varje vecka i arbetsboken.
 * Kräver att `python3 scripts/import_xlsm.py <fil.xlsm>` har körts (data/timecalc-<år>.json + data/expected-<år>.json).
 * Saknas datafilerna hoppas testerna över.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { calcYear } from '../src/engine/index.ts'
import type { Dataset, Warning } from '../src/engine/index.ts'

interface Expected {
  anomalies: { sheet: string; cell: string; expectedFormula: string; found: string | null }[]
  weeks: Record<string, any>
  overview: { rows: any[]; activityTotals: Record<string, number>; grandTotalHours: number | null }
}

const dataDir = join(import.meta.dirname, '..', 'data')
const years = existsSync(dataDir)
  ? readdirSync(dataDir)
      .map((f) => f.match(/^timecalc-(\d{4})\.json$/)?.[1])
      .filter((y): y is string => !!y && existsSync(join(dataDir, `expected-${y}.json`)))
  : []

/**
 * Kända fel i originalarbetsboken som gör att Excels eget facit är fel. Motorn ska INTE återskapa dem;
 * i stället kontrolleras att Excel avviker med exakt det dokumenterade beloppet, och bara om importen
 * också rapporterat anomalin (så att testet inte tystnar om arbetsboken senare rättas).
 *
 * V17!AH3 innehåller konstanten 24:00 i stället för =SUM(AI4:AI21) (ett oanvänt dagblock). Excel
 * summerar därför 1440 minuter för mycket i E33 och visar E34 = −24:00.
 */
const KNOWN_EXCEL_DEVIATIONS: { sheet: string; cell: string; field: string; excelMinusEngine: number; warning?: string }[] = [
  { sheet: 'V17', cell: 'AH3', field: 'summed E33', excelMinusEngine: 1440 },
  { sheet: 'V17', cell: 'AH3', field: 'unmapped E34', excelMinusEngine: -1440, warning: 'unmapped' },
]

const TOL_H = 1e-9 // timmar
const TOL_MIN = 1e-6 // minuter

function compare(diffs: string[], where: string, expected: number | null | undefined, actual: number | null, tol: number) {
  if (expected === null || expected === undefined) {
    if (actual !== null && Math.abs(actual) > tol) diffs.push(`${where}: Excel tomt, motorn ${actual}`)
    return
  }
  if (actual === null || Math.abs(actual - expected) > tol) diffs.push(`${where}: Excel ${expected}, motorn ${actual}`)
}

if (years.length === 0) {
  describe('golden (Excel-facit)', () => {
    it('hoppas över: kör scripts/import_xlsm.py först', { skip: true }, () => {})
  })
}

for (const year of years) {
  describe(`golden ${year}: motorn mot Excels cachade värden`, () => {
    const ds: Dataset = JSON.parse(readFileSync(join(dataDir, `timecalc-${year}.json`), 'utf8'))
    const exp: Expected = JSON.parse(readFileSync(join(dataDir, `expected-${year}.json`), 'utf8'))
    const calc = calcYear(ds)

    it('har lika många veckor som facit', () => {
      assert.equal(calc.weeks.length, Object.keys(exp.weeks).length)
      assert.equal(calc.weeks.length, exp.overview.rows.length)
    })

    // Facit justerat för dokumenterade fel i arbetsboken (se KNOWN_EXCEL_DEVIATIONS)
    const excelValue = (sheet: string, field: string, value: number | null): number | null => {
      const dev = KNOWN_EXCEL_DEVIATIONS.find(
        (d) => d.sheet === sheet && d.field === field && exp.anomalies.some((a) => a.sheet === d.sheet && a.cell === d.cell),
      )
      return dev && value !== null ? value - dev.excelMinusEngine : value
    }

    it('importen rapporterar de kända avvikelserna i arbetsboken', () => {
      // Om den här raden börjar fallera har arbetsboken rättats – ta då bort motsvarande KNOWN_EXCEL_DEVIATIONS.
      for (const d of KNOWN_EXCEL_DEVIATIONS) {
        assert.ok(exp.anomalies.some((a) => a.sheet === d.sheet && a.cell === d.cell), `${d.sheet}!${d.cell} borde vara rapporterad som avvikelse`)
      }
    })

    it('veckosummor (B22, B23, B24, C22, C24, F22, E22, E32–E37)', () => {
      const diffs: string[] = []
      calc.weeks.forEach((w, i) => {
        const e = exp.weeks[w.id]
        const row = calc.rows[i]
        const at = (k: string) => `${w.id}.${k}`
        compare(diffs, at('bankHours B22'), e.bankHours, w.bankHours, TOL_H)
        compare(diffs, at('expectedHours B23'), e.expectedHours, w.expectedHours, TOL_H)
        compare(diffs, at('bankDiff B24'), e.bankDiff, w.bankDiff, TOL_H)
        compare(diffs, at('normalHours C22'), e.normalHours, w.normalHours, TOL_H)
        compare(diffs, at('normalDiff C24'), e.normalDiff, w.normalDiff, TOL_H)
        compare(diffs, at('normalBalance C25'), e.normalBalance, row.normalBalance, TOL_H)
        compare(diffs, at('rptHours F22'), e.rptHours, w.rptHours, TOL_H)
        compare(diffs, at('rptRegistered E22'), e.rptRegisteredMin, w.rptRegistered, TOL_MIN)
        compare(diffs, at('registered E32'), e.registeredMin, w.registered, TOL_MIN)
        compare(diffs, at('summed E33'), excelValue(w.id, 'summed E33', e.summedMin), w.summed, TOL_MIN)
        compare(diffs, at('unmapped E34'), excelValue(w.id, 'unmapped E34', e.unmappedMin), w.unmapped, TOL_MIN)
        compare(diffs, at('reportedHours E35'), e.reportedHours, w.reportedHours, TOL_H)
        compare(diffs, at('reportedAsTime E36'), e.reportedAsTimeMin, w.reportedAsTime, TOL_MIN)
        compare(diffs, at('regVsReported E37'), e.regVsReportedMin, w.regVsReported, TOL_MIN)
      })
      assert.deepEqual(diffs.slice(0, 20), [], `${diffs.length} avvikelser`)
    })

    it('aktivitetsrader per vecka (E4:F21), inklusive tomma celler', () => {
      const diffs: string[] = []
      for (const w of calc.weeks) {
        for (const a of w.activities) {
          const e = exp.weeks[w.id].activities[a.name]
          compare(diffs, `${w.id}.${a.name} E`, e.registeredMin, a.registered, TOL_MIN)
          compare(diffs, `${w.id}.${a.name} F`, e.reportedHours, a.reported, TOL_H)
        }
      }
      assert.deepEqual(diffs.slice(0, 20), [], `${diffs.length} avvikelser`)
    })

    it('dagsummor (G3, H22, I22)', () => {
      const diffs: string[] = []
      for (const w of calc.weeks) {
        w.days.forEach((d, i) => {
          const e = exp.weeks[w.id].days[i]
          compare(diffs, `${w.id} dag ${i + 1} G3`, e.summedMin, d.summed, TOL_MIN)
          compare(diffs, `${w.id} dag ${i + 1} H22`, e.rptRegisteredMin, d.rptRegistered, TOL_MIN)
          compare(diffs, `${w.id} dag ${i + 1} I22`, e.rptReportedHours, d.rptReported, TOL_H)
        })
      }
      assert.deepEqual(diffs.slice(0, 20), [], `${diffs.length} avvikelser`)
    })

    it('Overview: förväntat, tidbanksdifferens och tidbank ut per vecka', () => {
      const diffs: string[] = []
      calc.rows.forEach((r, i) => {
        const e = exp.overview.rows[i]
        assert.equal(e.sheet, r.id)
        compare(diffs, `${r.id} A`, e.expectedHours, r.expectedHours, TOL_H)
        compare(diffs, `${r.id} F`, e.bankHours, r.bankHours, TOL_H)
        compare(diffs, `${r.id} B`, e.bankDiff, r.bankDiff, TOL_H)
        compare(diffs, `${r.id} C`, e.bankBalance, r.bankBalance, TOL_H)
      })
      assert.deepEqual(diffs.slice(0, 20), [], `${diffs.length} avvikelser`)
    })

    it('Overview: årssummor per aktivitet (rad 58)', () => {
      const diffs: string[] = []
      for (const [name, total] of Object.entries(exp.overview.activityTotals)) {
        compare(diffs, `summa ${name}`, total, calc.activityTotals[name], 1e-7)
      }
      if (exp.overview.grandTotalHours !== null) compare(diffs, 'F58', exp.overview.grandTotalHours, calc.grandTotalHours, 1e-7)
      assert.deepEqual(diffs, [])
    })

    it('varningar: motorn visar samma varningar som Excels villkorsformat', () => {
      const key = (w: Warning) =>
        w.code === 'dayActivity' ? `dayActivity:${w.day}:${w.activity}` : w.code === 'dayTotal' ? `dayTotal:${w.day}` : w.code === 'activityWeek' ? `activityWeek:${w.activity}` : w.code
      const diffs: string[] = []
      let excelTotal = 0
      for (const w of calc.weeks) {
        const suppressed = KNOWN_EXCEL_DEVIATIONS.filter(
          (d) => d.sheet === w.id && d.warning && exp.anomalies.some((a) => a.sheet === d.sheet && a.cell === d.cell),
        ).map((d) => d.warning)
        const excel: string[] = (exp.weeks[w.id].warnings as string[]).filter((x) => !suppressed.includes(x))
        const engine = w.warnings.filter((x) => x.code !== 'negativeDuration').map(key).sort()
        excelTotal += excel.length
        if (JSON.stringify(excel) !== JSON.stringify(engine)) diffs.push(`${w.id}: Excel [${excel}] motorn [${engine}]`)
      }
      assert.ok(excelTotal > 0, 'facit innehåller inga varningar – testet vore meningslöst')
      assert.deepEqual(diffs, [])
    })
  })
}
