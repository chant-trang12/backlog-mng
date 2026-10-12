import { db } from "../connection.js";

// Bảng con "Đối tượng dữ liệu & Vòng đời trạng thái" của từng tính năng số
// hoá (tab 4 trong màn hình chi tiết — xem 13-digital-features.js). Mỗi
// dòng là 1 đối tượng dữ liệu của Module: tên đối tượng, khóa & thuộc tính
// chính, các trạng thái vòng đời của đối tượng đó.
export async function migrateDigitalFeatureDataObjectTables(): Promise<void> {
  if (!(await db.schema.hasTable("digital_feature_data_objects"))) {
    await db.schema.createTable("digital_feature_data_objects", (table) => {
      table.increments("id").primary();
      // Thuộc về tính năng số hoá nào (FK logic — không ràng buộc DB để
      // xóa mềm digital_features không bị chặn).
      table.integer("digital_feature_id").notNullable().index();
      table.string("ten_doi_tuong", 255).notNullable();
      table.text("khoa_thuoc_tinh");
      table.text("vong_doi_trang_thai");
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
    });
  }

  // Xóa mềm — cùng cơ chế với digital_features (core.ts).
  if (!(await db.schema.hasColumn("digital_feature_data_objects", "is_deleted"))) {
    await db.schema.alterTable("digital_feature_data_objects", (table) => {
      table.boolean("is_deleted").notNullable().defaultTo(false);
      table.dateTime("deleted_at");
    });
  }
}
