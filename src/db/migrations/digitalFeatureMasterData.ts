import { db } from "../connection.js";

// Bảng con "Danh mục (Master Data) của Module" của từng tính năng số hoá
// (tab 3 trong màn hình chi tiết — xem 13-digital-features.js). Mỗi dòng là
// 1 danh mục/master data thuộc Module: mã, tên, nội dung/thuộc tính và đơn
// vị/vai trò quản trị danh mục đó.
export async function migrateDigitalFeatureMasterDataTables(): Promise<void> {
  if (!(await db.schema.hasTable("digital_feature_master_data"))) {
    await db.schema.createTable("digital_feature_master_data", (table) => {
      table.increments("id").primary();
      // Thuộc về tính năng số hoá nào (FK logic — không ràng buộc DB để
      // xóa mềm digital_features không bị chặn).
      table.integer("digital_feature_id").notNullable().index();
      table.string("ma_danh_muc", 100);
      table.string("ten_danh_muc", 255).notNullable();
      table.text("noi_dung_thuoc_tinh");
      table.string("quan_tri_boi", 255);
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
    });
  }

  // Xóa mềm — cùng cơ chế với digital_features (core.ts).
  if (!(await db.schema.hasColumn("digital_feature_master_data", "is_deleted"))) {
    await db.schema.alterTable("digital_feature_master_data", (table) => {
      table.boolean("is_deleted").notNullable().defaultTo(false);
      table.dateTime("deleted_at");
    });
  }
}
