import { createApp } from "./app.ts";
import { createStatusRepository } from "./repositories/status.memory.ts";

export default createApp({ statusRepository: createStatusRepository() });
