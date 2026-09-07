import "express-session";

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
    }
  }
}
