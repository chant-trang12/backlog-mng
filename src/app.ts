import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";
import healthRoutes from "./routes/health.routes.js";
import periodRoutes from "./routes/period.routes.js";
import teamRoutes from "./routes/team.routes.js";
import memberRoutes from "./routes/member.routes.js";
import taskRoutes from "./routes/task.routes.js";
import cskhRoutes from "./routes/cskh.routes.js";
import complianceRoutes from "./routes/compliance.routes.js";
import trainingRoutes from "./routes/training.routes.js";
import attendanceRoutes from "./routes/attendance.routes.js";
import noiquyRoutes from "./routes/noiquy.routes.js";
import supportRoutes from "./routes/support.routes.js";
import danhgiaRoutes from "./routes/danhgia.routes.js";
import tieuchiRoutes from "./routes/tieuchi.routes.js";
import rankingRoutes from "./routes/ranking.routes.js";
import catalogRoutes from "./routes/catalog.routes.js";
import { notFound } from "./middleware/notFound.middleware.js";
import { errorHandler } from "./middleware/errorHandler.middleware.js";
import "./db/database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  // Security headers
  app.use(helmet({ contentSecurityPolicy: false }));

  // HTTP request logging (skip in test env to keep test output clean)
  if (process.env.NODE_ENV !== "test") {
    app.use(morgan("combined"));
  }

  // Limit JSON payload size
  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(path.join(__dirname, "../public")));
  app.use(healthRoutes);
  app.use("/api", periodRoutes);
  app.use("/api", teamRoutes);
  app.use("/api", memberRoutes);
  app.use("/api", taskRoutes);
  app.use("/api", cskhRoutes);
  app.use("/api", complianceRoutes);
  app.use("/api", trainingRoutes);
  app.use("/api", attendanceRoutes);
  app.use("/api", noiquyRoutes);
  app.use("/api", supportRoutes);
  app.use("/api", danhgiaRoutes);
  app.use("/api", tieuchiRoutes);
  app.use("/api", rankingRoutes);
  app.use("/api", catalogRoutes);
  app.use(notFound);
  // Global error handler — must be last, after notFound
  app.use(errorHandler);

  return app;
}
