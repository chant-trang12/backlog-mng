import { db } from "../connection.js";
import { ensureFilteredUniqueIndex, ensureSoftDeleteColumns } from "./core.js";

// "Trừ điểm cá nhân" từ popup "Chấm điểm" (menu Nhiệm vụ) — ĐỘC LẬP với
// "Trừ điểm cá nhân" ở popup "Nhân sự tham gia" (task_members.tru_diem_so_diem,
// chỉ ảnh hưởng "Điểm cá nhân (Tính theo task)"): khoản trừ ở bảng NÀY chỉ
// trừ vào "Điểm cá nhân (Mặc định)" — mỗi nhân sự mặc định 100 điểm/tháng
// (period), trừ dần theo từng lần bị trừ ở đây, tự về lại 100 khi sang
// tháng mới (vì tính theo period_id của task gây trừ điểm — xem
// gradeDeduction.service.ts). Mỗi (task, nhân sự) chỉ trừ được 1 lần, giống
// các cơ chế "Trừ điểm cá nhân" khác đã có trong hệ thống.
export async function migrateGradeDeductionsTable(): Promise<void> {
  if (!(await db.schema.hasTable("grade_deductions"))) {
    await db.schema.createTable("grade_deductions", (table) => {
      table.increments("id").primary();
      table.integer("task_id").notNullable().references("id").inTable("tasks").onDelete("CASCADE");
      table.integer("member_id").notNullable().references("id").inTable("members").onDelete("NO ACTION");
      table.decimal("so_diem", 5, 2).notNullable().defaultTo(10);
      // Dạng "YYYY-MM-DD" — giống tru_diem_luc của task_members/
      // incident_members, chỉ cần độ phân giải ngày để hiện ở note.
      table.string("tru_luc", 10);
      table.string("nguoi_tru", 255);
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.unique(["task_id", "member_id"]);
    });
  }
  // Bảng có thể đã được tạo trước khi thêm cột tru_luc (môi trường dev chạy
  // song song nhiều lần trong lúc code đang sửa) — bổ sung ALTER riêng,
  // idempotent như mọi cột thêm sau trong codebase.
  if (!(await db.schema.hasColumn("grade_deductions", "tru_luc"))) {
    await db.schema.alterTable("grade_deductions", (table) => {
      table.string("tru_luc", 10);
    });
  }
  await ensureSoftDeleteColumns("grade_deductions");
  await ensureFilteredUniqueIndex(
    "grade_deductions",
    ["task_id", "member_id"],
    "grade_deductions_task_member_active_unique",
  );
}
