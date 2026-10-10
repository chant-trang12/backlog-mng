import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { requireAdmin, requireAdminOrSubAdmin, requireWrite } from "../src/middleware/auth.middleware.js";

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
        // ATTT Session: phiên giả phải có mốc loginAt/lastSeen còn hạn
        // (fail-closed: thiếu mốc = hết hạn) và destroy() như session thật.
        session: {
          user: mockUser,
          loginAt: Date.now(),
          lastSeen: Date.now(),
          destroy: (cb: () => void) => cb(),
        },
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

      // Dọn user vừa tạo — test file này chạy TRƯỚC user.test.ts theo thứ tự
      // bảng chữ cái (fileParallelism: false, chung 1 DB test cho cả đợt
      // chạy). Không dọn sẽ làm "người đầu tiên đăng nhập tự thành admin"
      // ở user.test.ts bị sai (users đã có sẵn 1 dòng từ đây).
      const { db } = await import("../src/db/database.js");
      await db("users").where({ sso_sub: "user-123" }).del();
    });
  });

  describe("requireWrite — Quy tắc 9.1: chỉ admin được xóa; Add/Edit theo role_permissions (seed mặc định)", () => {
    async function callRequireWrite(role: "admin" | "subadmin" | "editor" | "bgd" | "viewer" | undefined, method: string, path = "/tasks/1") {
      const req: any = { appUser: role ? { role } : undefined, method, path, body: {} };
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
      await requireWrite(req, res, () => {
        nextCalled = true;
      });
      return { statusCode, body, nextCalled };
    }

    it("blocks editor from DELETE with 403 (/tasks/1 — function 'nhiem_vu')", async () => {
      const { statusCode, body, nextCalled } = await callRequireWrite("editor", "DELETE", "/tasks/1");
      expect(statusCode).toBe(403);
      expect(body.error).toMatch(/editor không có quyền xóa/i);
      expect(nextCalled).toBe(false);
    });

    it("allows editor to POST/PUT/PATCH on a configurable function (seed mặc định: nhiem_vu editor can_add/can_edit=true)", async () => {
      for (const method of ["POST", "PUT", "PATCH"]) {
        const { nextCalled } = await callRequireWrite("editor", method, "/tasks/1");
        expect(nextCalled).toBe(true);
      }
    });

    it("allows admin to DELETE (bypass hẳn, không tra role_permissions)", async () => {
      const { nextCalled } = await callRequireWrite("admin", "DELETE", "/tasks/1");
      expect(nextCalled).toBe(true);
    });

    it("allows subadmin to DELETE/POST/PUT/PATCH y hệt admin (bypass hẳn requireWrite — 'tương tự admin' trừ Cấu hình, xem requireAdmin)", async () => {
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        const { nextCalled } = await callRequireWrite("subadmin", method, "/tasks/1");
        expect(nextCalled).toBe(true);
      }
    });

    it("still blocks viewer from any write method on a configurable function, including DELETE", async () => {
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        const { statusCode, nextCalled } = await callRequireWrite("viewer", method, "/tasks/1");
        expect(statusCode).toBe(403);
        expect(nextCalled).toBe(false);
      }
    });

    it("allows viewer to POST /feature-requests (seed mặc định: yeu_cau_tinh_nang viewer can_add=true — đề xuất mở cho mọi role)", async () => {
      const { nextCalled } = await callRequireWrite("viewer", "POST", "/feature-requests");
      expect(nextCalled).toBe(true);
    });

    it("still blocks viewer from PUT /feature-requests/:id và POST .../approve|reject|to-backlog (cần can_edit, viewer không có)", async () => {
      for (const [method, path] of [
        ["PUT", "/feature-requests/1"],
        ["POST", "/feature-requests/1/approve"],
        ["POST", "/feature-requests/1/reject"],
        ["POST", "/feature-requests/1/to-backlog"],
      ] as const) {
        const { statusCode, nextCalled } = await callRequireWrite("viewer", method, path);
        expect(statusCode).toBe(403);
        expect(nextCalled).toBe(false);
      }
    });

    it("blocks viewer from DELETE /feature-requests/:id (Quy tắc 9.1 — xóa luôn chỉ admin, không tra role_permissions)", async () => {
      const { statusCode, nextCalled } = await callRequireWrite("viewer", "DELETE", "/feature-requests/1");
      expect(statusCode).toBe(403);
      expect(nextCalled).toBe(false);
    });

    it("allows viewer (và bgd) to POST /feature-requests/import — action suy ra 'tao_moi' -> cần can_add, viewer có qua ngoại lệ seed", async () => {
      const viewer = await callRequireWrite("viewer", "POST", "/feature-requests/import");
      expect(viewer.nextCalled).toBe(true);
      const bgd = await callRequireWrite("bgd", "POST", "/feature-requests/import");
      expect(bgd.nextCalled).toBe(true);
    });

    it("allows viewer to POST /feature-requests/:id/attachment (action mặc định POST -> 'tao_moi' -> can_add, viewer có)", async () => {
      const { nextCalled } = await callRequireWrite("viewer", "POST", "/feature-requests/1/attachment");
      expect(nextCalled).toBe(true);
    });

    it("blocks bulk delete-selected (POST) cho editor/bgd/viewer dù method không phải DELETE — vá lỗ hổng cũ (action suy ra 'xoa')", async () => {
      for (const role of ["editor", "bgd", "viewer"] as const) {
        const { statusCode, nextCalled } = await callRequireWrite(role, "POST", "/tasks/delete-selected");
        expect(statusCode).toBe(403);
        expect(nextCalled).toBe(false);
      }
    });

    it("allows admin to POST delete-selected", async () => {
      const { nextCalled } = await callRequireWrite("admin", "POST", "/tasks/delete-selected");
      expect(nextCalled).toBe(true);
    });

    it("passes through writes to routes outside 7 Chức năng cấu hình được (VD /departments — admin-only riêng qua requireAdmin, không qua đây)", async () => {
      const { nextCalled } = await callRequireWrite("editor", "POST", "/departments");
      expect(nextCalled).toBe(true);
    });

    it("passes through GET for every role, including editor", async () => {
      for (const role of ["admin", "editor", "bgd", "viewer"] as const) {
        const { nextCalled } = await callRequireWrite(role, "GET", "/tasks");
        expect(nextCalled).toBe(true);
      }
    });

    it("passes through when req.appUser is not set (SSO disabled)", async () => {
      const { nextCalled } = await callRequireWrite(undefined, "DELETE", "/tasks/1");
      expect(nextCalled).toBe(true);
    });
  });

  describe("requireWrite — role 'bgd': NGANG editor (CRUD bình thường, không xóa), CỘNG THÊM được chấm điểm (PUT /tasks/:id/grade)", () => {
    async function callRequireWrite(role: "admin" | "subadmin" | "editor" | "bgd" | "viewer" | undefined, method: string, path = "/tasks/1") {
      const req: any = { appUser: role ? { role } : undefined, method, path, body: {} };
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
      await requireWrite(req, res, () => {
        nextCalled = true;
      });
      return { statusCode, body, nextCalled };
    }

    it("allows bgd to POST/PUT/PATCH like editor (CRUD dữ liệu nghiệp vụ bình thường)", async () => {
      for (const method of ["POST", "PUT", "PATCH"]) {
        const { nextCalled } = await callRequireWrite("bgd", method, "/tasks/1");
        expect(nextCalled).toBe(true);
      }
    });

    it("blocks bgd from DELETE with 403 (Quy tắc 9.1 — chỉ admin được xóa)", async () => {
      const { statusCode, body, nextCalled } = await callRequireWrite("bgd", "DELETE", "/tasks/1");
      expect(statusCode).toBe(403);
      expect(body.error).toMatch(/BGĐ không có quyền xóa/i);
      expect(nextCalled).toBe(false);
    });

    it("allows bgd to PUT /tasks/:id/grade (chấm điểm)", async () => {
      const { nextCalled } = await callRequireWrite("bgd", "PUT", "/tasks/1/grade");
      expect(nextCalled).toBe(true);
    });

    it("allows bgd to POST /feature-requests (CRUD bình thường, không cần ngoại lệ viewer)", async () => {
      const { nextCalled } = await callRequireWrite("bgd", "POST", "/feature-requests");
      expect(nextCalled).toBe(true);
    });

    it("blocks viewer from PUT /tasks/:id/grade (chỉ admin/bgd được chấm điểm)", async () => {
      const { statusCode, nextCalled } = await callRequireWrite("viewer", "PUT", "/tasks/1/grade");
      expect(statusCode).toBe(403);
      expect(nextCalled).toBe(false);
    });

    it("blocks editor from PUT /tasks/:id/grade (khác biệt duy nhất còn lại giữa editor và bgd)", async () => {
      const { statusCode, body, nextCalled } = await callRequireWrite("editor", "PUT", "/tasks/1/grade");
      expect(statusCode).toBe(403);
      expect(body.error).toMatch(/không có quyền chấm điểm/i);
      expect(nextCalled).toBe(false);
    });

    it("still allows editor to PUT /tasks/:id (sửa task thường không bị ảnh hưởng)", async () => {
      const { nextCalled } = await callRequireWrite("editor", "PUT", "/tasks/1");
      expect(nextCalled).toBe(true);
    });

    it("allows admin to PUT /tasks/:id/grade", async () => {
      const { nextCalled } = await callRequireWrite("admin", "PUT", "/tasks/1/grade");
      expect(nextCalled).toBe(true);
    });
  });

  describe("requireWrite — màn Phân quyền (Cấu hình → Phân quyền) thay đổi role_permissions -> có hiệu lực NGAY", () => {
    async function callRequireWrite(role: "admin" | "subadmin" | "editor" | "bgd" | "viewer", method: string, path: string) {
      const req: any = { appUser: { role }, method, path, body: {} };
      let statusCode: number | undefined;
      let nextCalled = false;
      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: () => res,
      };
      await requireWrite(req, res, () => {
        nextCalled = true;
      });
      return { statusCode, nextCalled };
    }

    it("tắt can_add của editor cho 'roadmap' -> POST /roadmap-items bị chặn ngay, không cần sửa code/deploy lại", async () => {
      const { updateRolePermission } = await import("../src/services/permission.service.js");
      const before = await callRequireWrite("editor", "POST", "/roadmap-items");
      expect(before.nextCalled).toBe(true); // seed mặc định: editor can_add=true

      await updateRolePermission("roadmap", "editor", { can_add: false });
      try {
        const after = await callRequireWrite("editor", "POST", "/roadmap-items");
        expect(after.statusCode).toBe(403);
        expect(after.nextCalled).toBe(false);
      } finally {
        // Trả lại seed mặc định — không để 1 test làm lệch test khác chạy sau.
        await updateRolePermission("roadmap", "editor", { can_add: true });
      }
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

    it("blocks subadmin with 403 (ranh giới 'không vào được màn hình Cấu hình' — subadmin KHÔNG qua requireAdmin dù 'tương tự admin' ở requireWrite)", () => {
      process.env.SSO_ENABLED = "true";
      const { statusCode, body, nextCalled } = callRequireAdmin("subadmin" as any);
      expect(statusCode).toBe(403);
      expect(body.error).toMatch(/chỉ admin/i);
      expect(nextCalled).toBe(false);
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
      for (const role of ["admin", "subadmin", "editor", "viewer", undefined] as const) {
        const { nextCalled } = callRequireAdmin(role);
        expect(nextCalled).toBe(true);
      }
    });
  });

  describe("requireAdminOrSubAdmin — 'admin' HOẶC 'subadmin' qua được (/api/action-logs, */delete-selected ngoài Cấu hình)", () => {
    function callRequireAdminOrSubAdmin(role: "admin" | "subadmin" | "editor" | "bgd" | "viewer" | undefined) {
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
      requireAdminOrSubAdmin(req, res, () => {
        nextCalled = true;
      });
      return { statusCode, body, nextCalled };
    }

    it("allows admin", () => {
      process.env.SSO_ENABLED = "true";
      const { nextCalled } = callRequireAdminOrSubAdmin("admin");
      expect(nextCalled).toBe(true);
    });

    it("allows subadmin (khác requireAdmin — đây chính là nơi subadmin 'tương tự admin')", () => {
      process.env.SSO_ENABLED = "true";
      const { nextCalled } = callRequireAdminOrSubAdmin("subadmin");
      expect(nextCalled).toBe(true);
    });

    it("blocks editor/bgd/viewer with 403", () => {
      process.env.SSO_ENABLED = "true";
      for (const role of ["editor", "bgd", "viewer"] as const) {
        const { statusCode, nextCalled } = callRequireAdminOrSubAdmin(role);
        expect(statusCode).toBe(403);
        expect(nextCalled).toBe(false);
      }
    });

    it("passes through every role when SSO is disabled", () => {
      process.env.SSO_ENABLED = "false";
      for (const role of ["admin", "subadmin", "editor", "bgd", "viewer", undefined] as const) {
        const { nextCalled } = callRequireAdminOrSubAdmin(role);
        expect(nextCalled).toBe(true);
      }
    });
  });
});
