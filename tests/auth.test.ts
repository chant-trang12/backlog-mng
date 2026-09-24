import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { requireAdmin, requireWrite } from "../src/middleware/auth.middleware.js";

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
        role: null,
        userId: null,
        departmentId: null,
        scope: { all: true, departmentId: null },
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

    it("allows access and sets req.user + req.appUser when user is in session", async () => {
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
      // requireAuth tra cứu/tạo user cục bộ (bảng users) — là async, phải await.
      await requireAuth(req, res, () => {
        nextCalled = true;
      });
      expect(nextCalled).toBe(true);
      expect(req.user).toEqual(mockUser);
      expect(req.appUser).toBeDefined();
      expect(req.appUser.sso_sub).toBe("user-123");
      expect(["admin", "viewer"]).toContain(req.appUser.role); // admin nếu là user đầu tiên, viewer nếu không
    });
  });

  describe("requireWrite — Quy tắc 9.1: editor không được xóa", () => {
    function callRequireWrite(role: "admin" | "editor" | "viewer" | undefined, method: string, path?: string) {
      const req: any = { appUser: role ? { role } : undefined, method, path };
      let statusCode: number | undefined;
      let body: any;
      let nextCalled = false;
      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (payload: any) => {
          body = payload;
          return res;
        },
      };
      requireWrite(req, res, () => {
        nextCalled = true;
      });
      return { statusCode, body, nextCalled };
    }

    it("blocks editor from DELETE with 403", () => {
      const { statusCode, body, nextCalled } = callRequireWrite("editor", "DELETE");
      expect(statusCode).toBe(403);
      expect(body.error).toMatch(/editor không có quyền xóa/i);
      expect(nextCalled).toBe(false);
    });

    it("allows editor to POST/PUT/PATCH", () => {
      for (const method of ["POST", "PUT", "PATCH"]) {
        const { nextCalled } = callRequireWrite("editor", method);
        expect(nextCalled).toBe(true);
      }
    });

    it("allows admin to DELETE", () => {
      const { nextCalled } = callRequireWrite("admin", "DELETE");
      expect(nextCalled).toBe(true);
    });

    it("still blocks viewer from any write method, including DELETE", () => {
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        const { statusCode, nextCalled } = callRequireWrite("viewer", method);
        expect(statusCode).toBe(403);
        expect(nextCalled).toBe(false);
      }
    });

    it("allows viewer to POST /feature-requests (đề xuất — mọi phòng ban đều được, không phải quyền ghi thông thường)", () => {
      const { nextCalled } = callRequireWrite("viewer", "POST", "/feature-requests");
      expect(nextCalled).toBe(true);
    });

    it("still blocks viewer from PUT/DELETE /feature-requests/:id and POST .../approve|reject (chỉ ngoại lệ đúng route tạo mới)", () => {
      for (const [method, path] of [
        ["PUT", "/feature-requests/1"],
        ["DELETE", "/feature-requests/1"],
        ["POST", "/feature-requests/1/approve"],
        ["POST", "/feature-requests/1/reject"],
        ["POST", "/feature-requests/1/to-backlog"],
      ] as const) {
        const { statusCode, nextCalled } = callRequireWrite("viewer", method, path);
        expect(statusCode).toBe(403);
        expect(nextCalled).toBe(false);
      }
    });

    it("passes through GET for every role, including editor", () => {
      for (const role of ["admin", "editor", "viewer"] as const) {
        const { nextCalled } = callRequireWrite(role, "GET");
        expect(nextCalled).toBe(true);
      }
    });

    it("passes through when req.appUser is not set (SSO disabled)", () => {
      const { nextCalled } = callRequireWrite(undefined, "DELETE");
      expect(nextCalled).toBe(true);
    });
  });

  describe("requireAdmin — chỉ admin mới vào được (/api/users/*, và các route quản lý Cấu hình)", () => {
    function callRequireAdmin(role: "admin" | "editor" | "viewer" | undefined) {
      const req: any = { appUser: role ? { role } : undefined };
      let statusCode: number | undefined;
      let body: any;
      let nextCalled = false;
      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (payload: any) => {
          body = payload;
          return res;
        },
      };
      requireAdmin(req, res, () => {
        nextCalled = true;
      });
      return { statusCode, body, nextCalled };
    }

    it("allows admin", () => {
      process.env.SSO_ENABLED = "true";
      const { nextCalled } = callRequireAdmin("admin");
      expect(nextCalled).toBe(true);
    });

    it("blocks editor with 403", () => {
      process.env.SSO_ENABLED = "true";
      const { statusCode, body, nextCalled } = callRequireAdmin("editor");
      expect(statusCode).toBe(403);
      expect(body.error).toMatch(/chỉ admin/i);
      expect(nextCalled).toBe(false);
    });

    it("blocks viewer with 403", () => {
      process.env.SSO_ENABLED = "true";
      const { statusCode, nextCalled } = callRequireAdmin("viewer");
      expect(statusCode).toBe(403);
      expect(nextCalled).toBe(false);
    });

    it("blocks when req.appUser is not set, while SSO is enabled", () => {
      process.env.SSO_ENABLED = "true";
      const { statusCode, nextCalled } = callRequireAdmin(undefined);
      expect(statusCode).toBe(403);
      expect(nextCalled).toBe(false);
    });

    it("passes through every role when SSO is disabled", () => {
      process.env.SSO_ENABLED = "false";
      for (const role of ["admin", "editor", "viewer", undefined] as const) {
        const { nextCalled } = callRequireAdmin(role);
        expect(nextCalled).toBe(true);
      }
    });
  });
});
