import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  deleteUser,
  getUserBySsoSub,
  isValidRole,
  listUsers,
  updateUser,
  upsertUserFromSso,
} from "../src/services/user.service.js";
import type { AuthUser } from "../src/types/auth.js";

// Test qua service trực tiếp (không qua HTTP) vì req.appUser (người đang
// đăng nhập, cần cho updateUser/deleteUser self-protection) chỉ được gắn
// bởi requireAuth khi SSO bật — môi trường test/dev ở đây không có
// express-session/openid-client nên không dựng được luồng HTTP đầy đủ có
// session (xem tests/auth.test.ts, cùng giới hạn). Phần list qua HTTP vẫn
// test được vì không cần actingUserId.
describe("Quản lý User + Phân quyền", () => {
  function mockAuthUser(id: string, overrides: Partial<AuthUser> = {}): AuthUser {
    return { id, username: `user-${id}`, name: `Người dùng ${id}`, email: `${id}@test.local`, ...overrides };
  }

  describe("upsertUserFromSso — bootstrap quyền", () => {
    it("người đầu tiên đăng nhập tự thành admin, người sau mặc định viewer", async () => {
      const first = await upsertUserFromSso(mockAuthUser("bootstrap-1"));
      expect(first.role).toBe("admin");

      const second = await upsertUserFromSso(mockAuthUser("bootstrap-2"));
      expect(second.role).toBe("viewer");
    });

    it("đăng nhập lại (cùng sso_sub) không tạo user mới, giữ nguyên role/active đã set, chỉ đồng bộ tên/email", async () => {
      const created = await upsertUserFromSso(mockAuthUser("repeat-1", { name: "Tên cũ" }));
      await updateUser(created.id, -1, { role: "editor" }); // actingUserId khác created.id -> không bị chặn self-protection

      const again = await upsertUserFromSso(mockAuthUser("repeat-1", { name: "Tên mới" }));
      expect(again.id).toBe(created.id);
      expect(again.role).toBe("editor"); // không bị ghi đè về viewer
      expect(again.name).toBe("Tên mới"); // vẫn đồng bộ lại tên
    });
  });

  describe("updateUser — đổi role/khóa tài khoản", () => {
    it("admin đổi role/active của user khác thành công", async () => {
      const target = await upsertUserFromSso(mockAuthUser("target-1"));
      const updated = await updateUser(target.id, -1, { role: "editor", active: false });
      expect(updated && "role" in updated ? updated.role : null).toBe("editor");
      expect(updated && "active" in updated ? updated.active : null).toBe(false);
    });

    it("chặn tự đổi role/khóa chính mình (actingUserId === id)", async () => {
      const self = await upsertUserFromSso(mockAuthUser("self-1"));
      const result = await updateUser(self.id, self.id, { role: "admin" });
      expect(result && "error" in result ? result.error : null).toMatch(/không thể tự/i);

      const unchanged = await getUserBySsoSub("self-1");
      expect(unchanged?.role).toBe(self.role); // role không đổi
    });

    it("trả undefined khi update user không tồn tại", async () => {
      const result = await updateUser(999999, -1, { role: "admin" });
      expect(result).toBeUndefined();
    });
  });

  describe("deleteUser", () => {
    it("chặn tự xóa chính mình", async () => {
      const self = await upsertUserFromSso(mockAuthUser("self-del-1"));
      const result = await deleteUser(self.id, self.id);
      expect(result && typeof result === "object" && "error" in result ? result.error : null).toMatch(/không thể tự xóa/i);
      expect(await getUserBySsoSub("self-del-1")).toBeDefined(); // vẫn còn
    });

    it("admin xóa được user khác", async () => {
      const target = await upsertUserFromSso(mockAuthUser("del-target-1"));
      const result = await deleteUser(target.id, -1);
      expect(result).toBe(true);
      expect(await getUserBySsoSub("del-target-1")).toBeUndefined();
    });
  });

  describe("isValidRole", () => {
    it("chỉ chấp nhận đúng 3 giá trị admin/editor/viewer", () => {
      expect(isValidRole("admin")).toBe(true);
      expect(isValidRole("editor")).toBe(true);
      expect(isValidRole("viewer")).toBe(true);
      expect(isValidRole("superadmin")).toBe(false);
      expect(isValidRole(123)).toBe(false);
      expect(isValidRole(undefined)).toBe(false);
    });
  });

  describe("GET /api/users", () => {
    it("trả danh sách user đã tạo qua upsertUserFromSso", async () => {
      await upsertUserFromSso(mockAuthUser("list-1"));
      const app = createApp();
      const res = await request(app).get("/api/users");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((u: { sso_sub: string }) => u.sso_sub === "list-1")).toBe(true);
    });

    it("service listUsers() trả đúng số user đã tạo trong test", async () => {
      const before = await listUsers();
      await upsertUserFromSso(mockAuthUser("list-count-1"));
      const after = await listUsers();
      expect(after.length).toBe(before.length + 1);
    });
  });
});
