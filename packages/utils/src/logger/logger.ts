export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogFormat = 'text' | 'json'

export interface Logger {
  debug: (message: string, fields?: Record<string, unknown>) => void
  info: (message: string, fields?: Record<string, unknown>) => void
  warn: (message: string, fields?: Record<string, unknown>) => void
  error: (message: string, fields?: Record<string, unknown>) => void
}

export interface LoggerOptions {
  /** Minimum level that gets written. Anything below is dropped. Default: `"info"`. */
  level?: LogLevel
  /** Attached to every message: prepended in `"text"` format, a `prefix` field in `"json"` format. */
  prefix?: string
  /** Output strategy: human-readable text (default), or one JSON object per line for log processors. */
  format?: LogFormat
}

const levelOrder: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

/** Thin wrapper over `console.*` with level filtering, an optional prefix, and a pluggable output format. */
export const createLogger = (options: LoggerOptions = {}): Logger => {
  const { level = 'info', prefix, format = 'text' } = options

  const write = (
    messageLevel: LogLevel,
    message: string,
    fields?: Record<string, unknown>,
  ): void => {
    if (levelOrder[messageLevel] < levelOrder[level]) return

    // Read console[messageLevel] at call time so test spies (vi.spyOn) apply.
    if (format === 'json') {
      console[messageLevel](
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: messageLevel,
          ...(prefix ? { prefix } : {}),
          message,
          ...fields,
        }),
      )
      return
    }

    const parts = fields ? [message, fields] : [message]
    console[messageLevel](...(prefix ? [`[${prefix}]`, ...parts] : parts))
  }

  return {
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
  }
}
