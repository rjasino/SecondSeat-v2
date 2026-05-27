import { createApp } from "./app.js";
import { connectDB } from "./lib/db.js";
import { warmupEmbeddingModel } from "@secondseat/embedding";
import { inferenceConfig } from "./config/config.js";

async function bootstrap() {
  await connectDB();
  await warmupEmbeddingModel();

  const app = createApp();
  app.listen(inferenceConfig.PORT, () => {
    console.log(`[inference] listening on http://localhost:${inferenceConfig.PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("[inference] Fatal startup error:", err);
  process.exit(1);
});
