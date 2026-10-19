import { db } from "../connection.js";

// "Quản lý tính năng số hoá" — danh sách các tính năng/nghiệp vụ cần quản
// lý việc số hoá (menu mới dưới Roadmap năm).
//
// [Quy tắc 9.2] department_id — "ai đã Thêm/Import dòng này" (giống
// feature_requests.department_id), gán tự động ở service theo req.dataScope
// của người thao tác, KHÔNG nhận từ client. Phòng bị giới hạn chỉ
// thấy/sửa/xóa được dòng department_id = phòng mình HOẶC department_id
// NULL (dữ liệu cũ import trước khi có cột này — coi là "dùng chung", vẫn
// hiển thị/sửa được cho mọi phòng để không mất quyền truy cập đột ngột —
// xem isDigitalFeatureInScope() ở scope.util.ts). admin/phòng full-access
// (scope.all) luôn thấy/sửa toàn bộ.
export async function migrateDigitalFeatureTables(): Promise<void> {
  if (!(await db.schema.hasTable("digital_features"))) {
    await db.schema.createTable("digital_features", (table) => {
      table.increments("id").primary();
      // Mã tính năng — tự sinh "TNSH-xxx" nếu người dùng không nhập; trùng
      // Mã giữa các dòng ĐANG HIỂN THỊ bị chặn ở service (unique logic, không
      // unique index DB để dòng đã xóa mềm không chặn tái sử dụng mã).
      table.string("ma", 100);
      table.string("module", 255).notNullable();
      table.text("don_vi_chu_tri");
      table.text("don_vi_phoi_hop");
      table.string("giai_doan", 255);
      // TN / MH — ký hiệu riêng của biểu mẫu quản lý (tự do text).
      table.string("tn_mh", 255);
      table.text("muc_tieu_nghiep_vu");
      table.text("vai_tro_pbdkd");
      table.text("nhan_dau_vao_tu");
      table.text("chuyen_dau_ra_toi");
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
    });
  }

  // Phạm vi phòng ban (Quy tắc 9.2) — thêm sau, NULL = dữ liệu cũ/phòng
  // full-access, xem comment đầu file.
  if (!(await db.schema.hasColumn("digital_features", "department_id"))) {
    await db.schema.alterTable("digital_features", (table) => {
      table.integer("department_id").references("id").inTable("departments").onDelete("NO ACTION");
    });
  }

  // Xóa mềm — digital_features không có UNIQUE riêng nên chỉ cần thêm cột
  // (xem comment đầy đủ ở migrateSoftDeleteCore, core.ts).
  if (!(await db.schema.hasColumn("digital_features", "is_deleted"))) {
    await db.schema.alterTable("digital_features", (table) => {
      table.boolean("is_deleted").notNullable().defaultTo(false);
      table.dateTime("deleted_at");
    });
  }

  // Log hoạt động ghi TRƯỚC khi có mapping tiếng Việt ở actionLog.middleware
  // còn dùng nguyên segment gốc ("digital-features", module rỗng) — quy về
  // nhãn mới cho đồng bộ với log mới ("Tính năng số hoá"/module "Quản lý
  // tính năng số hoá"). Idempotent (REPLACE không khớp thì không đổi gì).
  await db("action_logs")
    .whereLike("description", "%digital-features%")
    .update({
      description: db.raw("REPLACE(description, 'digital-features', 'Tính năng số hoá')"),
    });
  await db("action_logs")
    .whereLike("path", "%digital-features%") // req.path trong middleware KHÔNG có tiền tố "/api"
    .where((qb) => {
      qb.where("module", "digital-features").orWhereNull("module");
    })
    .update({ module: "Quản lý tính năng số hoá" });
}
