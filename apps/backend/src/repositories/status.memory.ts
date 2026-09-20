import type { StatusRepository } from './status.interface.ts'

/** Default in-memory `StatusRepository`. Projects add real DAOs (e.g. `*.d1.ts`, `*.node-pg.ts`) alongside this file. */
export const createStatusRepository = (): StatusRepository => ({
  getStatus: async () => ({ status: 'ok' }),
})
