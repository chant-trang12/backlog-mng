import { db } from "../connection.js";

// Màn "Phân quyền" (Cấu hình → Phân quyền) — admin cấu hình TRỰC TIẾP trên
// UI quyền Read/Add/Edit của role "editor"/"bgd"/"viewer" theo từng Chức
// năng (function_key), thay vì phải sửa code. Có hiệu lực NGAY — requireWrite
// (auth.middleware.ts) đọc bảng này cho mọi request ghi.
//
// CỐ Ý KHÔNG đưa vào đây:
// - role "admin": luôn toàn quyền, bypass trước khi requireWrite tra bảng
//   này — không có dòng nào cho admin, sửa gì cũng không ảnh hưởng.
// - Cột "Delete": Quy tắc 9.1 — CHỈ admin được xóa, tuyệt đối, không cấu
//   hình được qua màn này (không có cột can_delete). requireWrite chặn
//   cứng mọi request có action="xoa" (suy từ resolveModuleAndAction) cho
//   role khác admin, không tra bảng này.
// - "Cấu hình"/"Quản lý User"/"Nhật ký hoạt động": vẫn admin-only tuyệt
//   đối qua requireAdmin như cũ — không nằm trong function_key nào ở đây,
//   tránh rủi ro admin tự khóa nhầm chính màn cấu hình phân quyền.
// - "Trang chủ": không có thao tác ghi nào (dashboard tổng hợp, tính động
//   từ module khác) — không cần permission riêng.
//
// read: HIỆN TẠI mọi role (kể cả viewer) đều đọc được mọi API GET (không
// gate theo bảng này, chỉ gate theo DataScope/phòng ban — Quy tắc 9.2) —
// cột can_read lưu sẵn cho đủ hình dạng UI giống ảnh mẫu + dự phòng xiết
// chặt sau này, CHƯA được requireWrite/bất kỳ middleware nào dùng để chặn
// GET ở bản này.
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

    // Seed = ĐÚNG hành vi hardcode trước đây (editor/bgd CRUD bình thường
    // trừ xóa; bgd cộng thêm Chấm điểm riêng ở function_key khác; viewer
    // chỉ đọc, trừ ngoại lệ "Đề xuất Yêu cầu tính năng").
    await db("role_permissions").insert([
      { function_key: "nhiem_vu", role: "editor", can_read: true, can_add: true, can_edit: true },
      { function_key: "nhiem_vu", role: "bgd", can_read: true, can_add: true, can_edit: true },
      { function_key: "nhiem_vu", role: "viewer", can_read: true, can_add: false, can_edit: false },

      { function_key: "nhiem_vu_cham_diem", role: "editor", can_read: true, can_add: false, can_edit: false },
      { function_key: "nhiem_vu_cham_diem", role: "bgd", can_read: true, can_add: false, can_edit: true },
      { function_key: "nhiem_vu_cham_diem", role: "viewer", can_read: true, can_add: false, can_edit: false },

      { function_key: "team_nhan_su", role: "editor", can_read: true, can_add: true, can_edit: true },
      { function_key: "team_nhan_su", role: "bgd", can_read: true, can_add: true, can_edit: true },
      { function_key: "team_nhan_su", role: "viewer", can_read: true, can_add: false, can_edit: false },

      { function_key: "cskh", role: "editor", can_read: true, can_add: true, can_edit: true },
      { function_key: "cskh", role: "bgd", can_read: true, can_add: true, can_edit: true },
      { function_key: "cskh", role: "viewer", can_read: true, can_add: false, can_edit: false },

      { function_key: "roadmap", role: "editor", can_read: true, can_add: true, can_edit: true },
      { function_key: "roadmap", role: "bgd", can_read: true, can_add: true, can_edit: true },
      { function_key: "roadmap", role: "viewer", can_read: true, can_add: false, can_edit: false },

      // viewer can_add=true: ngoại lệ cũ "mọi phòng ban/mọi quyền được đề
      // xuất Yêu cầu tính năng" — nay THỂ HIỆN đúng trong bảng thay vì
      // code riêng (VIEWER_ALLOWED_WRITES cũ đã bỏ, xem auth.middleware.ts).
      { function_key: "yeu_cau_tinh_nang", role: "editor", can_read: true, can_add: true, can_edit: true },
      { function_key: "yeu_cau_tinh_nang", role: "bgd", can_read: true, can_add: true, can_edit: true },
      { function_key: "yeu_cau_tinh_nang", role: "viewer", can_read: true, can_add: true, can_edit: false },

      { function_key: "quan_ly_tinh_nang_so_hoa", role: "editor", can_read: true, can_add: true, can_edit: true },
      { function_key: "quan_ly_tinh_nang_so_hoa", role: "bgd", can_read: true, can_add: true, can_edit: true },
      { function_key: "quan_ly_tinh_nang_so_hoa", role: "viewer", can_read: true, can_add: false, can_edit: false },
    ]);
  }
}
