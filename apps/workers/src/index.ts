import { loadConfig } from './config/index.js';
import { createHealthServer } from './health.js';

const config = loadConfig();
const server = createHealthServer();

server.listen(config.WORKER_HEALTH_PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[workers] health probe on :${config.WORKER_HEALTH_PORT}`);
});
