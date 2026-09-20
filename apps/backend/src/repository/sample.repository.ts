import type { SampleDao } from '../dao/sample.interface.ts'

/** Domain entity — what the rest of the app works with, independent of how the DAO's storage happens to shape a row. */
export interface Sample {
  id: string
  label: string
}

export interface SampleRepository {
  findById: (id: string) => Promise<Sample | null>
}

/**
 * Maps the DAO's raw storage shape to the `Sample` domain entity. Here that mapping is a
 * no-op, but this is the layer where it would happen — combining multiple DAOs, renaming
 * fields, computing derived properties, etc. — so the service layer never has to know
 * what the storage row looked like.
 */
export const createSampleRepository = (dao: SampleDao): SampleRepository => ({
  findById: async (id) => {
    const record = await dao.findById(id)
    return record ? { id: record.id, label: record.label } : null
  },
})
