import { db, isMssql } from "../connection.js";

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

// Xóa mềm (is_deleted/deleted_at) cho periods/teams/members/tasks — gắn cờ
// thay vì DELETE thật, để dữ liệu không mất hẳn khỏi file DB khi có sự cố
// (vẫn backup/khôi phục được), chỉ biến mất khỏi mọi màn hình như xóa thật
// (mọi query đọc lọc is_deleted=false — xem softDelete.util.ts). Idempotent
// — chạy sau createTable/migrateCoreTables ở trên, vá cho cả DB mới lẫn DB
// cũ đã có sẵn các bảng này từ trước.
//
// periods/teams/members có UNIQUE constraint (year+month / period+name /
// period+team+name) — nếu giữ nguyên, 1 bản ghi xóa mềm sẽ tiếp tục CHIẾM
// CHỖ unique, chặn không tạo lại được đúng tháng/tên đó sau này. Đổi sang
// filtered unique index (chỉ áp dụng cho dòng CHƯA xóa — predicate "is_deleted
// = 0", cú pháp dùng chung được cho cả SQLite lẫn MSSQL qua knex).
//
// LƯU Ý QUAN TRỌNG (phát hiện khi chạy thật): bảng nào được tạo bởi 1 phiên
// bản code CŨ hơn có thể có UNIQUE constraint khai INLINE ngay trong CREATE
// TABLE (SQLite tự quản lý dưới dạng "sqlite_autoindex_*", KHÔNG có tên
// riêng) thay vì 1 CREATE UNIQUE INDEX riêng theo đúng quy ước đặt tên của
// knex — gặp đúng trường hợp này ở periods/teams/members/danh_gia_records/
// noiquy_overrides trên DB thật của dự án. `table.dropUnique([cols])` của
// knex CHỈ xóa được index có tên (DROP INDEX <tên>) — gặp constraint inline
// kiểu này sẽ báo lỗi "no such index". ensureFilteredUniqueIndex() bên dưới
// tự dò: có đúng named index theo quy ước knex thì dropUnique bình thường
// (đường nhanh, đã test kỹ); không có (chỉ có autoindex) thì tự rebuild lại
// bảng bằng schema CHÍNH XÁC đang có hiện tại (đọc qua PRAGMA table_info,
// không hard-code để không lệch nếu cột thực tế khác cột trong code) rồi
// gắn lại đúng FK/index phụ đã có.
export async function migrateSoftDeleteCore(): Promise<void> {
  await ensureSoftDeleteColumns("periods");
  await ensureFilteredUniqueIndex("periods", ["year", "month"], "periods_year_month_active_unique");

  await ensureSoftDeleteColumns("teams");
  await ensureFilteredUniqueIndex("teams", ["period_id", "name"], "teams_period_id_name_active_unique");

  await ensureSoftDeleteColumns("members", { index: true });
  await ensureFilteredUniqueIndex(
    "members",
    ["period_id", "team_id", "name"],
    "members_period_team_name_active_unique",
  );

  await ensureSoftDeleteColumns("tasks", { index: true });
}

// ---- Helper dùng chung cho mọi bảng xóa mềm trong migrations/*.ts ----

// Thêm is_deleted/deleted_at nếu chưa có — luôn an toàn (ADD COLUMN đơn
// thuần, SQLite KHÔNG cần rebuild cho riêng bước này).
export async function ensureSoftDeleteColumns(
  table: string,
  opts: { index?: boolean } = {},
): Promise<void> {
  if (await db.schema.hasColumn(table, "is_deleted")) return;
  await db.schema.alterTable(table, (t) => {
    t.boolean("is_deleted").notNullable().defaultTo(false);
    t.dateTime("deleted_at");
    if (opts.index) t.index(["is_deleted"]);
  });
}

async function filteredUniqueIndexExists(table: string, indexName: string): Promise<boolean> {
  if (isMssql) {
    const rows = await db.raw(
      `SELECT 1 AS found FROM sys.indexes WHERE object_id = OBJECT_ID(?) AND name = ?`,
      [table, indexName],
    );
    return (rows as any[]).length > 0;
  }
  const rows = await db.raw(`SELECT 1 AS found FROM sqlite_master WHERE type='index' AND tbl_name=? AND name=?`, [
    table,
    indexName,
  ]);
  return (rows as any[]).length > 0;
}

// Named index đúng quy ước mặc định của knex khi gọi table.unique([cols])
// bên trong 1 alterTable/createTable KHÔNG đặt tên riêng.
function knexDefaultUniqueIndexName(table: string, columns: string[]): string {
  return `${table}_${columns.join("_")}_unique`;
}

export async function ensureFilteredUniqueIndex(
  table: string,
  columns: string[],
  indexName: string,
): Promise<void> {
  if (await filteredUniqueIndexExists(table, indexName)) return;

  if (isMssql) {
    // MSSQL: DROP CONSTRAINT/INDEX hiện có trên đúng bộ cột này (nếu có)
    // rồi tạo filtered index mới — không cần rebuild bảng.
    const existing = await db.raw(
      `SELECT i.name FROM sys.indexes i
       WHERE i.object_id = OBJECT_ID(?) AND i.is_unique = 1
         AND (SELECT COUNT(*) FROM sys.index_columns ic
              JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
              WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id
                AND c.name NOT IN (${columns.map(() => "?").join(",")})) = 0`,
      [table, ...columns],
    );
    for (const row of existing as { name: string }[]) {
      await db.raw(`DROP INDEX [${row.name}] ON [${table}]`);
    }
    await db.schema.alterTable(table, (t) => {
      t.unique(columns, { indexName, predicate: db.whereRaw("is_deleted = 0") });
    });
    return;
  }

  // SQLite — thử đường nhanh trước: nếu có sẵn named index đúng quy ước
  // knex thì dropUnique bình thường rồi tạo filtered index mới (1 lần
  // rebuild, đã kiểm chứng giữ nguyên FK/CASCADE/dữ liệu).
  const namedIdx = knexDefaultUniqueIndexName(table, columns);
  const hasNamed = await db.raw(`SELECT 1 AS found FROM sqlite_master WHERE type='index' AND tbl_name=? AND name=?`, [
    table,
    namedIdx,
  ]);
  if ((hasNamed as any[]).length > 0) {
    await db.schema.alterTable(table, (t) => {
      t.dropUnique(columns);
      t.unique(columns, { indexName, predicate: db.whereRaw("is_deleted = 0") });
    });
    return;
  }

  // Không có named index — UNIQUE đang nằm INLINE trong CREATE TABLE
  // (sqlite_autoindex_*, từ 1 phiên bản code cũ hơn). Rebuild thủ công:
  // đọc đúng danh sách cột/kiểu/NOT NULL/default/FK hiện có qua PRAGMA,
  // tạo bảng mới giữ nguyên toàn bộ, copy dữ liệu, xóa bảng cũ, đổi tên.
  await rebuildSqliteTableWithoutInlineUnique(table, columns, indexName);
}

// Đọc cấu trúc THẬT của bảng qua PRAGMA (không hard-code) để rebuild chính
// xác — chỉ bỏ UNIQUE constraint inline cũ, mọi cột/FK/index phụ khác giữ
// nguyên 100%, rồi gắn thêm filtered unique index mới.
async function rebuildSqliteTableWithoutInlineUnique(
  table: string,
  uniqueColumns: string[],
  indexName: string,
): Promise<void> {
  // SQLite CHỈ cho bật/tắt PRAGMA foreign_keys khi KHÔNG có transaction nào
  // đang mở (đổi giữa chừng 1 transaction sẽ bị lờ đi, không báo lỗi) — vì
  // vậy KHÔNG dùng db.transaction() (tự động BEGIN trước khi vào callback,
  // quá trễ để tắt foreign_keys). Tự quản lý BEGIN/COMMIT bằng raw SQL, đặt
  // PRAGMA OFF trước khi BEGIN. connection.ts đã ép pool còn đúng 1
  // connection (better-sqlite3 vốn đồng bộ, không cần nhiều connection) để
  // các lệnh .raw() tuần tự dưới đây chắc chắn chạy trên CÙNG 1 connection
  // — PRAGMA là thiết lập riêng từng connection trong SQLite.
  await db.raw("PRAGMA foreign_keys = OFF");
  try {
    await db.raw("BEGIN");

    // Baseline TRƯỚC khi rebuild — DB thật của dự án này đã có sẵn 1 số
    // dòng mồ côi từ trước (dữ liệu demo cũ, không liên quan gì tới đợt xóa
    // mềm này — xem lịch sử làm việc). PRAGMA foreign_key_check không nhận
    // tham số sẽ quét TOÀN BỘ DB, không chỉ bảng đang rebuild, nên phải so
    // sánh TRƯỚC/SAU để chỉ chặn khi CHÍNH rebuild này tạo ra vi phạm MỚI,
    // không chặn vì phát hiện lại vi phạm cũ vốn đã tồn tại sẵn.
    // KHÔNG đưa fkid vào key so sánh — fkid chỉ là số thứ tự FK trong định
    // nghĩa bảng (0,1,2...), thứ tự này có thể đổi sau khi rebuild (FK
    // clause được ghi lại theo thứ tự PRAGMA foreign_key_list trả về, chưa
    // chắc khớp thứ tự gốc) khiến 1 vi phạm CŨ bị tưởng nhầm là MỚI dù
    // cùng 1 dòng/cùng tham chiếu tới cùng 1 bảng cha. (table, rowid,
    // parent) là đủ để nhận diện đúng 1 vi phạm.
    const violationKey = (v: any) => `${v.table}|${v.rowid}|${v.parent}`;
    const beforeViolations = ((await db.raw("PRAGMA foreign_key_check")) as any[]).map(violationKey).sort();

    const columns = await db.raw(`PRAGMA table_info(${table})`);
    const fks = await db.raw(`PRAGMA foreign_key_list(${table})`);
    // Index phụ (không phải unique autoindex) cần tạo lại sau khi rebuild —
    // VD members_department_id_index.
    const otherIndexes = await db.raw(
      `SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL`,
      [table],
    );

    const colDefs = (columns as any[])
      .map((c) => {
        let def = `\`${c.name}\` ${c.type}`;
        if (c.notnull) def += " NOT NULL";
        // Bọc ngoặc mọi default (kể cả literal đơn giản) — SQLite chấp nhận
        // "DEFAULT (x)" cho mọi trường hợp, tránh lỗi cú pháp với default
        // dạng biểu thức/hàm gọi (VD datetime('now')) mà PRAGMA table_info
        // trả về KHÔNG kèm ngoặc ngoài.
        if (c.dflt_value !== null && c.dflt_value !== undefined) def += ` DEFAULT (${c.dflt_value})`;
        if (c.pk) def += " PRIMARY KEY AUTOINCREMENT";
        return def;
      })
      .join(", ");
    const fkDefs = (fks as any[])
      .map(
        (fk) =>
          `, FOREIGN KEY (\`${fk.from}\`) REFERENCES \`${fk.table}\`(\`${fk.to}\`)${
            fk.on_delete && fk.on_delete !== "NO ACTION" ? ` ON DELETE ${fk.on_delete}` : ""
          }`,
      )
      .join("");

    const tmpTable = `${table}__softdel_rebuild`;
    await db.raw(`DROP TABLE IF EXISTS \`${tmpTable}\``);
    await db.raw(`CREATE TABLE \`${tmpTable}\` (${colDefs}${fkDefs})`);
    const colNames = (columns as any[]).map((c) => `\`${c.name}\``).join(", ");
    await db.raw(`INSERT INTO \`${tmpTable}\` (${colNames}) SELECT ${colNames} FROM \`${table}\``);
    await db.raw(`DROP TABLE \`${table}\``);
    await db.raw(`ALTER TABLE \`${tmpTable}\` RENAME TO \`${table}\``);

    // Tạo lại index phụ (không phải PK/unique tự sinh) đã có trước rebuild.
    for (const idx of otherIndexes as { name: string; sql: string }[]) {
      await db.raw(idx.sql);
    }

    await db.schema.alterTable(table, (t) => {
      t.unique(uniqueColumns, { indexName, predicate: db.whereRaw("is_deleted = 0") });
    });

    // Xác nhận lại toàn vẹn FK trước khi commit — nếu rebuild lỡ làm sai
    // (VD sót FK) thì phát hiện ngay ở đây thay vì âm thầm để lại dữ liệu
    // hỏng. Chỉ chặn khi có vi phạm MỚI so với baseline trước rebuild (xem
    // comment ở trên).
    const afterViolations = ((await db.raw("PRAGMA foreign_key_check")) as any[]).map(violationKey).sort();
    const newViolations = afterViolations.filter((v) => !beforeViolations.includes(v));
    if (newViolations.length > 0) {
      throw new Error(
        `Rebuild bảng ${table} (xóa mềm) làm sai lệch khóa ngoại mới phát sinh: ${JSON.stringify(newViolations)}`,
      );
    }

    await db.raw("COMMIT");
  } catch (err) {
    await db.raw("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await db.raw("PRAGMA foreign_keys = ON");
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

// Xóa mềm cho 3 bảng CSKH — không có UNIQUE riêng nên chỉ cần thêm cột
// (xem comment đầy đủ ở migrateSoftDeleteCore).
export async function migrateSoftDeleteCskh(): Promise<void> {
  for (const t of ["incidents", "tickets", "creation_rates"]) {
    if (!(await db.schema.hasColumn(t, "is_deleted"))) {
      await db.schema.alterTable(t, (table) => {
        table.boolean("is_deleted").notNullable().defaultTo(false);
        table.dateTime("deleted_at");
      });
    }
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

// danh_gia_records.ghi_chu — cột "Ghi chú" ở tab Đánh giá (Team & Nhân sự):
// nhập cùng lúc với Ranking (so_thu_tu) ở popup "+ Thêm Đánh giá"/"Sửa",
// hiển thị thêm ở bảng dữ liệu Đánh giá. Chỉ là text tự do, không dùng
// trong bất kỳ công thức tính điểm/ranking nào.
export async function migrateDanhGiaGhiChu(): Promise<void> {
  if (!(await db.schema.hasColumn("danh_gia_records", "ghi_chu"))) {
    await db.schema.alterTable("danh_gia_records", (table) => {
      table.text("ghi_chu");
    });
  }
}

// Xóa mềm cho 6 bảng "record theo tháng" ở trang Team & Nhân sự.
// noiquy_overrides(period_id,member_name) và danh_gia_records(period_id,
// member_id) có UNIQUE riêng -> đổi sang filtered unique index (chỉ áp
// dụng dòng chưa xóa); 4 bảng còn lại không có UNIQUE nên chỉ cần thêm cột
// (xem comment đầy đủ ở migrateSoftDeleteCore).
export async function migrateSoftDeleteTeamRecords(): Promise<void> {
  for (const t of ["compliance_records", "training_records", "attendance_records", "support_records"]) {
    await ensureSoftDeleteColumns(t);
  }
  await ensureSoftDeleteColumns("noiquy_overrides");
  await ensureFilteredUniqueIndex(
    "noiquy_overrides",
    ["period_id", "member_name"],
    "noiquy_overrides_period_member_active_unique",
  );
  await ensureSoftDeleteColumns("danh_gia_records");
  await ensureFilteredUniqueIndex(
    "danh_gia_records",
    ["period_id", "member_id"],
    "danh_gia_records_period_member_active_unique",
  );
}
