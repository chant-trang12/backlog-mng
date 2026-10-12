import { db } from "../connection.js";

// Bảng con "Tích hợp & Sự kiện" của từng tính năng số hoá (tab 5 trong màn
// hình chi tiết — xem 13-digital-features.js). Mỗi dòng là 1 luồng tích hợp
// của Module: hướng trao đổi, module/hệ thống đối tác, dữ liệu trao đổi và
// cơ chế/tần suất đồng bộ.
export async function migrateDigitalFeatureIntegrationTables(): Promise<void> {
  if (!(await db.schema.hasTable("digital_feature_integrations"))) {
    await db.schema.createTable("digital_feature_integrations", (table) => {
      table.increments("id").primary();
      // Thuộc về tính năng số hoá nào (FK logic — không ràng buộc DB để
      // xóa mềm digital_features không bị chặn).
      table.integer("digital_feature_id").notNullable().index();
      table.string("huong", 255).notNullable();
      table.string("module_he_thong", 255);
      table.text("du_lieu_trao_doi");
      table.text("co_che_tan_suat");
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
    });
  }

  // Xóa mềm — cùng cơ chế với digital_features (core.ts).
  if (!(await db.schema.hasColumn("digital_feature_integrations", "is_deleted"))) {
    await db.schema.alterTable("digital_feature_integrations", (table) => {
      table.boolean("is_deleted").notNullable().defaultTo(false);
      table.dateTime("deleted_at");
    });
  }
}
