import "express-session";
import type { AppUser } from "./user.js";
import type { DataScope } from "../services/scope.util.js";

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  email?: string;
  roles?: string[];
}

declare module "express-session" {
  interface SessionData {
    user?: AuthUser;
    codeVerifier?: string;
    state?: string;
    returnTo?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      // User cục bộ (bảng users) tương ứng với session.user hiện tại — role/
      // active dùng để phân quyền, gắn vào req ở requireAuth (auth.middleware.ts).
      appUser?: AppUser;
      // Phạm vi xem/ghi theo phòng ban (Quy tắc 9.2) — tính 1 lần ở
      // attachScope (auth.middleware.ts), ngay sau requireAuth.
      dataScope?: DataScope;
    }
  }
}
