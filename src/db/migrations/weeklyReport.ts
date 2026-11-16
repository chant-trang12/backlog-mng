import { db } from "../connection.js";

// Tab "BC tuần" (Kế hoạch tổng hợp): Báo cáo giao ban tuần của phòng ban.
// Mỗi (phòng ban, năm, tuần ISO) có 1 báo cáo (weekly_reports) + các dòng nội dung (weekly_report_rows) chia theo mục:
//   A  = Nhiệm vụ theo mảng công việc | B1 = Nhiệm vụ VOffice - phối hợp | B2 = Nhiệm vụ VOffice - trực tiếp | C = Văn bản VOffice.
export async function migrateWeeklyReportTables(): Promise<void> {
  if (!(await db.schema.hasTable("weekly_reports"))) {
    await db.schema.createTable("weekly_reports", (table) => {
      table.increments("id").primary();
      table.integer("department_id").notNullable().references("id").inTable("departments").onDelete("NO ACTION");
      table.integer("year").notNullable();
      table.integer("week").notNullable();
      table.string("ten_cong_ty", 255);
      table.string("created_by", 255);
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
      table.unique(["department_id", "year", "week"]);
    });
  }
  if (!(await db.schema.hasTable("weekly_report_rows"))) {
    await db.schema.createTable("weekly_report_rows", (table) => {
      table.increments("id").primary();
      table.integer("report_id").notNullable().references("id").inTable("weekly_reports").onDelete("CASCADE");
      table.string("section", 4).notNullable();
      table.integer("thu_tu").notNullable().defaultTo(0);
      table.string("mang_cong_viec", 255);
      table.text("muc_tieu");
      table.text("ten"); // Nhiệm vụ (B) / Văn bản (C)
      table.string("chu_tri", 255);
      table.text("noi_dung");
      table.text("tien_do"); // Kết quả thực hiện (A) / Tiến độ thực hiện tuần (B, C)
      table.text("kho_khan");
      table.text("de_xuat");
      table.text("ke_hoach");
      table.string("trang_thai", 50);
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
      table.index(["report_id"]);
    });
  }
}
