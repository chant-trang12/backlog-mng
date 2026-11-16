import { describe, expect, it } from "vitest";
import { requireWrite } from "../src/middleware/auth.middleware.js";

// "BC tuần" + "Báo cáo PowerPoint" (Kế hoạch tổng hợp): editor/bgd phải thêm / sửa / xuất / chia sẻ được;
// viewer chỉ xem; xóa/thu hồi vẫn chỉ admin (Quy tắc 9.1).
type Role = "admin" | "subadmin" | "editor" | "bgd" | "viewer";
async function call(role: Role, method: string, path: string) {
  const req: any = { appUser: { role }, method, path, body: {}, query: {} };
  let status = 200;
  const res: any = {
    status: (s: number) => {
      status = s;
      return res;
    },
    json: () => res,
  };
  let nextCalled = false;
  await requireWrite(req, res, () => {
    nextCalled = true;
  });
  return { status, nextCalled };
}

const EDITABLE: [string, string, string][] = [
  // BC tuần
  ["Thêm dòng BC tuần", "POST", "/weekly-reports/rows"],
  ["Sửa dòng BC tuần", "PUT", "/weekly-reports/rows/5"],
  ["Đổi thứ tự dòng", "POST", "/weekly-reports/rows/5/move"],
  ["Sửa tiêu đề", "PUT", "/weekly-reports/company"],
  ["Sao chép từ tuần trước", "POST", "/weekly-reports/copy-previous"],
  ["Chia sẻ BC tuần", "POST", "/weekly-reports/shares"],
  // Báo cáo PowerPoint
  ["Tạo báo cáo PowerPoint", "POST", "/reports"],
  ["Sửa nội dung 1 mục", "PUT", "/reports/3/sections/abc"],
  ["Lấy dữ liệu kỳ trước", "POST", "/reports/3/sections/abc/pull-previous"],
  ["Sao chép từ kỳ trước", "POST", "/reports/3/copy-previous"],
  ["Làm mới dữ liệu", "POST", "/reports/3/refresh"],
  ["Xuất PowerPoint", "POST", "/reports/3/export"],
  ["Tải ảnh lên", "PUT", "/reports/3/images/img1"],
  ["Sửa chú thích ảnh", "PUT", "/reports/3/images/img1/caption"],
  ["Chia sẻ báo cáo PowerPoint", "POST", "/reports/3/shares"],
  ["Thêm góp ý", "POST", "/reports/3/comments"],
  ["Đổi trạng thái góp ý", "PUT", "/report-comments/3"],
];
const DELETES: [string, string][] = [
  ["DELETE", "/weekly-reports/rows/5"],
  ["DELETE", "/reports/3"],
  ["DELETE", "/reports/3/images/img1"],
  ["DELETE", "/report-comments/3"],
];
// Thu hồi chia sẻ: ngoại lệ — editor/bgd được (cần quyền "Sửa").
const REVOKES: [string, string][] = [
  ["DELETE", "/weekly-reports/shares/3"],
  ["DELETE", "/report-shares/3"],
];

describe("Quyền BC tuần + Báo cáo PowerPoint", () => {
  for (const role of ["editor", "bgd"] as const) {
    it(`${role}: thêm / sửa / xuất / chia sẻ được`, async () => {
      for (const [label, method, path] of EDITABLE) {
        const r = await call(role, method, path);
        expect(r.nextCalled, `${role} ${label} (${method} ${path})`).toBe(true);
      }
    });
    it(`${role}: thu hồi chia sẻ được`, async () => {
      for (const [method, path] of REVOKES) {
        const r = await call(role, method, path);
        expect(r.nextCalled, `${role} ${method} ${path}`).toBe(true);
      }
    });
    it(`${role}: xóa dữ liệu khác vẫn bị chặn (chỉ admin)`, async () => {
      for (const [method, path] of DELETES) {
        const r = await call(role, method, path);
        expect(r.status, `${role} ${method} ${path}`).toBe(403);
      }
    });
  }
  it("viewer: không thu hồi chia sẻ được", async () => {
    for (const [method, path] of REVOKES) expect((await call("viewer", method, path)).status).toBe(403);
  });
  it("viewer: không thêm / sửa / chia sẻ được", async () => {
    for (const [label, method, path] of EDITABLE) {
      const r = await call("viewer", method, path);
      expect(r.status, `viewer ${label}`).toBe(403);
    }
  });
  it("admin / subadmin: làm được tất cả, kể cả xóa", async () => {
    for (const role of ["admin", "subadmin"] as const) {
      for (const [, method, path] of EDITABLE) expect((await call(role, method, path)).nextCalled).toBe(true);
      for (const [method, path] of [...DELETES, ...REVOKES]) expect((await call(role, method, path)).nextCalled).toBe(true);
    }
  });
});
