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

// Ngoại lệ cho viewer (và bgd, giống hệt viewer — xem comment AppRole):
// TẠO MỚI Yêu cầu tính năng không phải "ghi dữ liệu nghiệp vụ" theo nghĩa
// thông thường — mọi phòng ban (mọi quyền, kể cả viewer/bgd) đều được đề
// xuất. Duyệt/Từ chối/Đưa vào Backlog/Roadmap vẫn cần quyền ghi (editor/
// admin trở lên) NHƯ BÌNH THƯỜNG — không nằm trong danh sách này — cộng
// thêm điều kiện phải thuộc đúng phòng ban đích (requireTargetScope ở
// featureRequest.controller.ts, không liên quan role).
// req.path đã bị Express cắt bỏ tiền tố "/api" (mount ở app.use("/api", ...)).
const VIEWER_ALLOWED_WRITES = new Set(["POST /feature-requests"]);
// File đính kèm là 1 phần của việc "đề xuất" (bổ sung tài liệu cho chính
// yêu cầu vừa/đang tạo) — cùng tinh thần ngoại lệ ở trên, nhưng path có
// :id động nên không đưa được vào Set literal, phải so bằng regex riêng.
const VIEWER_ALLOWED_ATTACHMENT_PATH = /^\/feature-requests\/\d+\/attachment$/;

// Chấm điểm (% Đánh giá + Nội dung đánh giá ở nút "Chấm điểm", menu Nhiệm
// vụ) tách route riêng "PUT /tasks/:id/grade" (khác route sửa task thường
// "PUT /tasks/:id") đúng để CHẶN ĐƯỢC RIÊNG theo role ở đây — không lẫn
// với sửa nội dung/cập nhật tiến độ (vẫn theo luật ghi thông thường).
// Role được chấm điểm: admin (không qua middleware này) + bgd (ngoại lệ
// DUY NHẤT của bgd, coi như "viewer + chấm điểm"). editor TRƯỚC ĐÂY chấm
// được (route cũ dùng chung "PUT /tasks/:id" — editor ghi bình thường),
// NAY bị chặn tường minh (xem nhánh editor bên dưới) theo yêu cầu nghiệp
// vụ mới: chỉ Admin/BGĐ được chấm điểm.
const TASK_GRADE_PATH = /^\/tasks\/\d+\/grade$/;

/**
 * Role "viewer" chỉ đọc — chặn mọi request ghi tới /api, trừ đúng danh sách
 * VIEWER_ALLOWED_WRITES ở trên. Role "bgd" xử lý y hệt viewer, CỘNG THÊM
 * ngoại lệ được PUT .../grade (chấm điểm). Role "editor" được ghi (POST/
 * PUT/PATCH) nhưng không được xóa (Quy tắc 9.1 — quyền xóa chỉ dành cho
 * admin) và KHÔNG được chấm điểm (chỉ admin/bgd). Không có tác dụng khi
 * SSO tắt (req.appUser không được gắn — xem requireAuth). Mount ngay sau
 * requireAuth, TRƯỚC mọi router nghiệp vụ.
 */
export function requireWrite(req: Request, res: Response, next: NextFunction): void {
  if (!req.appUser || !WRITE_METHODS.has(req.method)) {
    return next();
  }
  const role = req.appUser.role;
  const isGradeRequest = req.method === "PUT" && TASK_GRADE_PATH.test(req.path);

  if (role === "viewer" || role === "bgd") {
    if (role === "bgd" && isGradeRequest) {
      return next();
    }
    if (VIEWER_ALLOWED_WRITES.has(`${req.method} ${req.path}`)) {
      return next();
    }
    if (req.method === "POST" && VIEWER_ALLOWED_ATTACHMENT_PATH.test(req.path)) {
      return next();
    }
    res.status(403).json({
      error:
        role === "bgd"
          ? "Tài khoản BGĐ chỉ có quyền xem và chấm điểm, không thể thực hiện thao tác này."
          : "Tài khoản chỉ có quyền xem (viewer), không thể thực hiện thao tác này.",
    });
    return;
  }
  if (role === "editor") {
    if (req.method === "DELETE") {
      res.status(403).json({ error: "Tài khoản editor không có quyền xóa dữ liệu — liên hệ Admin." });
      return;
    }
    if (isGradeRequest) {
      res.status(403).json({ error: "Tài khoản editor không có quyền chấm điểm — liên hệ Admin hoặc BGĐ." });
      return;
    }
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
  res.status(403).json({ error: "Chỉ Admin mới có quyền truy cập mục này." });
}
