export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface Logger {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

export interface LoggerOptions {
  /** Minimum level that gets written. Anything below is dropped. Default: `"info"`. */
  level?: LogLevel
  /** Prepended to every message, e.g. a request id or module name. */
  prefix?: string
}

const levelOrder: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

/** Thin wrapper over `console.*` with level filtering and an optional prefix. */
export const createLogger = (options: LoggerOptions = {}): Logger => {
  const { level = 'info', prefix } = options

  const write = (messageLevel: LogLevel, args: unknown[]): void => {
    if (levelOrder[messageLevel] < levelOrder[level]) return
    // Read console[messageLevel] at call time so test spies (vi.spyOn) apply.
    console[messageLevel](...(prefix ? [`[${prefix}]`, ...args] : args))
  }

  return {
    debug: (...args) => write('debug', args),
    info: (...args) => write('info', args),
    warn: (...args) => write('warn', args),
    error: (...args) => write('error', args),
  }
}
