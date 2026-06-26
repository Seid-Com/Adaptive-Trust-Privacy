import app from "./app";
import { autoSeed } from "./lib/autoSeed";
import { pool } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  autoSeed();
});

function gracefulShutdown(signal: string) {
  console.log(`\n[${signal}] Shutting down gracefully...`);
  server.close(() => {
    console.log("[shutdown] HTTP server closed.");
    pool.end().then(() => {
      console.log("[shutdown] Database pool closed.");
      process.exit(0);
    }).catch((err) => {
      console.error("[shutdown] Error closing pool:", err);
      process.exit(1);
    });
  });
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
