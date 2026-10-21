import { db } from "../connection.js";

// "Phân quyền theo phòng ban" (Cấu hình → Phân quyền) — admin ẩn/hiện TỪNG
// mục menu trái cho TỪNG phòng ban cụ thể (VD phòng A không cần thấy mục
// "Roadmap năm"). Áp dụng cho MỌI mục menu trái, kể cả "Cấu hình"/"Nhật ký
// hoạt động" (2 mục này vẫn admin/subadmin-only tuyệt đối qua requireAdmin
// như cũ — bảng này chỉ thêm 1 lớp ẨN MENU phía trên, không mở thêm quyền
// truy cập gì). KHÔNG áp dụng cho role admin/subadmin ở BẤT KỲ phòng ban
// nào — 2 role này luôn thấy đủ menu, bỏ qua bảng này hoàn toàn khi tính
// (xem getHiddenMenuKeysForDepartment(), menu.service.ts).
//
// Chỉ lưu dòng NGOẠI LỆ (is_visible=false) — thiếu dòng = mặc định hiện,
// khớp cách role_permissions xử lý "thiếu dòng" (an toàn, không cần seed
// đầy đủ department × menu_key mỗi khi thêm phòng ban/mục menu mới).
export async function migrateMenuVisibility(): Promise<void> {
  if (!(await db.schema.hasTable("department_menu_visibility"))) {
    await db.schema.createTable("department_menu_visibility", (table) => {
      table.increments("id").primary();
      table.integer("department_id").notNullable().references("id").inTable("departments").onDelete("CASCADE");
      table.string("menu_key", 40).notNullable();
      table.boolean("is_visible").notNullable().defaultTo(true);
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
      table.unique(["department_id", "menu_key"]);
    });
  }
}
