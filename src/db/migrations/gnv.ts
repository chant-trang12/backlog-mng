import { db } from "../connection.js";

// Trang "Kế hoạch tổng hợp" > tab "GNV" — bảng giao nhiệm vụ theo tháng
// (period_id) + phòng ban (department_id, Quy tắc 9.2). Cấu trúc 2 tầng:
// NHÓM lớn (I, II, ... — gnv_groups) chứa các DÒNG nhiệm vụ (gnv_items).
// Dòng có thể tạo tay hoặc lấy từ Backlog (task_id trỏ tasks.id — chỉ để
// truy vết; nội dung đã được sao chép sang dòng GNV nên sửa ở đây không
// đổi Backlog). period_id/department_id lặp ở cả dòng để lọc trực tiếp.
export async function migrateGnvTables(): Promise<void> {
  if (!(await db.schema.hasTable("gnv_groups"))) {
    await db.schema.createTable("gnv_groups", (table) => {
      table.increments("id").primary();
      table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
      table.integer("department_id").references("id").inTable("departments").onDelete("NO ACTION");
      table.integer("thu_tu").notNullable().defaultTo(0);
      table.string("ten_nhom", 500).notNullable();
      table.boolean("is_deleted").notNullable().defaultTo(false);
      table.dateTime("deleted_at");
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
      table.index(["period_id"]);
      table.index(["department_id"]);
    });
  }
  if (!(await db.schema.hasTable("gnv_items"))) {
    await db.schema.createTable("gnv_items", (table) => {
      table.increments("id").primary();
      table.integer("group_id").notNullable().references("id").inTable("gnv_groups").onDelete("NO ACTION");
      table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
      table.integer("department_id").references("id").inTable("departments").onDelete("NO ACTION");
      table.integer("task_id").references("id").inTable("tasks").onDelete("NO ACTION");
      table.integer("parent_item_id");
      table.integer("thu_tu").notNullable().defaultTo(0);
      table.text("muc_tieu");
      table.text("chi_so_kpi");
      table.text("phuong_phap_do");
      table.string("don_vi_do", 100);
      table.float("ty_trong");
      table.string("muc_toi_thieu", 100);
      table.string("muc_mong_doi", 100);
      table.string("muc_thach_thuc", 100);
      table.string("ngay_bat_dau", 50);
      table.string("ngay_hoan_thanh", 50);
      table.text("ket_qua_thuc_hien");
      table.float("cbnv_tu_danh_gia");
      table.float("qltt_danh_gia");
      table.boolean("is_deleted").notNullable().defaultTo(false);
      table.dateTime("deleted_at");
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
      table.index(["group_id"]);
      table.index(["period_id"]);
      table.index(["department_id"]);
    });
  }
  // parent_item_id: NULL = dòng "mục tiêu" (giữ Mục tiêu/Chỉ số KPI/Đơn vị đo/
  // Tỷ trọng DÙNG CHUNG + phương pháp đo đầu tiên); có giá trị = phương pháp
  // đo THÊM của cùng mục tiêu đó (chỉ giữ Phương pháp đo/mức chỉ tiêu/ngày/
  // kết quả/điểm riêng, phần dùng chung lấy từ dòng cha).
  if (!(await db.schema.hasColumn("gnv_items", "parent_item_id"))) {
    await db.schema.alterTable("gnv_items", (table) => {
      table.integer("parent_item_id");
    });
  }
}
