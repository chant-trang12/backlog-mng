import type { Request, Response, NextFunction } from "express";
import { isSsoEnabled } from "../services/auth.service.js";

/**
 * Middleware to require authentication when SSO is enabled.
 * If SSO_ENABLED is false (default in dev/test), all requests pass through.
 * If SSO_ENABLED is true:
 * - Authenticated requests pass through with req.user set.
 * - API requests without a session return 401 Unauthorized with loginUrl.
 * - Browser navigation requests redirect to /auth/login.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!isSsoEnabled()) {
    return next();
  }

  const user = req.session?.user;
  if (user) {
    req.user = user;
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
