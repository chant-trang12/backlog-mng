import "dotenv/config";
import { createApp } from "./app.js";
import { db } from "./db/database.js";

const port = process.env.PORT ?? 3001;
const app = createApp();

const server = app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

async function shutdown(signal: string) {
  console.log(`\n${signal} received — shutting down gracefully...`);
  server.close(async () => {
    try {
      await db.destroy();
      console.log("DB connection pool closed.");
    } catch (err) {
      console.error("Error closing DB pool:", err);
    }
    process.exit(0);
  });
  // Force exit after 10s if connections won't close
  setTimeout(() => {
    console.error("Forced exit after timeout.");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
