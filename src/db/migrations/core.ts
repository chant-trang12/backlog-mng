import { db } from "../connection.js";

// 1-4. Bảng nền tảng: Tháng backlog / Team / Nhân sự / Task — mọi bảng khác
// đều tham chiếu (trực tiếp hoặc gián tiếp) tới 1 trong 4 bảng này.
export async function migrateCoreTables(): Promise<void> {
  // 1. periods
  const hasPeriods = await db.schema.hasTable("periods");
  if (!hasPeriods) {
    await db.schema.createTable("periods", (table) => {
      table.increments("id").primary();
      table.integer("year").notNullable();
      table.integer("month").notNullable();
      table.string("label", 255).notNullable();
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
      table.unique(["year", "month"]);
    });
  }

  // 2. teams
  const hasTeams = await db.schema.hasTable("teams");
  if (!hasTeams) {
    await db.schema.createTable("teams", (table) => {
      table.increments("id").primary();
      table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
      table.string("name", 255).notNullable();
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.unique(["period_id", "name"]);
    });
  }

  // 3. members
  const hasMembers = await db.schema.hasTable("members");
  if (!hasMembers) {
    await db.schema.createTable("members", (table) => {
      table.increments("id").primary();
      table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
      table.integer("team_id").notNullable().references("id").inTable("teams").onDelete("NO ACTION");
      table.string("name", 255).notNullable();
      table.string("chuc_vu", 255);
      table.string("tuan_thu", 255);
      table.string("noi_quy", 255);
      table.string("dao_tao", 255);
      table.string("ho_tro", 255);
      table.string("danh_gia", 255);
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.unique(["period_id", "team_id", "name"]);
    });
  }

  // 4. tasks
  const hasTasks = await db.schema.hasTable("tasks");
  if (!hasTasks) {
    await db.schema.createTable("tasks", (table) => {
      table.increments("id").primary();
      table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
      table.integer("stt").notNullable();
      table.text("tinh_chat");
      table.text("khong_tinh_diem");
      table.text("tag");
      table.string("team", 255).notNullable();
      table.text("nhiem_vu").notNullable();
      table.text("dod");
      table.string("ngay_thuc_hien", 50);
      table.string("deadline", 50);
      table.string("nvtt", 255);
      table.integer("phan_tram_hoan_thanh").notNullable().defaultTo(0);
      table.string("trang_thai", 50).notNullable().defaultTo("Chưa thực hiện");
      table.text("tien_do");
      table.integer("cpo_danh_gia");
      table.text("cpo_comment");
      table.integer("da_chuyen_thang").notNullable().defaultTo(0);
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
      table.index(["period_id"]);
      table.index(["team"]);
    });
  }

  // tasks.da_chuyen_thang — cờ đánh dấu "Chuyển sang tháng sau" (bulk action
  // ở Backlog: nhân bản task sang period kế tiếp, đánh dấu bản gốc để không
  // bị chuyển trùng lần 2 — xem moveTasksToNextMonth() ở task.service.ts).
  // BUG đã gặp thực tế: cột này chỉ khai báo trong createTable ở trên, nên
  // deployment nào đã có sẵn bảng "tasks" TRƯỚC KHI cột này được thêm vào
  // code thì hasTasks=true -> bỏ qua createTable -> KHÔNG BAO GIỜ có cột
  // này -> "Chuyển sang tháng sau" lỗi "no such column: da_chuyen_thang".
  // Thêm riêng 1 bước hasColumn/alterTable ở đây (idempotent, giống mọi
  // cột phát sinh sau khác) để tự vá cho các DB cũ.
  if (!(await db.schema.hasColumn("tasks", "da_chuyen_thang"))) {
    await db.schema.alterTable("tasks", (table) => {
      table.integer("da_chuyen_thang").notNullable().defaultTo(0);
    });
  }
}

// 5-7. CSKH: Sự cố / Hỗ trợ ticket / Tỉ lệ khởi tạo — CRUD theo team.
export async function migrateCskhTables(): Promise<void> {
  // 5. incidents
  const hasIncidents = await db.schema.hasTable("incidents");
  if (!hasIncidents) {
    await db.schema.createTable("incidents", (table) => {
      table.increments("id").primary();
      table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
      table.integer("team_id").notNullable().references("id").inTable("teams").onDelete("NO ACTION");
      table.text("su_co").notNullable();
      table.string("tinh_chat", 255);
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
    });
  }

  // 6. tickets
  const hasTickets = await db.schema.hasTable("tickets");
  if (!hasTickets) {
    await db.schema.createTable("tickets", (table) => {
      table.increments("id").primary();
      table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
      table.integer("team_id").notNullable().references("id").inTable("teams").onDelete("NO ACTION");
      table.integer("tong_ticket").notNullable().defaultTo(0);
      table.integer("ticket_vuot").notNullable().defaultTo(0);
      table.integer("dung_han").notNullable().defaultTo(0);
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
    });
  }

  // 7. creation_rates
  const hasCreationRates = await db.schema.hasTable("creation_rates");
  if (!hasCreationRates) {
    await db.schema.createTable("creation_rates", (table) => {
      table.increments("id").primary();
      table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
      table.integer("team_id").notNullable().references("id").inTable("teams").onDelete("NO ACTION");
      table.integer("so_luong_thanh_cong").notNullable().defaultTo(0);
      table.integer("so_luong_that_bai").notNullable().defaultTo(0);
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
    });
  }
}

// 8-13. Các bảng ở trang "Team & Nhân sự" (trừ Nhân sự đã ở migrateCoreTables):
// Tuân thủ / Đào tạo / Chấm công / Nội quy / Hỗ trợ / Đánh giá.
export async function migrateTeamRecordTables(): Promise<void> {
  // 8. compliance_records
  const hasCompliance = await db.schema.hasTable("compliance_records");
  if (!hasCompliance) {
    await db.schema.createTable("compliance_records", (table) => {
      table.increments("id").primary();
      table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
      table.integer("member_id").notNullable().references("id").inTable("members").onDelete("NO ACTION");
      table.integer("vi_pham").notNullable().defaultTo(0);
      table.text("noi_dung");
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
    });
  }

  // 9. training_records
  const hasTraining = await db.schema.hasTable("training_records");
  if (!hasTraining) {
    await db.schema.createTable("training_records", (table) => {
      table.increments("id").primary();
      table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
      table.integer("member_id").notNullable().references("id").inTable("members").onDelete("NO ACTION");
      table.string("loai", 255);
      table.string("ngay_thuc_hien", 50);
      table.string("nguoi_xac_nhan", 255);
      table.text("noi_dung");
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
    });
  }

  // 10. attendance_records
  const hasAttendance = await db.schema.hasTable("attendance_records");
  if (!hasAttendance) {
    await db.schema.createTable("attendance_records", (table) => {
      table.increments("id").primary();
      table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
      table.integer("row_index").notNullable();
      table.text("row_data").notNullable();
      table.integer("excluded_from_late").notNullable().defaultTo(0);
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
    });
  }

  // 11. noiquy_overrides
  const hasNoiQuy = await db.schema.hasTable("noiquy_overrides");
  if (!hasNoiQuy) {
    await db.schema.createTable("noiquy_overrides", (table) => {
      table.increments("id").primary();
      table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
      table.string("member_name", 255).notNullable();
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.unique(["period_id", "member_name"]);
    });
  }

  // 12. support_records
  const hasSupport = await db.schema.hasTable("support_records");
  if (!hasSupport) {
    await db.schema.createTable("support_records", (table) => {
      table.increments("id").primary();
      table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
      table.integer("member_id").notNullable().references("id").inTable("members").onDelete("NO ACTION");
      table.integer("team_nhan_ho_tro_id").notNullable().references("id").inTable("teams").onDelete("NO ACTION");
      table.text("noi_dung");
      table.string("ngay_ho_tro", 50);
      table.string("nguoi_xac_nhan", 255);
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
    });
  }

  // 13. danh_gia_records
  const hasDanhGia = await db.schema.hasTable("danh_gia_records");
  if (!hasDanhGia) {
    await db.schema.createTable("danh_gia_records", (table) => {
      table.increments("id").primary();
      table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
      table.integer("member_id").notNullable().references("id").inTable("members").onDelete("NO ACTION");
      table.integer("so_thu_tu");
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
      table.unique(["period_id", "member_id"]);
    });
  }
}
