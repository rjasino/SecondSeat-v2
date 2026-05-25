import { createApp } from './app.js';
import { loadConfig } from './config/index.js';

const config = loadConfig();
const app = createApp();

app.listen(config.INFERENCE_PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[inference] listening on :${config.INFERENCE_PORT}`);
});
