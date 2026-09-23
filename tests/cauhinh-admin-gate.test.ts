import { describe, expect, it } from "vitest";
import type { Router } from "express";
import { requireAdmin } from "../src/middleware/auth.middleware.js";
import tieuchiRoutes from "../src/routes/tieuchi.routes.js";
import rankingRoutes from "../src/routes/ranking.routes.js";
import catalogRoutes from "../src/routes/catalog.routes.js";
import departmentRoutes from "../src/routes/department.routes.js";

// Kiểm tra "wiring" ở tầng route: đúng route nào có gắn requireAdmin, đúng
// route nào KHÔNG (GET phải mở cho mọi role — xem comment trong từng file
// route). Đi thẳng vào router.stack thay vì bắn HTTP thật, vì test suite ép
// SSO_ENABLED=false toàn cục (vitest.config.ts) nên không thể tự nhiên xác
// nhận 403 qua supertest — cách này xác nhận đúng cái quan trọng nhất: nếu
// sau này ai thêm route mới cho Cấu hình mà quên gắn requireAdmin, test này
// phải đỏ.
function middlewaresFor(router: Router, method: string, path: string): Function[] {
  const layer = (router as any).stack.find(
    (l: any) => l.route?.path === path && l.route.methods[method.toLowerCase()],
  );
  if (!layer) {
    throw new Error(`Route ${method} ${path} không tồn tại trong router — kiểm tra lại path trong test.`);
  }
  return layer.route.stack.map((s: any) => s.handle);
}

function expectAdminGated(router: Router, method: string, path: string) {
  expect(middlewaresFor(router, method, path)).toContain(requireAdmin);
}

function expectOpenToAllRoles(router: Router, method: string, path: string) {
  expect(middlewaresFor(router, method, path)).not.toContain(requireAdmin);
}

describe("Màn hình Cấu hình — route nào phải giới hạn admin", () => {
  describe("Tiêu chí (/api/tieu-chi)", () => {
    it("GET mở cho mọi role", () => {
      expectOpenToAllRoles(tieuchiRoutes, "GET", "/tieu-chi");
    });

    it("thao tác quản lý (tạo/sửa/xoá/clone/điểm chuẩn) chỉ admin", () => {
      expectAdminGated(tieuchiRoutes, "POST", "/tieu-chi/clone");
      expectAdminGated(tieuchiRoutes, "POST", "/tieu-chi");
      expectAdminGated(tieuchiRoutes, "PUT", "/tieu-chi/:id");
      expectAdminGated(tieuchiRoutes, "DELETE", "/tieu-chi/:id");
      expectAdminGated(tieuchiRoutes, "PUT", "/tieu-chi/:id/diem-chuan");
    });
  });

  describe("Ranking (/api/ranking-config)", () => {
    it("GET mở cho mọi role", () => {
      expectOpenToAllRoles(rankingRoutes, "GET", "/ranking-config");
    });

    it("thao tác quản lý hàng/cột/ô chỉ admin", () => {
      expectAdminGated(rankingRoutes, "POST", "/ranking-config/rows");
      expectAdminGated(rankingRoutes, "DELETE", "/ranking-config/rows/:viTri");
      expectAdminGated(rankingRoutes, "POST", "/ranking-config/columns");
      expectAdminGated(rankingRoutes, "PUT", "/ranking-config/columns/:id");
      expectAdminGated(rankingRoutes, "DELETE", "/ranking-config/columns/:id");
      expectAdminGated(rankingRoutes, "PUT", "/ranking-config/cells");
    });
  });

  describe("Danh mục (/api/tags, /api/phan-loai, /api/nhom, /api/chuc-vu, /api/he-thong, /api/muc-tieu, /api/phan-loai-nhan-su)", () => {
    const resources = ["tags", "phan-loai", "nhom", "chuc-vu", "he-thong", "muc-tieu", "phan-loai-nhan-su"];

    it.each(resources)("GET /%s mở cho mọi role", (resource) => {
      expectOpenToAllRoles(catalogRoutes, "GET", `/${resource}`);
    });

    it.each(resources)("tạo/sửa/xoá /%s chỉ admin", (resource) => {
      expectAdminGated(catalogRoutes, "POST", `/${resource}`);
      expectAdminGated(catalogRoutes, "PUT", `/${resource}/:id`);
      expectAdminGated(catalogRoutes, "DELETE", `/${resource}/:id`);
    });
  });

  describe("Phòng ban (/api/departments)", () => {
    it("GET mở cho mọi role (department switcher dùng ở mọi trang)", () => {
      expectOpenToAllRoles(departmentRoutes, "GET", "/departments");
    });

    it("tạo/sửa/xoá phòng ban chỉ admin", () => {
      expectAdminGated(departmentRoutes, "POST", "/departments");
      expectAdminGated(departmentRoutes, "PUT", "/departments/:id");
      expectAdminGated(departmentRoutes, "DELETE", "/departments/:id");
    });
  });
});
