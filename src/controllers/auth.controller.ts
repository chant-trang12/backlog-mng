import type { Request, Response, NextFunction } from "express";
import {
  generateAuthUrl,
  getLogoutUrl,
  getRequestBaseUrl,
  handleOidcCallback,
  isSsoEnabled,
} from "../services/auth.service.js";

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

export function meHandler(req: Request, res: Response): void {
  const ssoEnabled = isSsoEnabled();
  const user = req.session?.user ?? null;

  res.json({
    ssoEnabled,
    authenticated: !!user,
    user,
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
