/** Tester för tillståndsreducern (ren funktion, ingen React). */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { calcWeek, createEmptyDataset } from '../src/engine/index.ts'
import { reducer } from '../src/state/reducer.ts'
import type { Activity } from '../src/engine/index.ts'

const acts: Activity[] = [
  { name: 'Arbete', defaults: { report: true, bank: true, normal: true }, derivedReport: false },
  { name: 'Lunch', defaults: { report: false, bank: false, normal: false }, derivedReport: true },
]
const fresh = () => createEmptyDataset(2025, acts)
const W = 'V02'

describe('reducer', () => {
  it('ändrar bara den valda dagen och muterar inte tidigare tillstånd', () => {
    const before = fresh()
    const after = reducer(before, { type: 'setStart', week: W, day: 1, value: 540 })
    assert.equal(after.weeks[1].days[1].start, 540)
    assert.equal(before.weeks[1].days[1].start, null)
    assert.equal(after.weeks[1].days[0].start, null)
    assert.equal(after.weeks[0], before.weeks[0]) // orörda veckor delas (referenslikhet)
  })

  it('en logg byggd via actions ger rätt varaktighet och tidbank', () => {
    let ds = fresh()
    ds = reducer(ds, { type: 'setStart', week: W, day: 0, value: 540 })
    ds = reducer(ds, { type: 'addRow', week: W, day: 0 })
    ds = reducer(ds, { type: 'setRow', week: W, day: 0, row: 0, patch: { activity: 'Arbete', end: 12 * 60 } })
    ds = reducer(ds, { type: 'setReported', week: W, day: 0, activity: 'Arbete', value: 3 })
    const w = calcWeek(ds.weeks[1], ds.activities, ds.config)
    assert.equal(w.days[0].registered['Arbete'], 180)
    assert.equal(w.bankHours, 3)
  })

  it('setReported med null tar bort värdet (tom cell, inte 0)', () => {
    let ds = reducer(fresh(), { type: 'setReported', week: W, day: 0, activity: 'Arbete', value: 0 })
    assert.equal(ds.weeks[1].days[0].reported['Arbete'], 0)
    ds = reducer(ds, { type: 'setReported', week: W, day: 0, activity: 'Arbete', value: null })
    assert.ok(!('Arbete' in ds.weeks[1].days[0].reported))
  })

  it('addRow stannar vid 21 rader', () => {
    let ds = fresh()
    for (let i = 0; i < 30; i++) ds = reducer(ds, { type: 'addRow', week: W, day: 0 })
    assert.equal(ds.weeks[1].days[0].rows.length, 21)
  })

  it('removeRow tar bort raden', () => {
    let ds = fresh()
    ds = reducer(ds, { type: 'addRow', week: W, day: 0 })
    ds = reducer(ds, { type: 'addRow', week: W, day: 0 })
    ds = reducer(ds, { type: 'setRow', week: W, day: 0, row: 1, patch: { activity: 'Arbete' } })
    ds = reducer(ds, { type: 'removeRow', week: W, day: 0, row: 0 })
    assert.deepEqual(ds.weeks[1].days[0].rows.map((r) => r.activity), ['Arbete'])
  })

  it('setFlag påverkar bara den veckan', () => {
    const ds = reducer(fresh(), { type: 'setFlag', week: W, activity: 'Arbete', key: 'bank', value: false })
    assert.equal(ds.weeks[1].flags['Arbete'].bank, false)
    assert.equal(ds.weeks[1].flags['Arbete'].report, true)
    assert.equal(ds.weeks[2].flags['Arbete'].bank, true)
  })

  it('applyDefaultWeek / clearReported fungerar som makrona', () => {
    let ds = fresh()
    ds = reducer(ds, { type: 'setConfig', patch: { defaultDay: { start: 540, rows: [{ activity: 'Arbete', end: 1062 }], reportedActivity: 'Arbete', reportedHours: 7.7 } } })
    ds = reducer(ds, { type: 'applyDefaultWeek', week: W })
    assert.equal(ds.weeks[1].days[4].reported['Arbete'], 7.7)
    assert.equal(ds.weeks[1].days[4].rows.length, 1)
    ds = reducer(ds, { type: 'clearReported', week: W })
    assert.deepEqual(ds.weeks[1].days[4].reported, {})
    assert.equal(ds.weeks[1].days[4].rows.length, 1)
  })

  it('renameActivity och addActivity via actions; dubbletter ignoreras', () => {
    let ds = reducer(fresh(), { type: 'renameActivity', from: 'Arbete', to: 'Utveckling' })
    assert.equal(ds.activities[0].name, 'Utveckling')
    const same = reducer(ds, { type: 'renameActivity', from: 'Utveckling', to: 'lunch' })
    assert.equal(same, ds) // ogiltigt namn -> oförändrat
    ds = reducer(ds, { type: 'addActivity', activity: { name: 'Kurs', defaults: { report: true, bank: true, normal: true }, derivedReport: false } })
    assert.equal(ds.activities.length, 3)
  })
})
