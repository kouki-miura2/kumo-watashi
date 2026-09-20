import { createApp } from './app.ts'
import { createSampleDao } from './dao/sample.memory.ts'
import { createAuthGuard } from './repository/auth-guard.header.ts'
import { createSampleRepository } from './repository/sample.repository.ts'
import { createSampleService } from './service/sample.service.ts'

export default createApp({
  sampleService: createSampleService(createSampleRepository(createSampleDao())),
  auth: { guard: createAuthGuard(), enabled: false, excludePaths: [] },
})
