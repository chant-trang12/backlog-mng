import type { Request, Response, NextFunction } from "express";
import {
  buildCallbackUrl,
  generateAuthUrl,
  getLogoutUrl,
  getRequestBaseUrl,
  handleOidcCallback,
  isSsoEnabled,
} from "../services/auth.service.js";
import { getUserBySsoSub, upsertUserFromSso } from "../services/user.service.js";
import { computeScope } from "../services/scope.util.js";
import { clearSessionCookie, countSessionCookies, isSessionExpired } from "../session.config.js";
import { recordActionLog } from "../services/actionLog.service.js";
import { sendHtmlError, wantsHtmlPage } from "../utils/errorPage.js";
import { computeHiddenMenuKeysByRole, computeHiddenMenuKeysByDepartment } from "../services/menu.service.js";
import type { AppRole } from "../types/user.js";

// Đăng nhập đang chờ IdP được dùng lại trong khoảng này (người dùng nhập mật
// khẩu ở IdP có thể mất vài chục giây).
const PENDING_LOGIN_TTL_MS = 5 * 60 * 1000;

// Lỗi trong luồng đăng nhập: trình duyệt điều hướng thẳng -> trang HTML thân
// thiện; API/fetch (Accept không phải HTML) -> JSON như cũ.
function respondAuthError(req: Request, res: Response, status: number, message: string): void {
  if (wantsHtmlPage(req)) {
    sendHtmlError(res, status, message);
    return;
  }
  res.status(status).json({ error: message });
}

// Cookie đánh dấu "đã tự thử đăng nhập lại 1 lần" (xem callbackHandler).
const LOGIN_RETRY_COOKIE = "backlog_login_retry";

function hasLoginRetryCookie(req: Request): boolean {
  return new RegExp(`(?:^|;\\s*)${LOGIN_RETRY_COOKIE}=1(?:;|$)`).test(req.headers.cookie ?? "");
}

function loginRetryCookieOptions() {
  return {
    path: "/auth",
    maxAge: 60 * 1000,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.COOKIE_SECURE === "true",
  };
}

export async function loginHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!isSsoEnabled()) {
      res.redirect("/");
      return;
    }

    // Đã đăng nhập hợp lệ -> không cần vòng qua IdP nữa.
    if (req.session?.user && !isSessionExpired(req.session)) {
      res.redirect("/");
      return;
    }

    // Chống race: giao diện có thể gọi /auth/login 2 lần gần như cùng lúc (vd
    // /auth/me chưa đăng nhập + 1 API trả 401 cùng chuyển hướng). Nếu mỗi
    // request tự sinh state mới và ghi đè vào phiên thì (a) trình duyệt đi theo
    // URL của request này nhưng phiên giữ state của request kia -> "Invalid SSO
    // state", (b) request chậm hơn lưu lại phiên cũ sau khi /auth/callback đã
    // ghi user -> mất đăng nhập, lặp vô hạn. Có đăng nhập đang chờ còn mới thì
    // dùng lại đúng URL (cùng state/PKCE), KHÔNG sửa phiên.
    const pending = req.session?.pendingLogin;
    if (pending && req.session?.state && req.session?.codeVerifier && Date.now() - pending.at < PENDING_LOGIN_TTL_MS) {
      res.redirect(pending.url);
      return;
    }

    const baseUrl = getRequestBaseUrl(req);
    const { url, state, codeVerifier } = await generateAuthUrl(baseUrl);

    if (req.session) {
      req.session.state = state;
      req.session.codeVerifier = codeVerifier;
      req.session.pendingLogin = { url, at: Date.now() };
    }

    res.redirect(url);
  } catch (err) {
    next(err);
  }
}

export async function callbackHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!isSsoEnabled()) {
      res.redirect("/");
      return;
    }

    const { state: queryState, error, error_description } = req.query;

    if (error) {
      // Chi tiết lỗi từ IdP chỉ ghi log server, không hiện thẳng cho người dùng.
      console.error("[SSO] IdP trả lỗi ở callback:", error, error_description);
      respondAuthError(req, res, 400, "Đăng nhập SSO không thành công. Vui lòng thử đăng nhập lại.");
      return;
    }

    const expectedState = req.session?.state;
    const codeVerifier = req.session?.codeVerifier;

    if (!expectedState || !codeVerifier || queryState !== expectedState) {
      // Log chẩn đoán (không chứa bí mật): vì sao callback bị coi là không hợp lệ.
      // no_cookie = trình duyệt không gửi cookie phiên; no_state_in_session = phiên
      // có nhưng không còn state (đã dùng/hết hạn/khác phiên); state_mismatch = state
      // trong URL khác state đã lưu (2 lần đăng nhập đè nhau).
      const reason = countSessionCookies(req.headers.cookie) === 0
        ? "no_cookie"
        : !expectedState || !codeVerifier
          ? "no_state_in_session"
          : "state_mismatch";
      console.warn(
        `[SSO] callback không hợp lệ: reason=${reason} pid=${process.pid} sessionCookies=${countSessionCookies(req.headers.cookie)} sid=${String(req.sessionID ?? "").slice(0, 6)} ` +
          `retry=${hasLoginRetryCookie(req)} host=${req.get("host")} xfp=${req.get("x-forwarded-proto") ?? "-"}`,
      );
      // Tự thử lại ĐÚNG 1 lần: state lệch thường do 2 request /auth/login song
      // song khi chưa có cookie (mỗi request 1 phiên riêng), bấm Back/F5 trên
      // trang callback, hoặc 2 tab đăng nhập — IdP lúc này vẫn còn phiên nên
      // đăng nhập lại là xong ngay, người dùng không phải thấy trang lỗi. Cookie
      // đánh dấu ngắn hạn chặn việc thử lại lặp vô hạn: lần 2 vẫn lệch thì mới
      // hiện lỗi.
      if (!hasLoginRetryCookie(req)) {
        res.cookie(LOGIN_RETRY_COOKIE, "1", loginRetryCookieOptions());
        res.redirect("/auth/login");
        return;
      }
      res.clearCookie(LOGIN_RETRY_COOKIE, { path: "/auth" });
      respondAuthError(req, res, 400, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.");
      return;
    }

    const currentUrl = buildCallbackUrl(getRequestBaseUrl(req), req.originalUrl);

    const user = await handleOidcCallback(currentUrl, expectedState, codeVerifier);
    // Tạo/đồng bộ record user cục bộ (bảng users) — người đăng nhập đầu
    // tiên tự thành admin, những người sau mặc định viewer (xem
    // upsertUserFromSso). Không chặn login nếu bước này lỗi — chỉ log, để
    // requireAuth tự phòng vệ tạo lại ở request kế tiếp.
    let appUser: Awaited<ReturnType<typeof upsertUserFromSso>> | undefined;
    try {
      appUser = await upsertUserFromSso(user);
    } catch (err) {
      console.error("Lỗi đồng bộ user cục bộ sau đăng nhập SSO:", err);
    }
    // Nhật ký hoạt động — route /auth/* nằm NGOÀI /api nên actionLogMiddleware
    // (chỉ gắn ở "/api") không tự bắt được, phải ghi tay ở đây.
    void recordActionLog({
      user_id: appUser?.id ?? null,
      user_name: appUser?.name ?? user.name ?? user.username ?? null,
      department_id: appUser?.department_id ?? null,
      action: "dang_nhap",
      module: null,
      description: "Đăng nhập vào hệ thống",
      method: req.method,
      path: req.path,
      ip: req.ip ?? null,
    });

    if (req.session) {
      req.session.user = user;
      // ATTT Session: ghi mốc đăng nhập — absolute timeout đo từ đây, idle
      // timeout đo từ lastSeen (được requireAuth trượt theo mỗi request).
      req.session.loginAt = Date.now();
      req.session.lastSeen = req.session.loginAt;
      delete req.session.state;
      delete req.session.codeVerifier;
      delete req.session.pendingLogin;
    }

    res.clearCookie(LOGIN_RETRY_COOKIE, { path: "/auth" });
    const returnTo = req.session?.returnTo || "/";
    if (req.session) {
      delete req.session.returnTo;
    }

    res.redirect(returnTo);
  } catch (err) {
    next(err);
  }
}

export async function meHandler(req: Request, res: Response): Promise<void> {
  const ssoEnabled = isSsoEnabled();
  // ATTT Session: phiên hết hạn (idle/absolute) -> báo chưa đăng nhập để FE
  // hiển thị màn hình đăng nhập thay vì vẫn nhận diện user cũ.
  const user = req.session?.user && !isSessionExpired(req.session) ? req.session.user : null;

  // role dùng để FE ẩn/hiện mục "Quản lý User" (admin) và tự vô hiệu hoá
  // thao tác ghi phía UI cho viewer — chặn thật sự vẫn ở requireWrite phía
  // server, đây chỉ là gợi ý hiển thị. userId = id cục bộ (bảng users, khác
  // user.id là sso_sub) — FE dùng để tự nhận ra "chính mình" trong bảng
  // Quản lý User (không cho tự đổi role/khóa chính mình, khớp guard ở service).
  // scope: phạm vi phòng ban (Quy tắc 9.2) — FE dùng để khoá/ẩn bộ lọc phòng
  // ban khi tài khoản bị giới hạn (all=false), và hiển thị thông báo "chưa
  // gán phòng ban" khi departmentId=null. Chỉ mang tính GỢI Ý HIỂN THỊ —
  // chặn thật vẫn nằm ở attachScope/scope.util.ts phía server.
  let role: string | null = null;
  let userId: number | null = null;
  let departmentId: number | null = null;
  let scope: { all: boolean; departmentId: number | null } = { all: true, departmentId: null };
  // hiddenMenuKeys — mục menu trái (data-page) FE phải ẩn + chặn chuyển
  // sang cho tài khoản này: hợp nhất 2 nguồn (Cấu hình → Phân quyền → can_
  // read theo Chức năng, VÀ Phân quyền theo phòng ban) — chỉ GỢI Ý HIỂN
  // THỊ như role/scope ở trên, không phải chặn thật (Trang chủ/HDSD vốn
  // không có API riêng để chặn server; các Chức năng còn lại chặn thật ở
  // requireWrite cho ghi + DataScope cho đọc theo phòng ban như cũ). Chỉ
  // tính khi SSO bật + đã xác định role (ssoEnabled=false hoặc role=null
  // -> mảng rỗng, khớp hành vi "không phân quyền UI khi không có SSO").
  let hiddenMenuKeys: string[] = [];
  if (user) {
    const appUser = await getUserBySsoSub(user.id);
    role = appUser?.role ?? null;
    userId = appUser?.id ?? null;
    departmentId = appUser?.department_id ?? null;
    scope = await computeScope(appUser);
    if (ssoEnabled && role) {
      const [byRole, byDept] = await Promise.all([
        computeHiddenMenuKeysByRole(role as AppRole),
        computeHiddenMenuKeysByDepartment(role as AppRole, departmentId),
      ]);
      hiddenMenuKeys = [...new Set([...byRole, ...byDept])];
    }
  }

  res.json({
    ssoEnabled,
    authenticated: !!user,
    user,
    role,
    userId,
    departmentId,
    scope,
    hiddenMenuKeys,
  });
}

export async function logoutHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Chống vòng lặp đăng xuất: nếu OIDC_LOGOUT_URI (post_logout_redirect_uri)
    // trỏ về chính /auth/logout, IdP sau khi đăng xuất sẽ gọi lại route này —
    // lúc đó phiên đã bị hủy (không còn user) nên chỉ cần về trang chủ, KHÔNG
    // chuyển tiếp lên IdP lần nữa (nếu không sẽ lặp vô hạn giữa 2 bên).
    if (!req.session?.user) {
      clearSessionCookie(res);
      res.redirect("/");
      return;
    }

    const baseUrl = getRequestBaseUrl(req);
    const logoutUrl = await getLogoutUrl(baseUrl);

    // Nhật ký hoạt động — lấy user TRƯỚC khi session.destroy() xoá mất
    // req.session.user; route /auth/* nằm ngoài /api nên actionLogMiddleware
    // không tự bắt được, phải ghi tay giống loginHandler ở trên.
    const sessionUser = req.session?.user;
    if (sessionUser) {
      const appUser = await getUserBySsoSub(sessionUser.id).catch(() => undefined);
      void recordActionLog({
        user_id: appUser?.id ?? null,
        user_name: appUser?.name ?? sessionUser.name ?? sessionUser.username ?? null,
        department_id: appUser?.department_id ?? null,
        action: "dang_xuat",
        module: null,
        description: "Đăng xuất khỏi hệ thống",
        method: req.method,
        path: req.path,
        ip: req.ip ?? null,
      });
    }

    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error("Error destroying session:", err);
        }
        clearSessionCookie(res);
        res.redirect(logoutUrl);
      });
    } else {
      res.redirect(logoutUrl);
    }
  } catch (err) {
    next(err);
  }
}
