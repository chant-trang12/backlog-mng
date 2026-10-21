import { db } from "../connection.js";

// Màn "Phân quyền" (Cấu hình → Phân quyền) — admin cấu hình TRỰC TIẾP trên
// UI quyền Read/Add/Edit của role "editor"/"bgd"/"viewer" theo từng Chức
// năng (function_key), thay vì phải sửa code. Có hiệu lực NGAY — requireWrite
// (auth.middleware.ts) đọc bảng này cho mọi request ghi; requireRead đọc
// cho mọi request GET (ẩn menu + chặn API đọc nếu tắt — xem auth.middleware.ts).
//
// CỐ Ý KHÔNG đưa vào đây:
// - role "admin": luôn toàn quyền, bypass trước khi requireWrite/requireRead
//   tra bảng này — không có dòng nào cho admin, sửa gì cũng không ảnh hưởng.
// - Cột "Delete": Quy tắc 9.1 — CHỈ admin được xóa, tuyệt đối, không cấu
//   hình được qua màn này (không có cột can_delete). requireWrite chặn
//   cứng mọi request có action="xoa" (suy từ resolveModuleAndAction) cho
//   role khác admin, không tra bảng này.
// - "Cấu hình"/"Quản lý User"/"Nhật ký hoạt động": vẫn admin-only tuyệt
//   đối qua requireAdmin như cũ — không nằm trong function_key nào ở đây,
//   tránh rủi ro admin tự khóa nhầm chính màn cấu hình phân quyền.
//
// "Trang chủ" (trang_chu): không có API riêng (dashboard tổng hợp, tính
// động từ module khác — Nhiệm vụ/Nhân sự...) nên can_add/can_edit không có
// ý nghĩa (luôn false, ẩn checkbox ở FE) — NHƯNG can_read vẫn có ý nghĩa
// THẬT: tắt Đọc = ẩn mục "Trang chủ" khỏi menu trái + chặn mở trang đó cho
// role tương ứng (thuần FE, vì không có route GET riêng để chặn server).
//
// read: can_read có hiệu lực THẬT (requireRead, auth.middleware.ts) — tắt
// Đọc của 1 Chức năng cho 1 role = chặn 403 mọi GET thuộc Chức năng đó +
// ẩn mục menu trái tương ứng cho role đó (xem MODULE_TO_FUNCTION_KEY +
// checkAuth() ở 09-main.js). Trước đây cột này chỉ là nhãn hiển thị,
// KHÔNG middleware nào dùng — nay đã nối thật.
export async function migrateRolePermissions(): Promise<void> {
  const hasTable = await db.schema.hasTable("role_permissions");
  if (!hasTable) {
    await db.schema.createTable("role_permissions", (table) => {
      table.increments("id").primary();
      table.string("function_key", 60).notNullable();
      table.string("role", 20).notNullable();
      table.boolean("can_read").notNullable().defaultTo(true);
      table.boolean("can_add").notNullable().defaultTo(false);
      table.boolean("can_edit").notNullable().defaultTo(false);
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
      table.unique(["function_key", "role"]);
    });
  }

  // Seed = ĐÚNG hành vi hardcode trước đây (editor/bgd CRUD bình thường
  // trừ xóa; bgd cộng thêm Chấm điểm riêng ở function_key khác; viewer
  // chỉ đọc, trừ ngoại lệ "Đề xuất Yêu cầu tính năng"). Tách khỏi khối
  // "tạo bảng" ở trên + lọc theo function_key CHƯA có dòng nào (thay vì
  // chỉ chạy lúc tạo bảng mới) để DB cũ đã có bảng vẫn seed được function
  // mới thêm sau này (VD "trang_chu") mà không đụng dòng admin đã sửa tay.
  const existingKeys = new Set((await db("role_permissions").distinct("function_key")).map((r: any) => r.function_key));
  const seed: Array<{ function_key: string; role: string; can_read: boolean; can_add: boolean; can_edit: boolean }> = [];
  const addSeed = (key: string, rows: Array<[string, boolean, boolean, boolean]>) => {
    if (existingKeys.has(key)) return;
    for (const [role, can_read, can_add, can_edit] of rows) {
      seed.push({ function_key: key, role, can_read, can_add, can_edit });
    }
  };

  addSeed("nhiem_vu", [
    ["editor", true, true, true],
    ["bgd", true, true, true],
    ["viewer", true, false, false],
  ]);
  addSeed("nhiem_vu_cham_diem", [
    ["editor", true, false, false],
    ["bgd", true, false, true],
    ["viewer", true, false, false],
  ]);
  addSeed("team_nhan_su", [
    ["editor", true, true, true],
    ["bgd", true, true, true],
    ["viewer", true, false, false],
  ]);
  addSeed("cskh", [
    ["editor", true, true, true],
    ["bgd", true, true, true],
    ["viewer", true, false, false],
  ]);
  addSeed("roadmap", [
    ["editor", true, true, true],
    ["bgd", true, true, true],
    ["viewer", true, false, false],
  ]);
  // viewer can_add=true: ngoại lệ cũ "mọi phòng ban/mọi quyền được đề xuất
  // Yêu cầu tính năng" — nay THỂ HIỆN đúng trong bảng thay vì code riêng
  // (VIEWER_ALLOWED_WRITES cũ đã bỏ, xem auth.middleware.ts).
  addSeed("yeu_cau_tinh_nang", [
    ["editor", true, true, true],
    ["bgd", true, true, true],
    ["viewer", true, true, false],
  ]);
  addSeed("quan_ly_tinh_nang_so_hoa", [
    ["editor", true, true, true],
    ["bgd", true, true, true],
    ["viewer", true, false, false],
  ]);
  // "Trang chủ" — chỉ can_read có ý nghĩa (ẩn/hiện menu), can_add/can_edit
  // luôn false (không có thao tác Thêm/Sửa trên dashboard tổng hợp).
  addSeed("trang_chu", [
    ["editor", true, false, false],
    ["bgd", true, false, false],
    ["viewer", true, false, false],
  ]);

  if (seed.length > 0) {
    await db("role_permissions").insert(seed);
  }
}
