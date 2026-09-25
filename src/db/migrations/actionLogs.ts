import { db } from "../connection.js";

// Nhật ký hoạt động (Action Log) — ghi lại đăng nhập/đăng xuất + mọi hành
// động thêm/sửa/xóa/chuyển dữ liệu của tài khoản trên toàn hệ thống. Dòng
// chỉ TÓM TẮT ("Cập nhật Nhiệm vụ 'Thiết kế lại trang chủ'"), KHÔNG lưu
// nội dung trước/sau (đã thống nhất phạm vi với người dùng) — xem
// src/middleware/actionLog.middleware.ts (ghi tự động cho mọi request ghi
// tới /api) và auth.controller.ts (đăng nhập/đăng xuất, nằm ngoài /api).
//
// user_name lưu SNAPSHOT (không JOIN sang bảng users) — tài khoản có thể bị
// xóa sau này (users cho phép DELETE), nhưng lịch sử "ai đã làm gì" vẫn
// phải giữ nguyên tên người thực hiện tại thời điểm đó. department_name
// cũng snapshot tương tự cho gọn (tra 1 lần lúc ghi, xem
// actionLog.service.ts#recordActionLog) dù phòng ban hiếm khi bị xóa.
export async function migrateActionLogsTable(): Promise<void> {
  const hasTable = await db.schema.hasTable("action_logs");
  if (!hasTable) {
    await db.schema.createTable("action_logs", (table) => {
      table.increments("id").primary();
      table.integer("user_id").references("id").inTable("users").onDelete("SET NULL");
      table.string("user_name", 255);
      table.integer("department_id").references("id").inTable("departments").onDelete("SET NULL");
      table.string("department_name", 255);
      // "dang_nhap" | "dang_xuat" | "tao_moi" | "cap_nhat" | "xoa" | "chuyen_du_lieu"
      table.string("action", 30).notNullable();
      table.string("module", 100); // nhãn module tiếng Việt để lọc, VD "Backlog", "Roadmap năm"
      table.text("description").notNullable(); // câu tóm tắt hiển thị trực tiếp
      table.string("method", 10); // HTTP method gốc — phục vụ debug, không hiển thị chính
      table.string("path", 255); // request path gốc — phục vụ debug
      table.string("ip", 64);
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.index("created_at");
      table.index("user_id");
      table.index("action");
    });
  }
}
