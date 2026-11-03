import { db } from "../connection.js";

// Trang "Kế hoạch tổng hợp" > tab "KQ xếp loại CBNV" — bảng kết quả xếp
// loại CBNV theo tháng (period_id) + phòng ban (department_id, Quy tắc
// 9.2 — phòng ban khác nhau KHÔNG hiển thị lẫn dữ liệu của nhau), nhập
// liệu chủ yếu qua Import Excel (biểu mẫu HR sẵn có) + nút "Lấy thông tin
// xếp loại" (tự động điền Họ và tên/Tổ nhóm/Xếp loại từ team đang tính KI
// theo team — xem summaryPlan.service.ts#upsertKiFromRanking) + Sửa tay
// từng dòng. member_id nullable: dòng Import có thể không khớp được nhân
// sự nào có sẵn trong hệ thống (file HR độc lập, tên có thể không khớp
// 100%) — vẫn cho lưu, chỉ mất khả năng "Lấy thông tin xếp loại" ghi đè
// đúng dòng đó về sau (sẽ tạo dòng mới thay vì cập nhật).
export async function migrateCbnvXepLoaiTable(): Promise<void> {
  const hasTable = await db.schema.hasTable("cbnv_xep_loai_records");
  if (hasTable) {
    if (!(await db.schema.hasColumn("cbnv_xep_loai_records", "ghi_chu_de_xuat"))) {
      await db.schema.alterTable("cbnv_xep_loai_records", (t) => {
        t.text("ghi_chu_de_xuat");
      });
    }
    return;
  }

  await db.schema.createTable("cbnv_xep_loai_records", (table) => {
    table.increments("id").primary();
    table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
    table.integer("department_id").references("id").inTable("departments").onDelete("NO ACTION");
    table.integer("member_id").references("id").inTable("members").onDelete("SET NULL");
    table.string("ma_nhan_vien", 100);
    table.string("ho_va_ten", 255).notNullable();
    table.string("chuc_danh", 255);
    table.string("don_vi", 255);
    table.string("to_nhom", 255);
    table.decimal("diem_danh_gia", 10, 2);
    table.string("xep_loai_ket_qua", 255);
    table.string("tuan_thu_dia_diem", 100);
    table.string("tuan_thu_noi_quy", 100);
    table.string("xep_loai", 20);
    table.string("xep_loai_muc_do", 100);
    table.text("ghi_chu_de_xuat");
    table.text("chu_y");
    table.boolean("is_deleted").notNullable().defaultTo(false);
    table.dateTime("deleted_at");
    table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
    table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
    table.index(["period_id"]);
    table.index(["department_id"]);
  });
}
