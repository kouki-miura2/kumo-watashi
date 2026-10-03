import { toWallClock } from './zone.ts'

const pad = (value: number): string => String(value).padStart(2, '0')

const tokenValues: Record<string, (wall: Date) => string> = {
  yyyy: (wall) => String(wall.getUTCFullYear()),
  MM: (wall) => pad(wall.getUTCMonth() + 1),
  M: (wall) => String(wall.getUTCMonth() + 1),
  dd: (wall) => pad(wall.getUTCDate()),
  d: (wall) => String(wall.getUTCDate()),
  HH: (wall) => pad(wall.getUTCHours()),
  mm: (wall) => pad(wall.getUTCMinutes()),
  ss: (wall) => pad(wall.getUTCSeconds()),
}

const tokenPattern = /yyyy|MM|M|dd|d|HH|mm|ss/g

/**
 * Formats `date` in the app's time zone (`TIME_ZONE_OFFSET_MINUTES`) using `yyyy`/`MM`/`dd`/`HH`/`mm`/`ss`
 * tokens, plus unpadded `M`/`d` (e.g. `M/d` → `9/29`). The default pattern `yyyy-MM-dd` is also
 * the format to store a calendar date in.
 */
export const formatDate = (date: Date, pattern = 'yyyy-MM-dd'): string => {
  const wall = toWallClock(date)
  return pattern.replace(tokenPattern, (token) => tokenValues[token](wall))
}
