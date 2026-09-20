import type { SampleRepository } from '../repository/sample.repository.ts'

/** Response shape this endpoint hands back to the route — the service's job, not the repository's. */
export interface SampleView {
  id: string
  message: string
}

export interface SampleService {
  getSample: (id: string) => Promise<SampleView | null>
}

/**
 * Business logic lives here: orchestrating repositories (only one in this sample, but this
 * is where a second repository call, a validation rule, or a cross-entity check would go),
 * and shaping the response the route hands back. `null` means "not found" — the route
 * layer decides that means a 404, this layer doesn't know about HTTP.
 */
export const createSampleService = (repository: SampleRepository): SampleService => ({
  getSample: async (id) => {
    const sample = await repository.findById(id)
    return sample ? { id: sample.id, message: `Sample "${sample.label}"` } : null
  },
})
