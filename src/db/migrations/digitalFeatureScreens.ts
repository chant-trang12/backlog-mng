import { db } from "../connection.js";

// Bảng con "Màn hình, Tính năng & Phân quyền" của từng tính năng số hoá
// (tab 2 trong màn hình chi tiết — xem 13-digital-features.js). Mỗi dòng là
// 1 màn hình/chức năng của Module kèm phân quyền theo vai trò (9 cột vai
// trò, nội dung tự do text — mô tả mức truy cập).
export async function migrateDigitalFeatureScreenTables(): Promise<void> {
  if (!(await db.schema.hasTable("digital_feature_screens"))) {
    await db.schema.createTable("digital_feature_screens", (table) => {
      table.increments("id").primary();
      // Thuộc về tính năng số hoá nào (FK logic — không ràng buộc DB để
      // xóa mềm digital_features không bị chặn).
      table.integer("digital_feature_id").notNullable().index();
      table.string("ma_mh", 100);
      table.string("tn", 255);
      table.string("ten_man_hinh", 255).notNullable();
      table.string("loai", 255);
      table.text("thanh_phan_chinh");
      table.text("hanh_dong");
      table.text("quy_tac_nghiep_vu");
      // 9 cột phân quyền theo vai trò — nội dung mô tả tự do (VD: "Soạn
      // thảo", "Xem", "Phê duyệt").
      table.text("sales_am");
      table.text("truong_dvkd");
      table.text("presales_sp");
      table.text("nv_bdkd");
      table.text("ks_lanh_dao_bdkd");
      table.text("phap_che");
      table.text("tckt");
      table.text("ban_lanh_dao");
      table.text("quan_tri_he_thong");
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
    });
  }

  // Xóa mềm — cùng cơ chế với digital_features (core.ts).
  if (!(await db.schema.hasColumn("digital_feature_screens", "is_deleted"))) {
    await db.schema.alterTable("digital_feature_screens", (table) => {
      table.boolean("is_deleted").notNullable().defaultTo(false);
      table.dateTime("deleted_at");
    });
  }
}
