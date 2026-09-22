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
import roadmapRoutes from "./routes/roadmap.routes.js";
import userRoutes from "./routes/user.routes.js";
import { requireAdmin, requireAuth, requireWrite } from "./middleware/auth.middleware.js";
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

// Chặn khởi động nếu chạy production mà SSO đang tắt — SSO tắt nghĩa là
// requireAuth/requireWrite/requireAdmin đều no-op (xem auth.middleware.ts),
// tức toàn bộ /api không có xác thực. Chỉ chấp nhận ở dev/test.
function assertSsoEnabledInProduction(): void {
  if (process.env.NODE_ENV === "production" && !isSsoEnabled()) {
    throw new Error(
      "Refusing to start: NODE_ENV=production but SSO_ENABLED is not 'true'. " +
        "Without SSO, all /api routes run without authentication. " +
        "Set SSO_ENABLED=true and configure OIDC_ISSUER/OIDC_CLIENT_ID, " +
        "or unset NODE_ENV=production for local/dev use.",
    );
  }
}

export function createApp() {
  assertSsoEnabledInProduction();

  const app = express();

  // Security headers. CSP: frontend (public/) is same-origin vanilla JS/CSS
  // with no external CDNs and no inline <script>, so script-src can stay
  // locked to 'self'. Inline style="" attributes are used extensively across
  // public/index.html, so style-src needs 'unsafe-inline'; img-src allows
  // data: for the inline SVG icons in style.css.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'self'"],
          // Only force http->https upgrades when we're actually served over
          // TLS (COOKIE_SECURE=true); otherwise plain-HTTP dev/docker
          // deployments would have their same-origin fetch()/asset requests
          // upgraded to https and fail.
          upgradeInsecureRequests: process.env.COOKIE_SECURE === "true" ? [] : null,
        },
      },
    }),
  );

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

  // Protected API routes — requireAuth gắn req.appUser (role/active, bảng
  // users); requireWrite chặn role "viewer" khỏi mọi request ghi (POST/PUT/
  // PATCH/DELETE) trên TOÀN BỘ /api bên dưới; Quản lý User riêng chỉ
  // "admin" mới vào được (requireAdmin).
  app.use("/api", requireAuth);
  app.use("/api", requireWrite);
  app.use("/api", requireAdmin, userRoutes);
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
  app.use("/api", roadmapRoutes);

  app.use(notFound);
  // Global error handler — must be last, after notFound
  app.use(errorHandler);

  // Fire-and-forget SSO startup check
  void checkSsoAtStartup();

  return app;
}
