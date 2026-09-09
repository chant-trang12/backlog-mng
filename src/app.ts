import express from "express";
import session from "express-session";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";
import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import departmentRoutes from "./routes/department.routes.js";
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
import { requireAuth } from "./middleware/auth.middleware.js";
import { notFound } from "./middleware/notFound.middleware.js";
import { errorHandler } from "./middleware/errorHandler.middleware.js";
import { isSsoEnabled, getOidcConfig } from "./services/auth.service.js";
import "./db/database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SSO startup check — validate IdP reachability at boot so misconfiguration
// surfaces immediately instead of failing on first login.
async function checkSsoAtStartup(): Promise<void> {
  if (!isSsoEnabled()) return;
  if (process.env.NODE_ENV === "test") return;
  try {
    await getOidcConfig();
    console.log("[SSO] ✓ Startup discovery OK");
  } catch (err) {
    console.error(
      "[SSO] ✗ Startup discovery FAILED — login will not work until this is fixed:",
      err instanceof Error ? err.message : err,
    );
  }
}

export function createApp() {
  const app = express();

  // Security headers
  app.use(helmet({ contentSecurityPolicy: false }));

  // HTTP request logging (skip in test env to keep test output clean)
  if (process.env.NODE_ENV !== "test") {
    app.use(morgan("combined"));
  }

  // Session management
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "backlog-mng-default-dev-secret-key-32chars",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.COOKIE_SECURE === "true",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      },
    }),
  );

  // Limit JSON payload size
  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(path.join(__dirname, "../public")));

  // Public health and auth routes
  app.use(healthRoutes);
  app.use(authRoutes);

  // Protected API routes
  app.use("/api", requireAuth);
  app.use("/api", departmentRoutes);
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

  // Fire-and-forget SSO startup check
  void checkSsoAtStartup();

  return app;
}
