import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { calcYear } from '../src/engine/index.ts'
import type { Dataset } from '../src/engine/index.ts'
import { capitalize, dateRange, describeWarning, plainHours, shortDate, weekdayName } from '../src/ui/format.ts'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

describe('presentation', () => {
  it('datum och veckodagar (UTC, oberoende av tidszon)', () => {
    assert.equal(weekdayName('2025-01-06'), 'måndag')
    assert.equal(weekdayName('2024-12-30'), 'måndag')
    assert.equal(capitalize(weekdayName('2025-01-10')), 'Fredag')
    assert.equal(shortDate('2025-01-06'), '6 jan')
    assert.equal(dateRange('2024-12-30', '2025-01-03'), '30 dec – 3 jan')
  })
  it('plainHours behåller exakt värde utan flyttalsbrus', () => {
    assert.equal(plainHours(7.7), '7,7')
    assert.equal(plainHours(38.5 / 5), '7,7')
    assert.equal(plainHours(1.1999999999999993), '1,2')
    assert.equal(plainHours(null), '')
  })
  it('varningstexter finns för alla varningar i verkliga data', () => {
    const file = join(import.meta.dirname, '..', 'data', 'timecalc-2025.json')
    if (!existsSync(file)) return
    const y = calcYear(JSON.parse(readFileSync(file, 'utf8')) as Dataset)
    let n = 0
    for (const w of y.weeks) for (const x of w.warnings) {
      const text = describeWarning(x, w)
      assert.ok(text.length > 10 && !text.includes('undefined') && !text.includes('NaN'), text)
      n++
    }
    assert.ok(n > 0)
  })
})
