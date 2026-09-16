import { db } from "../connection.js";

// 19-22. Danh mục dùng ở Cấu hình > Tag & Phân loại — schema gốc. Seed dữ
// liệu mặc định ở seedCatalogData() bên dưới (tách riêng vì cần chạy sau
// migrateScoringTables — nhom_options seed từ dữ liệu tieu_chi_configs sẵn có).
export async function migrateCatalogTables(): Promise<void> {
  // 19. tags
  const hasTags = await db.schema.hasTable("tags");
  if (!hasTags) {
    await db.schema.createTable("tags", (table) => {
      table.increments("id").primary();
      table.string("ten_tag", 255).notNullable().unique();
      table.integer("thu_tu").notNullable().defaultTo(0);
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
    });
  }

  // 20. phan_loai_options
  const hasPhanLoai = await db.schema.hasTable("phan_loai_options");
  if (!hasPhanLoai) {
    await db.schema.createTable("phan_loai_options", (table) => {
      table.increments("id").primary();
      table.string("ten_phan_loai", 255).notNullable().unique();
      table.integer("thu_tu").notNullable().defaultTo(0);
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
    });
  }

  // 21. nhom_options
  const hasNhom = await db.schema.hasTable("nhom_options");
  if (!hasNhom) {
    await db.schema.createTable("nhom_options", (table) => {
      table.increments("id").primary();
      table.string("ten_nhom", 255).notNullable().unique();
      table.integer("thu_tu").notNullable().defaultTo(0);
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
    });
  }

  // 22. chuc_vu_options
  const hasChucVu = await db.schema.hasTable("chuc_vu_options");
  if (!hasChucVu) {
    await db.schema.createTable("chuc_vu_options", (table) => {
      table.increments("id").primary();
      table.string("ten_chuc_vu", 255).notNullable().unique();
      table.integer("thu_tu").notNullable().defaultTo(0);
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
    });
  }
}

// Seed dữ liệu mặc định cho các danh mục ở trên — chạy sau khi mọi bảng liên
// quan (kể cả tieu_chi_configs, để nhom_options backfill đúng dữ liệu sẵn
// có) đã tồn tại.
export async function seedCatalogData(): Promise<void> {
  // Seed danh mục Tag
  const tagCountRes = await db("tags").count({ c: "*" }).first();
  const tagCount = Number((tagCountRes as any)?.c ?? 0);
  if (tagCount === 0) {
    const seedTags = [
      "Số hoá",
      "Đầu tư",
      "Chất lượng dịch vụ",
      "Trải nghiệm khách hàng",
      "Quản lý chất lượng",
      "ISO",
      "Quy trình",
      "Nhiệm vụ kỹ thuật",
    ];
    for (let i = 0; i < seedTags.length; i++) {
      await db("tags").insert({ ten_tag: seedTags[i], thu_tu: i });
    }
  }

  // Seed danh mục Phân loại
  const phanLoaiCountRes = await db("phan_loai_options").count({ c: "*" }).first();
  const phanLoaiCount = Number((phanLoaiCountRes as any)?.c ?? 0);
  if (phanLoaiCount === 0) {
    const seedPhanLoai = ["NVKH", "NVPS", "NVTT", "NV được giao từ BGĐ"];
    for (let i = 0; i < seedPhanLoai.length; i++) {
      await db("phan_loai_options").insert({ ten_phan_loai: seedPhanLoai[i], thu_tu: i });
    }
  }

  // Seed danh mục Nhóm từ tieu_chi_configs
  const nhomCountRes = await db("nhom_options").count({ c: "*" }).first();
  const nhomCount = Number((nhomCountRes as any)?.c ?? 0);
  if (nhomCount === 0) {
    const existingNhom = await db("tieu_chi_configs")
      .select("nhom")
      .min({ min_id: "id" })
      .groupBy("nhom")
      .orderBy("min_id", "asc");
    for (let i = 0; i < existingNhom.length; i++) {
      await db("nhom_options").insert({ ten_nhom: (existingNhom[i] as any).nhom, thu_tu: i });
    }
  }

  // Seed danh mục Chức vụ
  const chucVuCountRes = await db("chuc_vu_options").count({ c: "*" }).first();
  const chucVuCount = Number((chucVuCountRes as any)?.c ?? 0);
  if (chucVuCount === 0) {
    const seedChucVu = [
      "Trưởng phòng",
      "Chuyên gia",
      "Trưởng nhóm",
      "Trưởng nhóm (Nội bộ)",
      "Trưởng nhóm (ATM + Billing)",
      "Nghiệp vụ sản phẩm (BA)",
      "Nhân viên Nghiệp vụ Kỹ thuật",
      "Chuyên gia Nghiên cứu Phát triển dịch vụ",
      "Kỹ sư Phần mềm",
      "Kỹ sư kiểm thử & Quản lý chất lượng",
      "Chuyên viên Quy trình - ISO",
      "Nhân viên quản lý phát triển bền vững",
      "Kỹ sư Phân tích Dữ liệu (DA)",
      "Nhân viên quản lý chất lượng",
      "Kỹ sư dữ liệu (DE)",
      "Nhân viên thiết kế, đồ họa (UI/UX Designer)",
      "Nhân viên quy trình - ISO",
      "Nhân viên Scrum Master",
      "Nhân viên phân tích nghiệp vụ",
      "Chuyên viên Trí tuệ nhân tạo",
    ];
    for (let i = 0; i < seedChucVu.length; i++) {
      await db("chuc_vu_options").insert({ ten_chuc_vu: seedChucVu[i], thu_tu: i });
    }
  }
}
