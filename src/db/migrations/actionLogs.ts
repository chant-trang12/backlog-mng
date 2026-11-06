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

  // Backfill (idempotent): log cũ của các tab mới ghi lúc chưa khai báo nhãn nên
  // module = NULL và mô tả còn tên route tiếng Anh ("Tạo mới overtime-summary").
  // Chỉ đụng dòng module NULL + path đúng route -> chạy lại không ảnh hưởng.
  const MAP: { prefix: string; token: string; entity: string }[] = [
    { prefix: "/overtime-summary", token: "overtime-summary", entity: "Tổng hợp làm thêm giờ" },
    { prefix: "/overtime", token: "overtime", entity: "Chi tiết làm thêm giờ" },
    { prefix: "/gnv", token: "gnv", entity: "GNV" },
    { prefix: "/report-templates", token: "report-templates", entity: "Mẫu báo cáo PowerPoint" },
    { prefix: "/report-shares", token: "report-shares", entity: "Chia sẻ báo cáo" },
    { prefix: "/report-comments", token: "report-comments", entity: "Bình luận báo cáo" },
    { prefix: "/reports", token: "reports", entity: "Báo cáo PowerPoint" },
  ];
  if (await db.schema.hasTable("action_logs")) {
    for (const m of MAP) {
      const rows = db("action_logs").whereNull("module").where(function () {
        this.where("path", m.prefix).orWhere("path", "like", `${m.prefix}/%`);
      });
      await rows.update({
        description: db.raw("REPLACE(description, ?, ?)", [` ${m.token}`, ` ${m.entity}`]),
        module: "Kế hoạch tổng hợp",
      });
    }
  }
}
