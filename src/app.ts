import express from "express";
import session from "express-session";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSessionOptions } from "./session.config.js";
import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import departmentRoutes from "./routes/department.routes.js";
import periodRoutes from "./routes/period.routes.js";
import teamRoutes from "./routes/team.routes.js";
import memberRoutes from "./routes/member.routes.js";
import taskRoutes from "./routes/task.routes.js";
import taskItemRoutes from "./routes/taskItem.routes.js";
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
import featureRequestRoutes from "./routes/featureRequest.routes.js";
import digitalFeatureRoutes from "./routes/digitalFeature.routes.js";
import actionLogRoutes from "./routes/actionLog.routes.js";
import { attachScope, requireAdmin, requireAuth, requireWrite } from "./middleware/auth.middleware.js";
import { actionLogMiddleware } from "./middleware/actionLog.middleware.js";
import { sanitizeWriteInput } from "./middleware/sanitize.middleware.js";
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
          // fonts.googleapis.com: stylesheet <link> của trang HDSD nhúng
          // (public/huong-dan-su-dung.html) — font-src bên dưới đã cho phép
          // https: nói chung nên file .woff2 thật tải bình thường, chỉ
          // riêng CSS khai báo @font-face là cần domain này trong style-src.
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
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

  // Session management — ATTT Session: rolling + maxAge 45 phút (idle
  // timeout, khuyến nghị 30-50 phút) + absolute timeout 8 giờ kiểm tra ở
  // phía server (session.config.ts + requireAuth). Trước đây cookie chỉ có
  // maxAge 24 giờ, không giới hạn idle/absolute ở server.
  app.use(
    session({
      ...buildSessionOptions(),
      secret: process.env.SESSION_SECRET || "backlog-mng-default-dev-secret-key-32chars",
    }),
  );

  // Limit JSON payload size
  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(path.join(__dirname, "../public")));

  // Public health and auth routes
  app.use(healthRoutes);
  app.use(authRoutes);

  // Protected API routes — requireAuth gắn req.appUser (role/active, bảng
  // users); attachScope gắn req.dataScope (phạm vi theo phòng ban, Quy tắc
  // 9.2 — xem scope.util.ts); requireWrite chặn role "viewer" khỏi mọi
  // request ghi (POST/PUT/PATCH/DELETE) trên TOÀN BỘ /api bên dưới; Quản lý
  // User riêng chỉ "admin" mới vào được (requireAdmin).
  app.use("/api", requireAuth);
  // ATTT (Stored XSS): strip ký tự "<"/">" khỏi mọi request ghi trước khi vào
  // bất kỳ handler nghiệp vụ nào — xem middleware/sanitize.middleware.ts.
  app.use("/api", sanitizeWriteInput);
  app.use("/api", attachScope);
  app.use("/api", requireWrite);
  // Nhật ký hoạt động — đăng ký NGAY sau requireWrite (req.appUser đã có,
  // nếu SSO bật) và TRƯỚC mọi router nghiệp vụ, để res.on("finish") của nó
  // được gắn trước khi bất kỳ handler nào phía sau kịp gửi response. Middleware
  // này tự bỏ qua GET nên không ảnh hưởng gì router action-logs bên dưới.
  app.use("/api", actionLogMiddleware);
  // BUG đã fix: mount cũ là app.use("/api", requireAdmin, userRoutes) — vì
  // userRoutes tự định nghĩa full path "/users" (không phải "/"), Express
  // chạy requireAdmin cho MỌI request khớp tiền tố "/api" (kể cả
  // /api/periods, /api/departments...) TRƯỚC KHI userRoutes kịp quyết định
  // path đó có thuộc nó không — non-admin bị 403 trên toàn bộ /api, không
  // chỉ /api/users. Scope requireAdmin đúng vào tiền tố "/api/users".
  app.use("/api/users", requireAdmin);
  // Nhật ký hoạt động — chỉ Admin xem được, cùng lý do/cách chặn như
  // /api/users ở trên (scope requireAdmin đúng vào tiền tố route, không
  // đè lên toàn bộ /api).
  app.use("/api/action-logs", requireAdmin);
  // Xóa nhiều Yêu cầu tính năng (checkbox trên bảng) — chỉ Admin, cùng cách
  // scope requireAdmin đúng tiền tố route như /api/users, /api/action-logs
  // ở trên (không đè lên toàn bộ /api/feature-requests — route xem/tạo/sửa/
  // Duyệt/Từ chối/xóa từng cái vẫn theo luật cũ, editor vẫn dùng được).
  app.use("/api/feature-requests/delete-selected", requireAdmin);
  // Xóa nhiều Tính năng số hoá (checkbox trên bảng) — chỉ Admin, scope
  // requireAdmin đúng tiền tố route, không đè lên toàn bộ /api/digital-features.
  app.use("/api/digital-features/delete-selected", requireAdmin);
  // Xóa nhiều màn hình (tab "Màn hình, Tính năng & Phân quyền" trong chi
  // tiết Tính năng số hoá) — chỉ Admin, cùng cách scope tiền tố ở trên.
  app.use("/api/digital-features/:id/screens/delete-selected", requireAdmin);
  // Xóa nhiều Danh mục (Master Data) — tab 3 trong chi tiết Tính năng số
  // hoá, chỉ Admin, cùng cách scope tiền tố ở trên.
  app.use("/api/digital-features/:id/master-data/delete-selected", requireAdmin);
  // Xóa nhiều Đối tượng dữ liệu & Vòng đời trạng thái — tab 4 trong chi
  // tiết Tính năng số hoá, chỉ Admin, cùng cách scope tiền tố ở trên.
  app.use("/api/digital-features/:id/data-objects/delete-selected", requireAdmin);
  // Xóa nhiều Tích hợp & Sự kiện — tab 5 trong chi tiết Tính năng số hoá,
  // chỉ Admin, cùng cách scope tiền tố ở trên.
  app.use("/api/digital-features/:id/integrations/delete-selected", requireAdmin);
  app.use("/api", userRoutes);
  app.use("/api", actionLogRoutes);
  app.use("/api", departmentRoutes);
  app.use("/api", periodRoutes);
  app.use("/api", teamRoutes);
  app.use("/api", memberRoutes);
  app.use("/api", taskRoutes);
  app.use("/api", taskItemRoutes);
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
  app.use("/api", featureRequestRoutes);
  app.use("/api", digitalFeatureRoutes);

  app.use(notFound);
  // Global error handler — must be last, after notFound
  app.use(errorHandler);

  // Fire-and-forget SSO startup check
  void checkSsoAtStartup();

  return app;
}
