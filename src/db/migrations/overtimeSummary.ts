import { db } from "../connection.js";

// Tab "Tổng hợp làm thêm giờ" (Kế hoạch tổng hợp): MỖI DÒNG = 1 nhân sự trong 1 tháng (period_id) + phòng ban (department_id).
// Chỉ lưu phần NHẬP (giờ/ngày ban ngày + ban đêm, ghi chú, tổng các tháng trước nhập tay nếu có); các cột còn lại (tổng
// tháng, vượt quy định 40h/tháng, lũy kế, tỷ lệ 200h/năm, đánh giá) được TÍNH khi đọc — xem overtimeSummary.service.ts.
export async function migrateOvertimeSummaryTable(): Promise<void> {
  if (await db.schema.hasTable("overtime_summary_records")) return;
  await db.schema.createTable("overtime_summary_records", (table) => {
    table.increments("id").primary();
    table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
    table.integer("department_id").references("id").inTable("departments").onDelete("NO ACTION");
    table.string("ma_nhan_vien", 100);
    table.string("ho_va_ten", 255).notNullable();
    table.string("don_vi", 255);
    table.string("bo_phan", 255);
    table.float("ban_ngay_so_gio");
    table.float("ban_ngay_so_ngay");
    table.float("ban_dem_so_gio");
    table.float("ban_dem_so_ngay");
    table.float("tong_cac_thang_truoc_nhap"); // nhập tay (NULL = tự cộng từ các tháng trước trong năm)
    table.text("ghi_chu");
    table.boolean("is_deleted").notNullable().defaultTo(false);
    table.dateTime("deleted_at");
    table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
    table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
    table.index(["period_id"]);
    table.index(["department_id"]);
  });
}
