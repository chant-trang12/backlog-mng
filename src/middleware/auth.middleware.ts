import type { Request, Response, NextFunction } from "express";
import { isSsoEnabled } from "../services/auth.service.js";
import { getUserBySsoSub, upsertUserFromSso } from "../services/user.service.js";
import { computeScope } from "../services/scope.util.js";
import { isSessionExpired, touchSession } from "../session.config.js";
import { resolveModuleAndAction } from "./actionLog.middleware.js";
import { getRolePermission } from "../services/permission.service.js";

// "module" (nhãn tiếng Việt do resolveModuleAndAction trả, dùng chung với
// Nhật ký hoạt động) -> function_key cấu hình quyền được (permission.service.ts).
// Module không có trong map này (VD "Cấu hình") -> KHÔNG cấu hình qua UI
// Phân quyền, requireWrite bỏ qua để requireAdmin/route riêng tự quyết định.
const MODULE_TO_FUNCTION_KEY: Record<string, string> = {
  "Backlog": "nhiem_vu",
  "Team & Nhân sự": "team_nhan_su",
  "CSKH": "cskh",
  "Roadmap năm": "roadmap",
  "Yêu cầu tính năng": "yeu_cau_tinh_nang",
  "Quản lý tính năng số hoá": "quan_ly_tinh_nang_so_hoa",
};

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
 * - ATTT Session: phiên hết hạn idle (SESSION_IDLE_MINUTES, mặc định 45
 *   phút không tương tác) hoặc absolute (SESSION_ABSOLUTE_MINUTES, mặc định
 *   8 giờ kể từ lúc đăng nhập) -> destroy phiên + trả 401/redirect như
 *   chưa đăng nhập. Cookie đánh cắp được không dùng lại được sau các mốc này.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!isSsoEnabled()) {
    return next();
  }

  const user = req.session?.user;
  if (user) {
    if (isSessionExpired(req.session)) {
      logUnauthenticated(req, "expired");
      req.session.destroy(() => {
        res.clearCookie("connect.sid");
        respondUnauthenticated(req, res);
      });
      return;
    }
    req.user = user;
    // Trượt cửa sổ idle: mỗi request hợp lệ đều tính là tương tác mới.
    touchSession(req);
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

  logUnauthenticated(req, hasSessionCookie(req) ? "no_user_in_session" : "no_cookie");
  respondUnauthenticated(req, res);
}

// Log chẩn đoán (không chứa bí mật) mỗi lần /api trả 401 khi SSO bật: giúp phân
// biệt "trình duyệt/proxy không gửi cookie" (no_cookie), "có cookie nhưng phiên
// không có người dùng — phiên lưu ở tiến trình khác/đã mất" (no_user_in_session)
// và "phiên hết hạn" (expired). pid để nhận ra có NHIỀU tiến trình Node cùng nhận
// request (mỗi tiến trình có bộ nhớ phiên riêng).
function hasSessionCookie(req: Request): boolean {
  return /(?:^|;\s*)connect\.sid=/.test(req.headers.cookie ?? "");
}

function logUnauthenticated(req: Request, reason: string): void {
  if (!req.originalUrl.startsWith("/api")) return; // chỉ log API; điều hướng trang không ồn
  console.warn(
    `[AUTH] 401 reason=${reason} path=${req.originalUrl.split("?")[0]} pid=${process.pid} ` +
      `sid=${String(req.sessionID ?? "").slice(0, 6)} xfp=${req.get("x-forwarded-proto") ?? "-"} host=${req.get("host")}`,
  );
}

/** Trả 401 (API) hoặc redirect trang login (navigation) — dùng chung cho
 * "chưa có phiên" và "phiên đã hết hạn". */
function respondUnauthenticated(req: Request, res: Response): void {
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

// Chấm điểm (% Đánh giá + Nội dung đánh giá ở nút "Chấm điểm", menu Nhiệm
// vụ) tách route riêng "PUT /tasks/:id/grade" (khác route sửa task thường
// "PUT /tasks/:id") — CHẶN/CHO theo function_key RIÊNG "nhiem_vu_cham_diem"
// (bảng role_permissions), không lẫn với "nhiem_vu" chung (sửa nội dung/
// cập nhật tiến độ) dù cùng nằm trên resource "tasks".
// "/tasks/:id/grade-deductions" (POST, nút "Trừ điểm cá nhân" ở CHÍNH popup
// Chấm điểm) dùng CHUNG quyền với "/tasks/:id/grade" — cùng 1 popup, cùng
// 1 hành động "chấm điểm" theo nghĩa rộng (xem task.routes.ts).
const TASK_GRADE_PATH = /^\/tasks\/\d+\/(grade|grade-deductions)$/;

const ROLE_LABEL: Record<string, string> = { editor: "editor", bgd: "BGĐ", viewer: "viewer" };

/**
 * Role "admin": toàn quyền, bypass hẳn (không tra DB).
 *
 * Role "editor"/"bgd"/"viewer": quyền Add/Edit theo TỪNG CHỨC NĂNG (7 chức
 * năng ở PERMISSION_FUNCTIONS, permission.service.ts) đọc từ bảng
 * role_permissions — ADMIN CẤU HÌNH TRỰC TIẾP ở Cấu hình → Phân quyền, có
 * hiệu lực ngay, không cần sửa code/deploy lại. "Chức năng" của 1 request
 * suy từ path qua resolveModuleAndAction() (actionLog.middleware.ts) —
 * CÙNG 1 logic đang dùng để ghi Nhật ký hoạt động, nên luôn khớp đúng
 * module hiển thị trên UI đó.
 *
 * 2 ngoại lệ CỐ ĐỊNH, KHÔNG cấu hình được qua UI (an toàn, tránh admin tự
 * làm yếu bảo mật hệ thống):
 * - Quy tắc 9.1 — CHỈ admin được xóa. Chặn cả khi method=DELETE lẫn khi
 *   action suy ra là "xoa" dù method khác (VD các route bulk xóa hàng loạt
 *   dạng "delete-selected" dùng POST — vá luôn 1 lỗ hổng cũ: trước đây các
 *   route này chỉ bị chặn theo method nên editor/bgd vẫn gọi lọt).
 * - Route KHÔNG thuộc 1 trong 7 Chức năng cấu hình được (VD Cấu hình/
 *   Quản lý User/Nhật ký hoạt động, hoặc route lạ) — bỏ qua ở đây, để
 *   requireAdmin (mount riêng theo tiền tố route, nếu có) hoặc handler
 *   phía sau quyết định, giữ đúng ranh giới bảo mật cũ không đổi.
 *
 * Không có tác dụng khi SSO tắt (req.appUser không được gắn — xem
 * requireAuth). Mount ngay sau requireAuth, TRƯỚC mọi router nghiệp vụ.
 */
export async function requireWrite(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.appUser || !WRITE_METHODS.has(req.method)) {
    return next();
  }
  const role = req.appUser.role;
  // subadmin = "tương tự admin" cho MỌI thao tác ghi dữ liệu nghiệp vụ —
  // bypass hẳn giống admin ở đây. Khác biệt DUY NHẤT của subadmin nằm ở
  // requireAdmin (chỉ "admin" thật mới qua) vs requireAdminOrSubAdmin
  // (cả 2) — xem 2 hàm bên dưới, gắn vào đúng các route thuộc màn hình
  // Cấu hình (Tiêu chí/Ranking team/Cấu hình/Phòng ban/Quản lý User/
  // Phân quyền) để chặn RIÊNG subadmin khỏi những route đó.
  if (role === "admin" || role === "subadmin") return next();

  if (TASK_GRADE_PATH.test(req.path) && (req.method === "PUT" || req.method === "POST")) {
    const perm = await getRolePermission("nhiem_vu_cham_diem", role);
    if (!perm?.can_edit) {
      res.status(403).json({
        error: `Tài khoản ${ROLE_LABEL[role] ?? role} không có quyền chấm điểm — liên hệ Admin hoặc BGĐ.`,
      });
      return;
    }
    return next();
  }

  const { module: moduleLabel, action } = resolveModuleAndAction(req);

  if (req.method === "DELETE" || action === "xoa") {
    res.status(403).json({ error: `Tài khoản ${ROLE_LABEL[role] ?? role} không có quyền xóa dữ liệu — liên hệ Admin.` });
    return;
  }

  const functionKey = moduleLabel ? MODULE_TO_FUNCTION_KEY[moduleLabel] : undefined;
  if (!functionKey) {
    return next();
  }

  const perm = await getRolePermission(functionKey, role);
  const operation = action === "tao_moi" ? "add" : "edit";
  const allowed = operation === "add" ? perm?.can_add : perm?.can_edit;
  if (!allowed) {
    res.status(403).json({
      error: `Tài khoản ${ROLE_LABEL[role] ?? role} không có quyền "${operation === "add" ? "Thêm" : "Sửa"}" ở chức năng này — liên hệ Admin (Cấu hình → Phân quyền).`,
    });
    return;
  }
  next();
}

/**
 * Chỉ role "admin" THẬT mới qua được (subadmin KHÔNG qua được đây dù
 * "tương tự admin" ở mọi nơi khác — đây chính là ranh giới "không được
 * thao tác trên màn hình Cấu hình") — dùng cho các route thuộc màn hình
 * Cấu hình: Quản lý User (/api/users), Phân quyền (/api/role-permissions),
 * Tiêu chí/Ranking team/Danh mục (catalog/ranking/tieuchi.routes.ts),
 * Phòng ban (department.routes.ts). Không có tác dụng khi SSO tắt (giống
 * requireAuth/requireWrite — mọi request đều qua được ở chế độ dev/test
 * không SSO).
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!isSsoEnabled() || req.appUser?.role === "admin") {
    return next();
  }
  res.status(403).json({ error: "Chỉ Admin mới có quyền truy cập mục này." });
}

/**
 * "admin" HOẶC "subadmin" qua được — dùng cho các route KHÔNG thuộc màn
 * hình Cấu hình nhưng vốn chỉ dành cho admin: Nhật ký hoạt động
 * (/api/action-logs — nav riêng, không phải tab trong Cấu hình) và các
 * route xóa hàng loạt (dạng "delete-selected") của Yêu cầu tính năng/Tính năng
 * số hoá — đây là thao tác nghiệp vụ bình thường trên chính trang đó,
 * không phải "màn hình Cấu hình", nên subadmin ("tương tự admin") vẫn
 * làm được. Không có tác dụng khi SSO tắt, giống requireAdmin.
 */
export function requireAdminOrSubAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!isSsoEnabled() || req.appUser?.role === "admin" || req.appUser?.role === "subadmin") {
    return next();
  }
  res.status(403).json({ error: "Chỉ Admin mới có quyền truy cập mục này." });
}
