export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export const addMonths = (date: Date, months: number): Date => {
  const result = new Date(date)
  result.setMonth(result.getMonth() + months)
  return result
}

export const addYears = (date: Date, years: number): Date => {
  const result = new Date(date)
  result.setFullYear(result.getFullYear() + years)
  return result
}

export const startOfDay = (date: Date): Date => {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

export const endOfDay = (date: Date): Date => {
  const result = new Date(date)
  result.setHours(23, 59, 59, 999)
  return result
}

export const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

/** Number of calendar days from `b` to `a`, ignoring time of day. */
export const diffInDays = (a: Date, b: Date): number => {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / msPerDay)
}
