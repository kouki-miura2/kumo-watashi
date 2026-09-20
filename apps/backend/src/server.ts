/// <reference types="node" />
import { serve } from '@hono/node-server'

import { createApp } from './app.ts'
import { createSampleDao } from './dao/sample.memory.ts'
import { createAuthGuard } from './repository/auth-guard.header.ts'
import { createSampleRepository } from './repository/sample.repository.ts'
import { createSampleService } from './service/sample.service.ts'

const app = createApp({
  sampleService: createSampleService(createSampleRepository(createSampleDao())),
  auth: { guard: createAuthGuard(), enabled: false, excludePaths: [] },
})
const port = Number(process.env.PORT ?? 8787)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Listening on http://localhost:${info.port}`)
})
