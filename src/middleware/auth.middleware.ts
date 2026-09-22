import type { Request, Response, NextFunction } from "express";
import { isSsoEnabled } from "../services/auth.service.js";
import { getUserBySsoSub, upsertUserFromSso } from "../services/user.service.js";
import { computeScope } from "../services/scope.util.js";

/**
 * Middleware to require authentication when SSO is enabled.
 * If SSO_ENABLED is false (default in dev/test), all requests pass through
 * — no local user/role is attached either (matches the existing "auth is
 * off" bypass; Quản lý User + phân quyền chỉ có ý nghĩa khi SSO bật).
 * If SSO_ENABLED is true:
 * - Authenticated requests pass through with req.user (session/IdP claims)
 *   and req.appUser (local user — role/active, bảng users) set.
 * - Tài khoản bị khóa (users.active = false) -> 403, không cho qua dù đã
 *   đăng nhập SSO thành công (không đủ để chặn tại IdP).
 * - API requests without a session return 401 Unauthorized with loginUrl.
 * - Browser navigation requests redirect to /auth/login.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!isSsoEnabled()) {
    return next();
  }

  const user = req.session?.user;
  if (user) {
    req.user = user;
    // Bình thường đã có sẵn (tạo ở callbackHandler lúc login) — upsert lại
    // ở đây chỉ là lớp phòng vệ, phòng trường hợp record bị mất/chưa kịp tạo.
    const appUser = (await getUserBySsoSub(user.id)) ?? (await upsertUserFromSso(user));
    if (!appUser.active) {
      res.status(403).json({ error: "Tài khoản đã bị khóa. Liên hệ Admin để được mở lại." });
      return;
    }
    req.appUser = appUser;
    return next();
  }

  // If client accepts HTML and is not calling an /api endpoint, redirect to login
  const wantsHtml = req.headers.accept && req.headers.accept.includes("text/html");
  if (wantsHtml && !req.originalUrl.startsWith("/api")) {
    if (req.session) {
      req.session.returnTo = req.originalUrl;
    }
    res.redirect("/auth/login");
    return;
  }

  // For API calls or JSON requests, return 401 with loginUrl
  res.status(401).json({
    error: "Unauthorized",
    loginUrl: "/auth/login",
  });
}

/**
 * Tính phạm vi xem/ghi theo phòng ban (Quy tắc 9.2) và gắn vào req.dataScope
 * — MỘT LẦN duy nhất ngay sau requireAuth, để mọi controller/service phía
 * sau chỉ việc đọc ra (xem scope.util.ts). computeScope() tự xử lý trường
 * hợp SSO tắt (req.appUser undefined) bằng cách trả về scope KHÔNG giới hạn
 * — đồng bộ với hành vi hiện có của requireAuth/requireWrite ở dev/test.
 */
export async function attachScope(req: Request, _res: Response, next: NextFunction): Promise<void> {
  req.dataScope = await computeScope(req.appUser);
  next();
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Role "viewer" chỉ đọc — chặn mọi request ghi tới /api. Role "editor" được
 * ghi (POST/PUT/PATCH) nhưng không được xóa (Quy tắc 9.1) — quyền xóa chỉ
 * dành cho admin. Không có tác dụng khi SSO tắt (req.appUser không được
 * gắn — xem requireAuth). Mount ngay sau requireAuth, TRƯỚC mọi router
 * nghiệp vụ.
 */
export function requireWrite(req: Request, res: Response, next: NextFunction): void {
  if (!req.appUser || !WRITE_METHODS.has(req.method)) {
    return next();
  }
  if (req.appUser.role === "viewer") {
    res.status(403).json({ error: "Tài khoản chỉ có quyền xem (viewer), không thể thực hiện thao tác này." });
    return;
  }
  if (req.appUser.role === "editor" && req.method === "DELETE") {
    res.status(403).json({ error: "Tài khoản editor không có quyền xóa dữ liệu — liên hệ Admin." });
    return;
  }
  next();
}

/**
 * Chỉ role "admin" mới qua được — dùng cho router Quản lý User
 * (/api/users). Không có tác dụng khi SSO tắt (giống requireAuth/
 * requireWrite — mọi request đều qua được ở chế độ dev/test không SSO).
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!isSsoEnabled() || req.appUser?.role === "admin") {
    return next();
  }
  res.status(403).json({ error: "Chỉ Admin mới có quyền truy cập mục Quản lý User." });
}
