import { db } from "../connection.js";

// 24-28. Roadmap năm (theo department_id + year) và 2 danh mục riêng dùng ở
// đó (Hệ thống, Mục tiêu).
export async function migrateRoadmapTables(): Promise<void> {
  // 24. he_thong_options — danh mục Hệ thống (Website, Nội bộ...), dùng ở
  // Roadmap năm.
  if (!(await db.schema.hasTable("he_thong_options"))) {
    await db.schema.createTable("he_thong_options", (table) => {
      table.increments("id").primary();
      table.string("ten_he_thong", 255).notNullable().unique();
      table.integer("thu_tu").notNullable().defaultTo(0);
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
    });
  }
  const heThongCountRes = await db("he_thong_options").count({ c: "*" }).first();
  if (Number((heThongCountRes as any)?.c ?? 0) === 0) {
    const seed = ["Website", "Nội bộ", "App Mobile"];
    for (let i = 0; i < seed.length; i++) {
      await db("he_thong_options").insert({ ten_he_thong: seed[i], thu_tu: i });
    }
  }

  // 25. muc_tieu_options — danh mục Mục tiêu (Tính năng mới, Nâng cấp...),
  // dùng ở Roadmap năm.
  if (!(await db.schema.hasTable("muc_tieu_options"))) {
    await db.schema.createTable("muc_tieu_options", (table) => {
      table.increments("id").primary();
      table.string("ten_muc_tieu", 255).notNullable().unique();
      table.integer("thu_tu").notNullable().defaultTo(0);
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
    });
  }
  const mucTieuCountRes = await db("muc_tieu_options").count({ c: "*" }).first();
  if (Number((mucTieuCountRes as any)?.c ?? 0) === 0) {
    const seed = ["Tính năng mới", "Nâng cấp tính năng", "Tối ưu hệ thống"];
    for (let i = 0; i < seed.length; i++) {
      await db("muc_tieu_options").insert({ ten_muc_tieu: seed[i], thu_tu: i });
    }
  }

  // 26. roadmap_items — Roadmap năm, theo (department_id, year). "Quý kết
  // thúc" là giá trị suy ra từ thoi_gian_ket_thuc, không lưu.
  if (!(await db.schema.hasTable("roadmap_items"))) {
    await db.schema.createTable("roadmap_items", (table) => {
      table.increments("id").primary();
      table.integer("department_id").references("id").inTable("departments").onDelete("CASCADE");
      table.integer("year").notNullable();
      table.string("team", 255).notNullable();
      table.string("he_thong", 255);
      table.string("muc_tieu", 255);
      table.text("nhiem_vu").notNullable();
      table.text("dod");
      table.text("dieu_kien_dam_bao");
      table.string("phan_loai", 255);
      table.string("thoi_gian_bat_dau", 50);
      table.string("thoi_gian_ket_thuc", 50);
      table.string("trang_thai", 100).notNullable().defaultTo("Chưa thực hiện");
      table.text("ghi_chu");
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
    });
  }

  // 27. roadmap_details — chi tiết công việc theo tháng của 1 dòng roadmap.
  if (!(await db.schema.hasTable("roadmap_details"))) {
    await db.schema.createTable("roadmap_details", (table) => {
      table.increments("id").primary();
      table
        .integer("roadmap_item_id")
        .notNullable()
        .references("id")
        .inTable("roadmap_items")
        .onDelete("CASCADE");
      table.integer("month").notNullable(); // 1..12
      table.text("noi_dung").notNullable();
      table.string("trang_thai", 100).notNullable().defaultTo("Chưa thực hiện");
      table.text("ghi_chu");
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
    });
  }

  // 28. roadmap_items.synced_task_id — đánh dấu dòng roadmap đã được tự
  // động đưa vào backlog (task tương ứng) theo tháng bắt đầu, để không tạo
  // trùng khi thêm tháng mới hoặc sửa lại roadmap. Task bị xóa thì chỉ gỡ
  // liên kết (SET NULL), không xóa ngược lại dòng roadmap.
  if (!(await db.schema.hasColumn("roadmap_items", "synced_task_id"))) {
    await db.schema.alterTable("roadmap_items", (table) => {
      table.integer("synced_task_id").references("id").inTable("tasks").onDelete("SET NULL");
    });
  }
}
