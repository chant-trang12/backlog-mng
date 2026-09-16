import { db } from "../connection.js";

// 14-18. Cấu hình > Tiêu chí + Ranking team — schema gốc. Cột
// department_id/kieu_tinh/nguon_du_lieu/he_so của tieu_chi_configs được
// thêm SAU (ở migrateDepartments, cần bảng departments tồn tại trước).
export async function migrateScoringTables(): Promise<void> {
  // 14. tieu_chi_configs
  const hasTieuChi = await db.schema.hasTable("tieu_chi_configs");
  if (!hasTieuChi) {
    await db.schema.createTable("tieu_chi_configs", (table) => {
      table.increments("id").primary();
      table.string("nhom", 255).notNullable();
      table.string("ten_tieu_chi", 255).notNullable();
      table.text("cach_tinh_diem");
      table.integer("co_chi_tieu").notNullable().defaultTo(0);
      table.integer("thu_tu").notNullable().defaultTo(0);
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
    });
  }

  // 15. tieu_chi_diem_chuan
  const hasTieuChiDiemChuan = await db.schema.hasTable("tieu_chi_diem_chuan");
  if (!hasTieuChiDiemChuan) {
    await db.schema.createTable("tieu_chi_diem_chuan", (table) => {
      table.increments("id").primary();
      table.integer("tieu_chi_id").notNullable().references("id").inTable("tieu_chi_configs").onDelete("CASCADE");
      table.string("team_name", 255).notNullable();
      table.string("diem_chuan", 255);
      table.string("chi_tieu", 255);
      table.unique(["tieu_chi_id", "team_name"]);
    });
  }

  // 16. ranking_rows
  const hasRankingRows = await db.schema.hasTable("ranking_rows");
  if (!hasRankingRows) {
    await db.schema.createTable("ranking_rows", (table) => {
      table.integer("vi_tri").primary();
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
    });
  }

  // 17. ranking_columns
  const hasRankingColumns = await db.schema.hasTable("ranking_columns");
  if (!hasRankingColumns) {
    await db.schema.createTable("ranking_columns", (table) => {
      table.increments("id").primary();
      table.string("ten_cot", 255).notNullable().unique();
      table.integer("thu_tu").notNullable().defaultTo(0);
    });
  }

  // 18. ranking_cells
  const hasRankingCells = await db.schema.hasTable("ranking_cells");
  if (!hasRankingCells) {
    await db.schema.createTable("ranking_cells", (table) => {
      table.increments("id").primary();
      table.integer("vi_tri").notNullable().references("vi_tri").inTable("ranking_rows").onDelete("CASCADE");
      table.integer("column_id").notNullable().references("id").inTable("ranking_columns").onDelete("CASCADE");
      table.string("gia_tri", 255);
      table.unique(["vi_tri", "column_id"]);
    });
  }
}
