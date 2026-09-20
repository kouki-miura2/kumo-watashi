import { afterEach, describe, expect, test, vi } from 'vite-plus/test'

import { createLogger } from './logger.ts'

describe('createLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('delegates each level to the matching console method', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    const logger = createLogger()
    logger.info('hello')
    logger.error('boom')

    expect(info).toHaveBeenCalledWith('hello')
    expect(error).toHaveBeenCalledWith('boom')
  })

  test('drops messages below the configured level', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const logger = createLogger({ level: 'warn' })
    logger.debug('ignored')
    logger.warn('shown')

    expect(debug).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('shown')
  })

  test('prepends the prefix when provided', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    const logger = createLogger({ prefix: 'api' })
    logger.info('started', { port: 3000 })

    expect(info).toHaveBeenCalledWith('[api]', 'started', { port: 3000 })
  })

  test('writes a single JSON line per call when format is "json"', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    const logger = createLogger({ format: 'json', prefix: 'api' })
    logger.info('request', { method: 'GET', path: '/' })

    expect(info).toHaveBeenCalledTimes(1)
    const [line] = info.mock.calls[0] as [string]
    expect(JSON.parse(line)).toMatchObject({
      level: 'info',
      prefix: 'api',
      message: 'request',
      method: 'GET',
      path: '/',
    })
  })

  test('json format omits the prefix field when none is configured', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    const logger = createLogger({ format: 'json' })
    logger.info('request')

    const [line] = info.mock.calls[0] as [string]
    expect(JSON.parse(line)).not.toHaveProperty('prefix')
  })
})
