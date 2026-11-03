import { db } from "../connection.js";

// Trang "Kế hoạch tổng hợp" > tab "Làm thêm giờ" — bảng tác động/làm thêm giờ
// theo tháng (period_id) + phòng ban (department_id, Quy tắc 9.2): dữ liệu
// tháng này/phòng này KHÔNG lẫn sang tháng/phòng khác. Mỗi dòng = 1 lượt tác
// động của 1 người thực hiện, kèm số giờ/số ngày làm thêm ban ngày + ban đêm.
export async function migrateOvertimeTable(): Promise<void> {
  if (await db.schema.hasTable("overtime_records")) {
    // parent_id: NULL = dòng ĐẦU của 1 lượt tác động (giữ Ngày/Nội dung/Số kế
    // hoạch/Địa điểm DÙNG CHUNG + nhân sự đầu tiên); có giá trị = nhân sự THAM
    // GIA THÊM vào cùng lượt tác động đó (chỉ giữ phần riêng của nhân sự).
    if (!(await db.schema.hasColumn("overtime_records", "parent_id"))) {
      await db.schema.alterTable("overtime_records", (t) => {
        t.integer("parent_id");
      });
    }
    // ca_tac_dong: "Tác động ban ngày" / "Tác động ban đêm" — quyết định hiện/lưu số
    // liệu ban ngày hay ban đêm. Tách khỏi khoang_thoi_gian (ô nhập tự do).
    if (!(await db.schema.hasColumn("overtime_records", "ca_tac_dong"))) {
      await db.schema.alterTable("overtime_records", (t) => {
        t.string("ca_tac_dong", 50);
      });
    }
    // Dữ liệu từng lưu 2 giá trị này vào khoang_thoi_gian (khi đó là ô chọn) -> chuyển sang ca_tac_dong.
    // Các trường thời gian/số giờ/ghi chú giờ DÙNG CHUNG theo lượt tác động (lưu ở dòng đầu) —
    // dọn giá trị cũ còn sót ở dòng nhân sự tham gia thêm (luôn rỗng).
    await db("overtime_records").whereNotNull("parent_id").update({
      bo_phan: null, khoang_thoi_gian: null, ca_tac_dong: null, ban_ngay_so_gio: null, ban_ngay_so_ngay: null,
      ban_dem_so_gio: null, ban_dem_so_ngay: null, ghi_chu: null,
    });
    for (const v of ["Tác động ban ngày", "Tác động ban đêm"]) {
      await db("overtime_records").where({ khoang_thoi_gian: v }).whereNull("ca_tac_dong").update({ ca_tac_dong: v, khoang_thoi_gian: null });
    }
    return;
  }
  await db.schema.createTable("overtime_records", (table) => {
    table.increments("id").primary();
    table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
    table.integer("department_id").references("id").inTable("departments").onDelete("NO ACTION");
    table.integer("parent_id");
    table.string("ngay_tac_dong", 50);
    table.text("noi_dung");
    table.string("so_ke_hoach", 255);
    table.string("dia_diem", 255);
    table.string("ma_nhan_vien", 100);
    table.string("ho_va_ten", 255).notNullable();
    table.string("don_vi", 255);
    table.string("bo_phan", 255);
    table.string("khoang_thoi_gian", 255);
    table.string("ca_tac_dong", 50);
    table.float("ban_ngay_so_gio");
    table.float("ban_ngay_so_ngay");
    table.float("ban_dem_so_gio");
    table.float("ban_dem_so_ngay");
    table.text("ghi_chu");
    table.boolean("is_deleted").notNullable().defaultTo(false);
    table.dateTime("deleted_at");
    table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
    table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
    table.index(["period_id"]);
    table.index(["department_id"]);
  });
}
