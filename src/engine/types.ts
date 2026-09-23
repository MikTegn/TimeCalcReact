/**
 * Datamodell för TimeCalc. Motsvarar arbetsbokens struktur (se README för cellkarta).
 * Tider på dygnet och varaktigheter lagras som heltalsminuter; rapporterade timmar som decimaltal.
 */

/** Minuter efter midnatt (klockslag) eller antal minuter (varaktighet). */
export type Minutes = number

/** Vilka summor en aktivitet räknas in i under en viss vecka (kolumn A/B/C i veckobladen). */
export interface Flags {
  /** A – räknas in i "Rpt.Tid" (F22). */
  report: boolean
  /** B – räknas in i tidbanken (B22). */
  bank: boolean
  /** C – räknas in i normaltid (C22). */
  normal: boolean
}

export interface Activity {
  /** Unikt, oberoende av versaler (Excels SUMIF matchar så). */
  name: string
  /** Projekt-/ordernummer (cellkommentaren i Overview). */
  code?: string | null
  /** Flaggor för nya veckor. Varje vecka har egna flaggor i `Week.flags`. */
  defaults: Flags
  /** Rapporterade timmar härleds ur loggad tid (som Lunch, I21) i stället för att matas in. */
  derivedReport: boolean
}

/** En rad i tidsloggen (G25:H45): aktiviteten som pågick fram till `end`. */
export interface LogRow {
  activity: string
  end: Minutes | null
  note?: string
}

export interface Day {
  /** ISO-datum, yyyy-mm-dd. */
  date: string
  /** "Ja" i rad 3: arbetsdag som räknas mot förväntad tid och rapporterade timmar. */
  workday: boolean
  /** Konstanten "Tid" i dagens sammanfattningscell: loggad tid räknas in även om dagen inte är arbetsdag. */
  forceRegistered: boolean
  /** H24: dagens starttid. */
  start: Minutes | null
  /** Max 21 rader (25–45) räknas. Tomma rader ska behållas – de bryter kedjan av varaktigheter. */
  rows: LogRow[]
  /** I4:I20: manuellt rapporterade decimaltimmar per aktivitet. */
  reported: Record<string, number>
}

export interface Week {
  /** Stabilt id (bladnamnet i originalet, t.ex. "V07" eller "V1-26"). */
  id: string
  /** Visningsnamn ("V07", "V53"). */
  label: string
  /** Måndag–fredag. */
  days: Day[]
  /** Flaggor per aktivitetsnamn för just den här veckan. */
  flags: Record<string, Flags>
}

export interface DayTemplate {
  start: Minutes
  rows: { activity: string; end: Minutes }[]
  /** Aktivitet som får `reportedHours` rapporterade timmar per dag. */
  reportedActivity: string
  reportedHours: number
}

export interface Config {
  year: number
  /** Veckoarbetstid, t.ex. 38,5. */
  weeklyHours: number
  /** Antal arbetsdagar som veckoarbetstiden fördelas på (5). */
  workdaysPerWeek: number
  /** Tidbank vid årets början ("34.5+…" i C25/Overview!C4). */
  openingBank: number
  /** Mall för "Fyll i standardvecka" (makrot SetupDefaultWorkLog). */
  defaultDay?: DayTemplate
}

export interface Dataset {
  version: 1
  source?: { file: string; importedAt: string }
  config: Config
  activities: Activity[]
  weeks: Week[]
}

// ---------------------------------------------------------------------------------------------
// Beräknade resultat
// ---------------------------------------------------------------------------------------------

export type WarningCode =
  | 'dayActivity' // |rapporterat − loggat| > 0,25 h för en aktivitet en dag (villkorsformat på I4:I20)
  | 'dayTotal' // |rapporterat − loggat| > 0,5 h för en dag (I22)
  | 'activityWeek' // |rapporterat − loggat| > 0,25 h för en aktivitet under veckan (F4:F21)
  | 'rptWeek' // samma för veckans Rpt.Tid (F22)
  | 'normalDiff' // normaltid avviker från förväntad tid (C24 ≠ 0)
  | 'unmapped' // loggad tid som inte tillhör någon aktivitet i listan (E34 ≠ 0)
  | 'regVsReported' // |registrerad − rapporterad| > 0,5 h för veckan (E37)
  | 'negativeDuration' // sluttid före föregående tid (ny kontroll – Excel visar bara ####)

export interface Warning {
  code: WarningCode
  /** Index i `Week.days`. */
  day?: number
  activity?: string
  /** Värdena som jämfördes (timmar, utom för unmapped: minuter). */
  a?: number
  b?: number
}

export interface DayCalc {
  date: string
  workday: boolean
  /** Dagens loggade tid räknas in i veckosummorna (H3 = "Tid"). */
  countsRegistered: boolean
  /** Varaktighet per loggrad (I25:I45); null när någon av tiderna saknas. */
  durations: (Minutes | null)[]
  /** H4:H21 – loggad tid per aktivitet; null = tom cell. */
  registered: Record<string, Minutes | null>
  /** I4:I21 – rapporterade timmar per aktivitet; null = tom cell. */
  reported: Record<string, number | null>
  /** G3 – summa av H4:H21. */
  summed: Minutes
  /** Summa av alla varaktigheter (bidrar till E32). */
  totalDuration: Minutes
  /** H22 – loggad tid för aktiviteter med Rpt-flagga. */
  rptRegistered: Minutes
  /** I22 – rapporterade timmar för aktiviteter med Rpt-flagga. */
  rptReported: number
  /** Summa av I4:I21 (bidrar till E35). */
  reportedAll: number
}

export interface ActivityCalc {
  name: string
  flags: Flags
  /** E – loggad tid under veckan (dagar som räknas), null om noll. */
  registered: Minutes | null
  /** F – rapporterade timmar på arbetsdagar, null om noll. */
  reported: number | null
}

export interface WeekCalc {
  id: string
  label: string
  days: DayCalc[]
  activities: ActivityCalc[]
  workdays: number
  /** B23 – förväntade timmar. */
  expectedHours: number
  /** F22 – rapporterade timmar (Rpt.Tid). */
  rptHours: number
  /** E22 – loggad tid (Rpt.Tid), minuter. */
  rptRegistered: Minutes
  /** B22 – timmar som räknas till tidbanken. */
  bankHours: number
  /** C22 – timmar som räknas som normaltid. */
  normalHours: number
  /** B24 – veckans tidbanksdifferens. */
  bankDiff: number
  /** C24 – veckans normaltidsdifferens. */
  normalDiff: number
  /** E32 – summa av alla loggade varaktigheter (minuter). */
  registered: Minutes
  /** E33 – summa av dagsummorna (minuter). */
  summed: Minutes
  /** E34 – registrerad − summerad (minuter). */
  unmapped: Minutes
  /** E35 – rapporterade timmar totalt (inkl. Lunch och dagar som inte är arbetsdagar). */
  reportedHours: number
  /** E36 – E35 omräknat till tid (minuter). */
  reportedAsTime: Minutes
  /** E37 – |E32 − E36| (minuter). */
  regVsReported: Minutes
  warnings: Warning[]
}

export interface YearRow {
  id: string
  label: string
  expectedHours: number
  bankHours: number
  bankDiff: number
  /** Overview!C – tidbank ut. */
  bankBalance: number
  normalDiff: number
  /** Veckobladets C25. */
  normalBalance: number
}

export interface YearCalc {
  weeks: WeekCalc[]
  rows: YearRow[]
  /** Overview rad 58: rapporterade timmar per aktivitet över året. */
  activityTotals: Record<string, number>
  grandTotalHours: number
  finalBankBalance: number
}
