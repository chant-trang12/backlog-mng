import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("Authentication & SSO Integration", () => {
  const originalSso = process.env.SSO_ENABLED;

  afterEach(() => {
    if (originalSso === undefined) {
      delete process.env.SSO_ENABLED;
    } else {
      process.env.SSO_ENABLED = originalSso;
    }
  });

  describe("When SSO_ENABLED is false (Default / Local Dev mode)", () => {
    beforeEach(() => {
      process.env.SSO_ENABLED = "false";
    });

    it("returns ssoEnabled: false from /auth/me", async () => {
      const app = createApp();
      const res = await request(app).get("/auth/me");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ssoEnabled: false,
        authenticated: false,
        user: null,
      });
    });

    it("allows API access without any authentication", async () => {
      const app = createApp();
      const res = await request(app).get("/api/periods");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("redirects /auth/login to home page when SSO is disabled", async () => {
      const app = createApp();
      const res = await request(app).get("/auth/login");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/");
    });

    it("redirects /auth/logout to home page", async () => {
      const app = createApp();
      const res = await request(app).get("/auth/logout");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/");
    });
  });

  describe("When SSO_ENABLED is true (Production SSO mode)", () => {
    beforeEach(() => {
      process.env.SSO_ENABLED = "true";
    });

    it("blocks unauthenticated API requests with 401 and loginUrl", async () => {
      const app = createApp();
      const res = await request(app).get("/api/periods");
      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        error: "Unauthorized",
        loginUrl: "/auth/login",
      });
    });

    it("blocks other protected API endpoints when unauthenticated", async () => {
      const app = createApp();
      const res = await request(app).get("/api/tags");
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Unauthorized");
    });

    it("redirects browser page navigation to /auth/login when unauthenticated", async () => {
      const { requireAuth } = await import("../src/middleware/auth.middleware.js");
      let redirectedUrl = "";
      const req: any = {
        headers: { accept: "text/html,application/xhtml+xml" },
        originalUrl: "/dashboard",
        session: {},
      };
      const res: any = {
        redirect: (url: string) => {
          redirectedUrl = url;
        },
        status: () => res,
        json: () => res,
      };
      requireAuth(req, res, () => {});
      expect(redirectedUrl).toBe("/auth/login");
      expect(req.session.returnTo).toBe("/dashboard");
    });

    it("rejects /auth/callback with invalid or missing state", async () => {
      const app = createApp();
      const res = await request(app).get("/auth/callback?code=abc&state=invalid-state");
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid SSO state/i);
    });

    it("allows access and sets req.user when user is in session", async () => {
      const { requireAuth } = await import("../src/middleware/auth.middleware.js");
      let nextCalled = false;
      const mockUser = {
        id: "user-123",
        username: "hieunv",
        name: "Hieu Nguyen",
        email: "hieu@company.com",
      };
      const req: any = {
        headers: {},
        originalUrl: "/api/periods",
        session: { user: mockUser },
      };
      const res: any = {
        status: () => res,
        json: () => res,
      };
      requireAuth(req, res, () => {
        nextCalled = true;
      });
      expect(nextCalled).toBe(true);
      expect(req.user).toEqual(mockUser);
    });
  });
});
