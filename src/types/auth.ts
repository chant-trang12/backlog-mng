import "express-session";
import type { AppUser } from "./user.js";

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
    }
  }
}
