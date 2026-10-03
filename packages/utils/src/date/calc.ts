import { fromWallClock, toWallClock } from './zone.ts'

// The app's time zone is a fixed offset (no DST), so a day is always 24 hours.
const msPerDay = 24 * 60 * 60 * 1000

export const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * msPerDay)

/**
 * Moves `date` by `months` calendar months in the app's time zone, keeping the time of day. The day
 * is clamped to the target month's last day (e.g. Mar 31 minus 1 month is Feb 28/29, not Mar 3).
 */
export const addMonths = (date: Date, months: number): Date => {
  const wall = toWallClock(date)
  const year = wall.getUTCFullYear()
  const month = wall.getUTCMonth() + months
  const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const result = new Date(wall)
  result.setUTCFullYear(year, month, Math.min(wall.getUTCDate(), lastDayOfTargetMonth))
  return fromWallClock(result)
}

/** Moves `date` by `years` years, clamping Feb 29 to Feb 28 like `addMonths`. */
export const addYears = (date: Date, years: number): Date => addMonths(date, years * 12)

/** Start (00:00) of the calendar day containing `date`, in the app's time zone. */
export const startOfDay = (date: Date): Date => {
  const wall = toWallClock(date)
  return fromWallClock(
    new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate())),
  )
}

/** Last millisecond of the calendar day containing `date`, in the app's time zone. */
export const endOfDay = (date: Date): Date => new Date(startOfDay(date).getTime() + msPerDay - 1)

/**
 * Start (00:00) of the calendar week containing `date`, in the app's time zone.
 * `weekStartsOn`: 0 = Sunday … 6 = Saturday. Default: Monday.
 */
export const startOfWeek = (date: Date, weekStartsOn = 1): Date => {
  const wall = toWallClock(date)
  const daysSinceWeekStart = (wall.getUTCDay() - weekStartsOn + 7) % 7
  return fromWallClock(
    new Date(
      Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() - daysSinceWeekStart),
    ),
  )
}

/** Start (00:00 on the 1st) of the calendar month containing `date`, in the app's time zone. */
export const startOfMonth = (date: Date): Date => {
  const wall = toWallClock(date)
  return fromWallClock(new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), 1)))
}

/** Whether `a` and `b` fall on the same calendar day in the app's time zone. */
export const isSameDay = (a: Date, b: Date): boolean =>
  startOfDay(a).getTime() === startOfDay(b).getTime()

/** Number of calendar days from `b` to `a` in the app's time zone, ignoring time of day. */
export const diffInDays = (a: Date, b: Date): number =>
  (startOfDay(a).getTime() - startOfDay(b).getTime()) / msPerDay
