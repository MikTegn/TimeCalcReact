import type { Minutes } from './types.ts'

const MIN_PER_DAY = 24 * 60

/** Excels SUMIF matchar text utan hänsyn till versaler. */
export function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/**
 * Tolkar inmatad tid. Returnerar `null` för tom inmatning och `undefined` för ogiltig.
 * Godtar 9, 09, 9:00, 09:00, 930 och 1742.
 */
export function parseTime(input: string): Minutes | null | undefined {
  const s = input.trim()
  if (s === '') return null
  let h: number
  let m: number
  let match: RegExpMatchArray | null
  if ((match = s.match(/^(\d{1,2})[:.](\d{2})$/))) {
    h = Number(match[1])
    m = Number(match[2])
  } else if ((match = s.match(/^(\d{1,2})$/))) {
    h = Number(match[1])
    m = 0
  } else if ((match = s.match(/^(\d{1,2})(\d{2})$/))) {
    h = Number(match[1])
    m = Number(match[2])
  } else {
    return undefined
  }
  if (m > 59 || h > 24 || (h === 24 && m > 0)) return undefined
  return h * 60 + m
}

/** Klockslag som "09:00". */
export function formatTime(m: Minutes | null | undefined): string {
  if (m === null || m === undefined) return ''
  const total = Math.round(m)
  const h = Math.floor(total / 60)
  return `${String(h).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Varaktighet som "7:42" (negativ: "−0:15"). Tom sträng för null. */
export function formatDuration(m: Minutes | null | undefined): string {
  if (m === null || m === undefined) return ''
  const total = Math.round(Math.abs(m))
  const text = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
  return m < 0 ? `−${text}` : text
}

const hoursFormat = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 2 })

/** Decimaltimmar på svenska, t.ex. "7,7". */
export function formatHours(h: number | null | undefined): string {
  if (h === null || h === undefined) return ''
  return hoursFormat.format(Math.abs(h) < 5e-10 ? 0 : h)
}

/** Som formatHours men med uttryckligt plustecken för positiva värden (differenser). */
export function formatSigned(h: number): string {
  const text = formatHours(h)
  return h > 5e-10 ? `+${text}` : text
}

/** Tolkar decimaltimmar med komma eller punkt. `null` = tomt, `undefined` = ogiltigt. */
export function parseHours(input: string): number | null | undefined {
  const s = input.trim().replace(',', '.')
  if (s === '') return null
  if (!/^-?\d+(\.\d+)?$/.test(s)) return undefined
  return Number(s)
}

/** Minuter -> timmar (Excels 24*DAY(x)+HOUR(x)+MINUTE(x)/60 för hela minuter). */
export function minutesToHours(m: Minutes): number {
  return m / 60
}

/**
 * HOUR(x)+MINUTE(x)/60 – används för Lunch (I21). Excel trunkerar sekunder och HOUR() går runt vid 24 h.
 * Negativa varaktigheter ger #NUM! i Excel; här returneras de som m/60 (och en varning visas separat).
 */
export function timeAsDecimalHours(m: Minutes): number {
  if (m < 0) return m / 60
  const whole = Math.round(m)
  return (Math.floor(whole / 60) % 24) + (whole % 60) / 60
}

/**
 * ROUND() i Excel: halva tal avrundas bort från noll, och avrundningen utgår från värdets 15 signifikanta
 * siffror. Därför blir 0,6499999999999986 (t.ex. 41,65 − 41) 0,6 medan 2,675 blir 2,68 – ett epsilon
 * eller ren Math.round ger fel på det ena eller det andra.
 */
export function roundHalfAwayFromZero(x: number, digits: number): number {
  if (!Number.isFinite(x) || x === 0) return x
  const sign = Math.sign(x)
  const magnitude = Number(Math.abs(x).toPrecision(15))
  if (magnitude < 1e-6 || magnitude >= 1e15) return (sign * Math.round(magnitude * 10 ** digits)) / 10 ** digits
  // Exponentskrivning ("6.5e1") ger exakt decimaltolkning utan flyttalsfel vid multiplikation.
  const scaled = Math.round(Number(`${magnitude}e${digits}`))
  return sign * Number(`${scaled}e-${digits}`)
}

/**
 * Cell E36: TIME(TRUNC(E35), ROUND(TRUNC(ROUND(E35-TRUNC(E35),1)*60),0), 0)+INT(E35/24)
 * Decimaltimmar avrundas till tiondels timme (6 min) och skrivs som tid. Reproducerar Excel exakt,
 * inklusive att TIME() går runt vid 24 h (23,96 h blir 0:00 – originalet har den kanten).
 */
export function decimalHoursToTimeMinutes(hours: number): Minutes {
  const whole = Math.trunc(hours)
  const tenths = roundHalfAwayFromZero(hours - whole, 1)
  const minutes = Math.trunc(tenths * 60)
  const timeOfDay = (((whole * 60 + minutes) % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY
  return timeOfDay + Math.floor(hours / 24) * MIN_PER_DAY
}
