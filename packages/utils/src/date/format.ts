const pad = (value: number, length = 2): string => String(value).padStart(length, '0')

const tokenValues: Record<string, (date: Date) => string> = {
  yyyy: (date) => String(date.getFullYear()),
  MM: (date) => pad(date.getMonth() + 1),
  dd: (date) => pad(date.getDate()),
  HH: (date) => pad(date.getHours()),
  mm: (date) => pad(date.getMinutes()),
  ss: (date) => pad(date.getSeconds()),
}

const tokenPattern = /yyyy|MM|dd|HH|mm|ss/g

/** Formats a `Date` using `yyyy`/`MM`/`dd`/`HH`/`mm`/`ss` tokens. Default pattern: `yyyy-MM-dd`. */
export const formatDate = (date: Date, pattern = 'yyyy-MM-dd'): string =>
  pattern.replace(tokenPattern, (token) => tokenValues[token](date))
