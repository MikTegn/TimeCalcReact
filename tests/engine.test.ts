/** Enhetstester med handgjorda fall. Körs alltid, utan personliga data. */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  addActivity,
  applyDefaultWorkLog,
  calcWeek,
  calcYear,
  clearReported,
  createEmptyDataset,
  DEFAULT_DAY_TEMPLATE,
  decimalHoursToTimeMinutes,
  durationsOf,
  formatDuration,
  formatTime,
  parseHours,
  parseTime,
  renameActivity,
  roundHalfAwayFromZero,
  timeAsDecimalHours,
} from '../src/engine/index.ts'
import type { Activity, Config, Dataset, Day, Week } from '../src/engine/index.ts'

const FLAGS_ALL = { report: true, bank: true, normal: true }
const activities: Activity[] = [
  { name: 'Arbete', defaults: FLAGS_ALL, derivedReport: false },
  { name: 'Semester', defaults: FLAGS_ALL, derivedReport: false },
  { name: 'Sjuk', defaults: { report: true, bank: false, normal: false }, derivedReport: false },
  { name: 'Lunch', defaults: { report: false, bank: false, normal: false }, derivedReport: true },
]
const config: Config = { year: 2025, weeklyHours: 38.5, workdaysPerWeek: 5, openingBank: 34.5 }

const day = (over: Partial<Day> = {}): Day => ({
  date: '2025-01-06',
  workday: true,
  forceRegistered: false,
  start: null,
  rows: [],
  reported: {},
  ...over,
})
const week = (days: Day[], over: Partial<Week> = {}): Week => ({
  id: 'V02',
  label: 'V02',
  days: [...days, ...Array.from({ length: 5 - days.length }, () => day({ workday: false }))],
  flags: {},
  ...over,
})
const T = (h: number, m = 0) => h * 60 + m

describe('tid: tolkning och formatering', () => {
  it('parseTime godtar vanliga skrivsätt och avvisar ogiltiga', () => {
    assert.equal(parseTime('9'), 540)
    assert.equal(parseTime('09:00'), 540)
    assert.equal(parseTime('9.30'), 570)
    assert.equal(parseTime('1742'), T(17, 42))
    assert.equal(parseTime('930'), T(9, 30))
    assert.equal(parseTime('24:00'), 1440)
    assert.equal(parseTime(' '), null)
    assert.equal(parseTime('25:00'), undefined)
    assert.equal(parseTime('9:75'), undefined)
    assert.equal(parseTime('abc'), undefined)
  })
  it('formatTime / formatDuration', () => {
    assert.equal(formatTime(540), '09:00')
    assert.equal(formatTime(null), '')
    assert.equal(formatDuration(462), '7:42')
    assert.equal(formatDuration(-15), '−0:15')
    assert.equal(formatDuration(3477), '57:57')
  })
  it('parseHours godtar komma och punkt', () => {
    assert.equal(parseHours('7,7'), 7.7)
    assert.equal(parseHours('7.7'), 7.7)
    assert.equal(parseHours(''), null)
    assert.equal(parseHours('7,7h'), undefined)
  })
})

describe('Excel-kompatibel avrundning och tidsomvandling', () => {
  it('ROUND utgår från 15 signifikanta siffror', () => {
    assert.equal(roundHalfAwayFromZero(2.675, 2), 2.68) // ren Math.round på 2.675*100 ger 267 -> 2.67
    assert.equal(roundHalfAwayFromZero(41.65 - 41, 1), 0.6) // 0,6499999999999986 -> 0,6 (V09 i originalet)
    assert.equal(roundHalfAwayFromZero(0.55, 1), 0.6)
    assert.equal(roundHalfAwayFromZero(-0.25, 1), -0.3) // bort från noll
  })
  it('E36: decimaltimmar -> tid, avrundat till tiondels timme', () => {
    assert.equal(decimalHoursToTimeMinutes(7.7), T(7, 42))
    assert.equal(decimalHoursToTimeMinutes(15.4), T(15, 24))
    assert.equal(decimalHoursToTimeMinutes(38.6), T(38, 36)) // 0,6 h = 36 min
    assert.equal(decimalHoursToTimeMinutes(38.5), T(38, 30))
  })
  it('E36 avrundar x,x5 olika beroende på flyttalsfel – precis som Excel (V09 och V16 i originalet)', () => {
    // 38,55 − 38 = 0,54999999999999716 i flyttal -> 0,5 -> 38:30, medan 41,65 − 41 = 0,6499999999999986 -> 0,6.
    assert.equal(decimalHoursToTimeMinutes(38.55), T(38, 30))
    assert.equal(decimalHoursToTimeMinutes(41.65), T(41, 36))
  })
  it('E36 återskapar originalets kant: TIME() går runt vid 24 h, så 23,96 h blir 0:00', () => {
    assert.equal(decimalHoursToTimeMinutes(23.96), 0)
    assert.equal(decimalHoursToTimeMinutes(38.96), T(39, 0)) // …men 38,96 blir rätt tack vare INT(E35/24)
  })
  it('HOUR()+MINUTE()/60 trunkerar och går runt vid 24 h', () => {
    assert.equal(timeAsDecimalHours(T(1, 15)), 1.25)
    assert.equal(timeAsDecimalHours(T(25, 30)), 1.5)
  })
})

describe('tidslogg: varaktigheter', () => {
  it('varaktighet = sluttid − föregående tid', () => {
    const d = day({ start: T(9), rows: [{ activity: 'Arbete', end: T(12) }, { activity: 'Lunch', end: T(13) }, { activity: 'Arbete', end: T(17, 42) }] })
    assert.deepEqual(durationsOf(d), [180, 60, 282])
  })
  it('utan starttid saknas första varaktigheten', () => {
    assert.deepEqual(durationsOf(day({ start: null, rows: [{ activity: 'Arbete', end: T(12) }, { activity: 'Arbete', end: T(13) }] })), [null, 60])
  })
  it('en rad utan tid bryter kedjan – raden efter får ingen varaktighet', () => {
    const d = day({
      start: T(9),
      rows: [
        { activity: 'Arbete', end: T(10) },
        { activity: 'Arbete', end: null }, // tom tid
        { activity: 'Arbete', end: T(12) }, // kan inte räknas
        { activity: 'Semester', end: T(13) }, // kedjan är åter igång
      ],
    })
    assert.deepEqual(durationsOf(d), [60, null, null, 60])
  })
  it('en rad med tid men utan aktivitet startar om kedjan (används i originalet för luckor)', () => {
    const d = day({ start: T(9), rows: [{ activity: 'Arbete', end: T(16, 45) }, { activity: '', end: null }, { activity: '', end: T(17, 45) }, { activity: 'Friskvård', end: T(18, 45) }] })
    assert.deepEqual(durationsOf(d), [465, null, null, 60])
  })
  it('bara 21 rader räknas (rad 25–45)', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ activity: 'Arbete', end: T(9) + (i + 1) * 10 }))
    assert.equal(durationsOf(day({ start: T(9), rows })).length, 21)
  })
})

describe('vecka: summor och tidbank', () => {
  const fullDay = (rep: number) =>
    day({ start: T(9), rows: [{ activity: 'Arbete', end: T(12) }, { activity: 'Lunch', end: T(13) }, { activity: 'Arbete', end: T(17, 42) }], reported: { Arbete: rep } })

  it('förväntad tid = 38,5 × arbetsdagar / 5', () => {
    assert.equal(calcWeek(week([fullDay(7.7), fullDay(7.7)]), activities, config).expectedHours, 15.4)
    assert.equal(calcWeek(week(Array.from({ length: 5 }, () => fullDay(7.7))), activities, config).expectedHours, 38.5)
    assert.equal(calcWeek(week([day({ workday: false })]), activities, config).expectedHours, 0)
  })

  it('en full vecka enligt makrots standardlogg ger noll differens och inga varningar', () => {
    const w = applyDefaultWorkLog(week(Array.from({ length: 5 }, () => day())), [...activities, { name: 'Dev project 4', defaults: FLAGS_ALL, derivedReport: false }]).week
    const c = calcWeek(w, [...activities, { name: 'Dev project 4', defaults: FLAGS_ALL, derivedReport: false }], config)
    assert.equal(c.bankHours, 38.5)
    assert.equal(c.bankDiff, 0)
    assert.deepEqual(c.warnings, [])
    assert.equal(c.days[0].registered['Dev project 4'], T(7, 42)) // 3 h + 4 h 42 min = 7,7 h
    assert.equal(c.days[0].registered['Lunch'], 60)
    assert.equal(c.days[0].reported['Lunch'], 1) // Lunch härleds ur loggen
  })

  it('tidbanken räknas på rapporterade timmar, inte loggad tid', () => {
    const c = calcWeek(week([fullDay(8.7)]), activities, config)
    assert.equal(c.bankHours, 8.7)
    assert.ok(Math.abs(c.bankDiff - (8.7 - 7.7)) < 1e-12)
  })

  it('aktiviteter utan bank-flagga (Sjuk) räknas inte till tidbanken men till Rpt', () => {
    const c = calcWeek(week([day({ reported: { Sjuk: 7.7 } })]), activities, config)
    assert.equal(c.bankHours, 0)
    assert.equal(c.rptHours, 7.7)
  })

  it('veckans egna flaggor har företräde framför aktivitetens standard', () => {
    const w = week([day({ reported: { Sjuk: 7.7 } })], { flags: { Sjuk: { report: true, bank: true, normal: true } } })
    assert.equal(calcWeek(w, activities, config).bankHours, 7.7)
  })

  it('rapporterade timmar på en dag som inte är arbetsdag räknas inte i F men väl i E35', () => {
    const c = calcWeek(week([day({ workday: false, reported: { Arbete: 5 } })]), activities, config)
    assert.equal(c.activities[0].reported, null)
    assert.equal(c.bankHours, 0)
    assert.equal(c.reportedHours, 5)
  })

  it('loggad tid räknas bara på arbetsdagar – om inte dagen är tvingad (forceRegistered)', () => {
    const rows = [{ activity: 'Arbete', end: T(12) }]
    assert.equal(calcWeek(week([day({ workday: false, start: T(9), rows })]), activities, config).activities[0].registered, null)
    assert.equal(calcWeek(week([day({ workday: false, forceRegistered: true, start: T(9), rows })]), activities, config).activities[0].registered, 180)
  })

  it('tom cell (null) skiljs från 0: rapporterad tid utan logg ger en synlig 0:a', () => {
    const c = calcWeek(week([day({ reported: { Arbete: 7.7 } })]), activities, config)
    assert.equal(c.days[0].registered['Arbete'], 0)
    assert.equal(c.days[0].registered['Semester'], null)
  })

  it('SUMIF matchar aktivitetsnamn utan hänsyn till versaler', () => {
    const c = calcWeek(week([day({ start: T(9), rows: [{ activity: 'ARBETE', end: T(10) }] })]), activities, config)
    assert.equal(c.days[0].registered['Arbete'], 60)
    assert.equal(c.unmapped, 0)
  })

  it('tid på en aktivitet som inte finns i listan syns som E34 och ger varning', () => {
    const c = calcWeek(week([day({ start: T(9), rows: [{ activity: 'Okänd', end: T(10) }] })]), activities, config)
    assert.equal(c.registered, 60)
    assert.equal(c.summed, 0)
    assert.equal(c.unmapped, 60)
    assert.ok(c.warnings.some((w) => w.code === 'unmapped'))
  })
})

describe('varningar (villkorsformatet i originalet)', () => {
  const logged = (h: number, reported?: number) =>
    day({ start: T(9), rows: [{ activity: 'Arbete', end: T(9) + h * 60 }], reported: reported === undefined ? {} : { Arbete: reported } })
  const codes = (d: Day) => calcWeek(week([d]), activities, config).warnings.map((w) => w.code)

  it('gränsen 0,25 h per aktivitet är strikt (”större än”)', () => {
    assert.ok(!codes(logged(7.75, 7.5)).includes('dayActivity'))
    assert.ok(codes(logged(7.75, 7.49)).includes('dayActivity'))
  })
  it('loggad tid utan rapporterad tid varnar (tom cell = 0)', () => {
    assert.ok(codes(logged(4)).includes('dayActivity'))
  })
  it('en arbetsdag utan varken logg eller rapport varnar bara för normaltid (7,7 h saknas)', () => {
    assert.deepEqual(codes(day()), ['normalDiff'])
  })
  it('negativ varaktighet varnar (ny kontroll – Excel visar bara ####)', () => {
    assert.ok(codes(day({ start: T(17), rows: [{ activity: 'Arbete', end: T(9) }] })).includes('negativeDuration'))
  })
  it('normaltid som avviker från förväntad tid varnar (C24 ≠ 0)', () => {
    assert.ok(codes(logged(8, 8)).includes('normalDiff')) // 8 h rapporterat mot 7,7 h förväntat
  })
})

describe('år och saldo', () => {
  it('saldot löper från ingående tidbank', () => {
    const ds: Dataset = {
      version: 1,
      config,
      activities,
      weeks: [
        week([day({ reported: { Arbete: 8.7 } })], { id: 'V01', label: 'V01' }),
        week([day({ reported: { Arbete: 6.7 } })], { id: 'V02', label: 'V02' }),
      ],
    }
    const y = calcYear(ds)
    // V01: 8,7 h rapporterat mot 7,7 h förväntat = +1,0 -> 35,5. V02: 6,7 h = −1,0 -> 34,5.
    assert.ok(Math.abs(y.rows[0].bankBalance - 35.5) < 1e-9)
    assert.ok(Math.abs(y.rows[1].bankBalance - 34.5) < 1e-9)
    assert.equal(y.finalBankBalance, y.rows[1].bankBalance)
    assert.ok(Math.abs(y.activityTotals['Arbete'] - 15.4) < 1e-9)
  })
})

describe('fabrik och makron', () => {
  it('ett tomt år 2025 har 53 veckor: V01 börjar 30 dec 2024 och V53 29 dec 2025', () => {
    const ds = createEmptyDataset(2025)
    assert.equal(ds.weeks.length, 53)
    assert.equal(ds.weeks[0].days[0].date, '2024-12-30')
    assert.equal(ds.weeks[52].label, 'V53')
    assert.equal(ds.weeks[52].days[0].date, '2025-12-29')
    assert.equal(ds.weeks[1].days[4].date, '2025-01-10')
  })
  it('SetupDefaultWorkLog: fyller arbetsdagar, rör inte lediga dagar, hoppar över okända aktiviteter', () => {
    const w = week([day(), day({ workday: false }), day()])
    const known: Activity[] = [...activities, { name: 'Dev project 4', defaults: FLAGS_ALL, derivedReport: false }]
    const r = applyDefaultWorkLog(w, known)
    assert.equal(r.week.days[0].start, T(9))
    assert.deepEqual(r.week.days[0].rows.map((x) => x.end), [T(12), T(13), T(17, 42)])
    assert.equal(r.week.days[0].reported['Dev project 4'], DEFAULT_DAY_TEMPLATE.reportedHours)
    assert.equal(r.week.days[1].start, null)
    assert.deepEqual(r.skipped, [])
    assert.deepEqual(applyDefaultWorkLog(w, activities).skipped, ['Dev project 4'])
  })
  it('ClearDefaultReportTimes: tömmer rapporterade timmar men behåller loggen', () => {
    const w = week([day({ start: T(9), rows: [{ activity: 'Arbete', end: T(10) }], reported: { Arbete: 1 } })])
    const c = clearReported(w)
    assert.deepEqual(c.days[0].reported, {})
    assert.equal(c.days[0].rows.length, 1)
  })
  it('renameActivity ändrar namnet överallt och avvisar dubletter', () => {
    const ds = createEmptyDataset(2025, activities)
    ds.weeks[0].days[0].rows = [{ activity: 'Arbete', end: T(10) }]
    ds.weeks[0].days[0].reported = { Arbete: 1 }
    const r = renameActivity(ds, 'Arbete', 'Utveckling')!
    assert.equal(r.activities[0].name, 'Utveckling')
    assert.equal(r.weeks[0].days[0].rows[0].activity, 'Utveckling')
    assert.deepEqual(r.weeks[0].days[0].reported, { Utveckling: 1 })
    assert.ok('Utveckling' in r.weeks[0].flags && !('Arbete' in r.weeks[0].flags))
    assert.equal(renameActivity(ds, 'Arbete', 'semester'), null) // finns redan (versaler ignoreras)
    assert.equal(renameActivity(ds, 'Arbete', '  '), null)
  })
  it('addActivity ger alla veckor standardflaggor', () => {
    const ds = addActivity(createEmptyDataset(2025, activities), { name: 'Kurs', defaults: FLAGS_ALL, derivedReport: false })!
    assert.equal(ds.activities.length, 5)
    assert.ok(ds.weeks.every((w) => w.flags['Kurs']?.bank === true))
  })
})
