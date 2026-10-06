import { db } from "../connection.js";
import { ensureSoftDeleteColumns, ensureFilteredUniqueIndex } from "./core.js";

// "Việc" — tách nhỏ 1 Nhiệm vụ (task) thành nhiều đầu việc cụ thể (VD mỗi
// DoD là 1 Việc), mỗi Việc phân công cho 1-nhiều nhân sự kèm khối lượng giờ
// (task_item_members, bảng dưới). Có thể chấm điểm riêng từng Việc — xem
// recomputeTaskScoreFromItems() ở taskItem.service.ts (tasks.cpo_danh_gia
// tự = trung bình các Việc đã chấm khi có Việc con). "Treo việc" (kèm lý
// do + tự ghi ngày bắt đầu treo) để liệt kê đôn đốc ở Trang chủ.
export async function migrateTaskItemsTables(): Promise<void> {
  if (!(await db.schema.hasTable("task_items"))) {
    await db.schema.createTable("task_items", (table) => {
      table.increments("id").primary();
      table.integer("task_id").notNullable().references("id").inTable("tasks").onDelete("CASCADE");
      table.text("ten_viec").notNullable();
      table.string("trang_thai", 50).notNullable().defaultTo("Chưa thực hiện");
      table.boolean("treo_viec").notNullable().defaultTo(false);
      table.text("treo_viec_ly_do");
      // Lưu dạng text "YYYY-MM-DD" (giống deadline/ngay_thuc_hien của
      // tasks) — tự set ở service khi tick treo_viec, clear khi gỡ, FE
      // không tự gửi ngày này.
      table.string("treo_viec_tu_ngay", 10);
      table.decimal("diem_danh_gia", 5, 2);
      table.text("ghi_chu");
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
    });
  }
  await ensureSoftDeleteColumns("task_items");

  if (!(await db.schema.hasTable("task_item_members"))) {
    await db.schema.createTable("task_item_members", (table) => {
      table.increments("id").primary();
      table.integer("task_item_id").notNullable().references("id").inTable("task_items").onDelete("CASCADE");
      table.integer("member_id").notNullable().references("id").inTable("members").onDelete("NO ACTION");
      // Giờ công (Hours) của RIÊNG người này trong Việc đó — MD tự tính ở
      // tầng đọc = gio_cong/8 (8h = 1MD, cố định), không lưu cột MD riêng
      // để tránh lệch dữ liệu nếu tỷ lệ quy đổi đổi sau này.
      table.decimal("gio_cong", 6, 2);
      table.text("ghi_chu");
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
      table.unique(["task_item_id", "member_id"]);
    });
  }
  await ensureSoftDeleteColumns("task_item_members");
  await ensureFilteredUniqueIndex(
    "task_item_members",
    ["task_item_id", "member_id"],
    "task_item_members_item_member_active_unique",
  );
}
