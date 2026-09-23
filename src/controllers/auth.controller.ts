import type { Request, Response, NextFunction } from "express";
import {
  generateAuthUrl,
  getLogoutUrl,
  getRequestBaseUrl,
  handleOidcCallback,
  isSsoEnabled,
} from "../services/auth.service.js";
import { getUserBySsoSub, upsertUserFromSso } from "../services/user.service.js";
import { computeScope } from "../services/scope.util.js";

export async function loginHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!isSsoEnabled()) {
      res.redirect("/");
      return;
    }

    const baseUrl = getRequestBaseUrl(req);
    const { url, state, codeVerifier } = await generateAuthUrl(baseUrl);

    if (req.session) {
      req.session.state = state;
      req.session.codeVerifier = codeVerifier;
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
      res.status(400).json({
        error: "SSO Login Error",
        details: error_description || error,
      });
      return;
    }

    const expectedState = req.session?.state;
    const codeVerifier = req.session?.codeVerifier;

    if (!expectedState || !codeVerifier || queryState !== expectedState) {
      res.status(400).json({ error: "Invalid SSO state or session expired. Please try logging in again." });
      return;
    }

    const currentUrl = new URL(req.originalUrl, `${req.protocol}://${req.get("host")}`);

    const user = await handleOidcCallback(currentUrl, expectedState, codeVerifier);
    // Tạo/đồng bộ record user cục bộ (bảng users) — người đăng nhập đầu
    // tiên tự thành admin, những người sau mặc định viewer (xem
    // upsertUserFromSso). Không chặn login nếu bước này lỗi — chỉ log, để
    // requireAuth tự phòng vệ tạo lại ở request kế tiếp.
    try {
      await upsertUserFromSso(user);
    } catch (err) {
      console.error("Lỗi đồng bộ user cục bộ sau đăng nhập SSO:", err);
    }

    if (req.session) {
      req.session.user = user;
      delete req.session.state;
      delete req.session.codeVerifier;
    }

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
  const user = req.session?.user ?? null;

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
  if (user) {
    const appUser = await getUserBySsoSub(user.id);
    role = appUser?.role ?? null;
    userId = appUser?.id ?? null;
    departmentId = appUser?.department_id ?? null;
    scope = await computeScope(appUser);
  }

  res.json({
    ssoEnabled,
    authenticated: !!user,
    user,
    role,
    userId,
    departmentId,
    scope,
  });
}

export async function logoutHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const baseUrl = getRequestBaseUrl(req);
    const logoutUrl = await getLogoutUrl(baseUrl);

    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error("Error destroying session:", err);
        }
        res.clearCookie("connect.sid");
        res.redirect(logoutUrl);
      });
    } else {
      res.redirect(logoutUrl);
    }
  } catch (err) {
    next(err);
  }
}
