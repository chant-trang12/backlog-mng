import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../../data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "backlog.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS periods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    label TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (year, month)
  );

  -- Team gắn theo từng tháng backlog (period_id) — thêm/xóa ở tháng nào chỉ
  -- ảnh hưởng tháng đó; tháng mới tạo sẽ kế thừa danh sách team từ tháng gần
  -- nhất, giống nhân sự.
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (period_id, name)
  );

  -- Nhân sự gắn theo từng tháng backlog (period_id) — xóa/sửa ở tháng nào chỉ
  -- ảnh hưởng tháng đó; tháng mới tạo sẽ kế thừa danh sách từ tháng gần nhất.
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    chuc_vu TEXT,
    tuan_thu TEXT,
    noi_quy TEXT,
    dao_tao TEXT,
    ho_tro TEXT,
    danh_gia TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (period_id, team_id, name)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
    stt INTEGER NOT NULL,
    tinh_chat TEXT,
    khong_tinh_diem TEXT,
    tag TEXT,
    team TEXT NOT NULL,
    nhiem_vu TEXT NOT NULL,
    dod TEXT,
    ngay_thuc_hien TEXT,
    deadline TEXT,
    nvtt TEXT,
    phan_tram_hoan_thanh INTEGER NOT NULL DEFAULT 0,
    trang_thai TEXT NOT NULL DEFAULT 'Chưa thực hiện',
    tien_do TEXT,
    cpo_danh_gia INTEGER,
    cpo_comment TEXT,
    da_chuyen_thang INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_period ON tasks(period_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_team ON tasks(team);

  -- Trang CSKH: Sự cố, Hỗ trợ ticket, Tỉ lệ khởi tạo — theo team và theo tháng backlog.
  CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    su_co TEXT NOT NULL,
    tinh_chat TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    tong_ticket INTEGER NOT NULL DEFAULT 0,
    ticket_vuot INTEGER NOT NULL DEFAULT 0,
    dung_han INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS creation_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    so_luong_thanh_cong INTEGER NOT NULL DEFAULT 0,
    so_luong_that_bai INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migration cho DB đã tồn tại trước khi có cột chuc_vu (Chức vụ) ở members.
const memberColumns = new Set(
  (db.prepare(`PRAGMA table_info(members)`).all() as { name: string }[]).map((c) => c.name),
);
if (!memberColumns.has("chuc_vu")) {
  db.exec(`ALTER TABLE members ADD COLUMN chuc_vu TEXT`);
}

// Migration cho DB đã tồn tại trước khi có cột period_id ở members — trước đây
// nhân sự dùng chung cho mọi tháng nên xóa ở 1 tháng sẽ mất ở tất cả các tháng.
// Chuyển sang gắn theo period: nhân bản danh sách nhân sự hiện có sang từng
// tháng đã tồn tại để giữ nguyên trạng thái hiển thị, từ nay xóa/sửa ở tháng
// nào chỉ ảnh hưởng tháng đó.
if (!memberColumns.has("period_id")) {
  const existingPeriods = db
    .prepare(`SELECT id FROM periods ORDER BY year ASC, month ASC`)
    .all() as { id: number }[];

  db.exec(`ALTER TABLE members RENAME TO members_old`);
  db.exec(`
    CREATE TABLE members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      chuc_vu TEXT,
      tuan_thu TEXT,
      noi_quy TEXT,
      dao_tao TEXT,
      ho_tro TEXT,
      danh_gia TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (period_id, team_id, name)
    )
  `);

  const cloneInto = db.prepare(
    `INSERT INTO members (period_id, team_id, name, chuc_vu, created_at)
     SELECT ?, team_id, name, chuc_vu, created_at FROM members_old`,
  );
  for (const period of existingPeriods) {
    cloneInto.run(period.id);
  }

  db.exec(`DROP TABLE members_old`);
}

// Migration cho DB đã tồn tại trước khi có các cột Tuân thủ / Nội quy / Đào
// tạo / Hỗ trợ / Đánh giá ở bảng Nhân sự.
const memberColumnsAfterPeriod = new Set(
  (db.prepare(`PRAGMA table_info(members)`).all() as { name: string }[]).map((c) => c.name),
);
for (const col of ["tuan_thu", "noi_quy", "dao_tao", "ho_tro", "danh_gia"]) {
  if (!memberColumnsAfterPeriod.has(col)) {
    db.exec(`ALTER TABLE members ADD COLUMN ${col} TEXT`);
  }
}

// Migration cho DB đã tồn tại trước khi có cột khong_tinh_diem (cột "Tính
// chất" mới — đánh dấu "Không tính điểm" cho task, tách biệt với cột "Phân
// loại" cũ vốn tên là tinh_chat).
const taskColumns = new Set(
  (db.prepare(`PRAGMA table_info(tasks)`).all() as { name: string }[]).map((c) => c.name),
);
if (!taskColumns.has("khong_tinh_diem")) {
  db.exec(`ALTER TABLE tasks ADD COLUMN khong_tinh_diem TEXT`);
}

// Migration cho DB đã tồn tại trước khi có cột tag (nhãn phân loại nhiệm vụ,
// hiển thị ở cột Tag ngay sau STT).
if (!taskColumns.has("tag")) {
  db.exec(`ALTER TABLE tasks ADD COLUMN tag TEXT`);
}

// Migration cho DB đã tồn tại trước khi có cột da_chuyen_thang — đánh dấu
// task gốc đã được chuyển sang tháng sau 1 lần rồi, chặn không cho chuyển
// tiếp lần nữa (mỗi task chỉ chuyển được đúng 1 lần).
if (!taskColumns.has("da_chuyen_thang")) {
  db.exec(`ALTER TABLE tasks ADD COLUMN da_chuyen_thang INTEGER NOT NULL DEFAULT 0`);
}

// Migration cho DB đã tồn tại trước khi có cột period_id (Tháng) ở 3 bảng CSKH.
// Dữ liệu CSKH cũ (nếu có) chưa gắn tháng nên không thể migrate hợp lệ — xóa và
// tạo lại bảng theo schema mới, người dùng nhập lại (dữ liệu CSKH còn ít/mới).
for (const table of ["incidents", "tickets", "creation_rates"]) {
  const columns = new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name),
  );
  if (columns.size > 0 && !columns.has("period_id")) {
    db.exec(`DROP TABLE ${table}`);
  }
}
db.exec(`
  CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    su_co TEXT NOT NULL,
    tinh_chat TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    tong_ticket INTEGER NOT NULL DEFAULT 0,
    ticket_vuot INTEGER NOT NULL DEFAULT 0,
    dung_han INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS creation_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    so_luong_thanh_cong INTEGER NOT NULL DEFAULT 0,
    so_luong_that_bai INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Trang Team & Nhân sự, tab Tuân thủ — vi phạm quy trình/kế hoạch chung của
// từng nhân sự theo tháng theo dõi (period_id).
db.exec(`
  CREATE TABLE IF NOT EXISTS compliance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    vi_pham INTEGER NOT NULL DEFAULT 0,
    noi_dung TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Trang Team & Nhân sự, tab Đào tạo nội bộ và Chứng chỉ quốc tế — từng đợt
// đào tạo/chứng chỉ của nhân sự theo tháng theo dõi (period_id).
db.exec(`
  CREATE TABLE IF NOT EXISTS training_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    loai TEXT,
    ngay_thuc_hien TEXT,
    nguoi_xac_nhan TEXT,
    noi_dung TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migration: đổi schema training_records — bỏ ten_dao_tao (nhập tự do), thay
// bằng loai (Đào tạo / Chứng chỉ QT, chọn từ list) + noi_dung (textarea).
// Bảng vừa tạo gần đây, chưa có dữ liệu thật ở schema cũ nên xóa và tạo lại.
const trainingColumns = new Set(
  (db.prepare(`PRAGMA table_info(training_records)`).all() as { name: string }[]).map((c) => c.name),
);
if (!trainingColumns.has("loai")) {
  db.exec(`DROP TABLE training_records`);
  db.exec(`
    CREATE TABLE training_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      loai TEXT,
      ngay_thuc_hien TEXT,
      nguoi_xac_nhan TEXT,
      noi_dung TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

// Trang Team & Nhân sự, tab Chấm công — import file Excel, lưu mỗi dòng dạng
// JSON (row_data) vì cột động theo file người dùng tải lên, không cố định
// schema. Mỗi lần import mới sẽ thay thế toàn bộ dữ liệu Chấm công của đúng
// tháng theo dõi (period_id) đó.
db.exec(`
  CREATE TABLE IF NOT EXISTS attendance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
    row_index INTEGER NOT NULL,
    row_data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// "Không tính công" ở tab Chấm công — đánh dấu 1 dòng Chấm công không được
// tính vào Lượt đi muộn ở tab Nội quy nữa, không xóa dữ liệu gốc.
{
  const columns = new Set(
    (db.prepare(`PRAGMA table_info(attendance_records)`).all() as { name: string }[]).map((c) => c.name),
  );
  if (!columns.has("excluded_from_late")) {
    db.exec(`ALTER TABLE attendance_records ADD COLUMN excluded_from_late INTEGER NOT NULL DEFAULT 0`);
  }
}

// "Không tính công" ở tab Nội quy — ép Lượt đi muộn/Total của 1 nhân sự
// trong 1 tháng theo dõi về 0, tách biệt với cờ excluded_from_late ở
// attendance_records (đánh dấu theo cả người, không phải theo từng dòng).
db.exec(`
  CREATE TABLE IF NOT EXISTS noiquy_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
    member_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(period_id, member_name)
  );
`);

// Trang Team & Nhân sự, tab Hỗ trợ — nhân sự (và team của nhân sự đó = team
// thực hiện hỗ trợ) hỗ trợ cho 1 team khác (team_nhan_ho_tro_id) theo tháng
// theo dõi (period_id).
db.exec(`
  CREATE TABLE IF NOT EXISTS support_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    team_nhan_ho_tro_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    noi_dung TEXT,
    ngay_ho_tro TEXT,
    nguoi_xac_nhan TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Trang Team & Nhân sự, tab Đánh giá — thêm theo cả 1 team cùng lúc (chọn
// team, nhập Số thứ tự cho từng nhân sự trong team đó). 1 nhân sự chỉ có
// đúng 1 bản ghi Đánh giá / tháng theo dõi (UNIQUE period_id + member_id) —
// bấm "+ Thêm Đánh giá" lại cho cùng team sẽ cập nhật (upsert), không tạo
// trùng; sửa/xóa từng dòng thực hiện ngoài bảng.
db.exec(`
  CREATE TABLE IF NOT EXISTS danh_gia_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    so_thu_tu INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(period_id, member_id)
  );
`);

// Migration cho DB đã tồn tại trước khi có cột period_id ở teams — trước đây
// team dùng chung cho mọi tháng nên thêm team mới ở tháng nào cũng hiện ra ở
// TẤT CẢ các tháng khác (kể cả tháng cũ đã qua). Chuyển sang gắn theo period,
// giống nhân sự: nhân bản toàn bộ team hiện có sang từng tháng đã tồn tại để
// giữ nguyên đúng trạng thái hiển thị hiện tại (không tháng nào bị mất team),
// nhưng từ nay thêm/xóa team ở tháng nào chỉ ảnh hưởng tháng đó trở đi — team
// mới thêm sẽ không xuất hiện ngược ở các tháng đã tạo trước đó, chỉ được kế
// thừa vào các tháng MỚI tạo sau này (qua cloneTeamsFromPeriod khi tạo period).
{
  const teamColumns = new Set(
    (db.prepare(`PRAGMA table_info(teams)`).all() as { name: string }[]).map((c) => c.name),
  );
  if (!teamColumns.has("period_id")) {
    db.pragma("foreign_keys = OFF");
    // Mặc định SQLite tự viết lại mọi "REFERENCES teams(...)" ở các bảng
    // khác thành "REFERENCES teams_old(...)" khi rename teams -> teams_old
    // (kể cả khi teams_old bị DROP sau đó) — để lại tham chiếu treo, khiến
    // các câu lệnh sau này trên members/incidents/tickets/creation_rates/
    // support_records báo lỗi "no such table: teams_old". Tắt hành vi tự
    // viết lại này trước khi rename.
    db.pragma("legacy_alter_table = ON");
    const migrateTeams = db.transaction(() => {
      const existingPeriods = db.prepare(`SELECT id FROM periods ORDER BY year ASC, month ASC`).all() as {
        id: number;
      }[];
      const oldTeams = db.prepare(`SELECT id, name, created_at FROM teams`).all() as {
        id: number;
        name: string;
        created_at: string;
      }[];

      db.exec(`ALTER TABLE teams RENAME TO teams_old`);
      db.exec(`
        CREATE TABLE teams (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (period_id, name)
        )
      `);

      const insertTeam = db.prepare(
        `INSERT INTO teams (period_id, name, created_at) VALUES (?, ?, ?) RETURNING id`,
      );
      // periodId -> (tên team -> id mới) — dùng để remap các bảng con còn
      // tham chiếu team_id theo id cũ (members/incidents/tickets/
      // creation_rates/support_records.team_nhan_ho_tro_id).
      const idMapByPeriod = new Map<number, Map<string, number>>();
      for (const period of existingPeriods) {
        const nameToNewId = new Map<string, number>();
        for (const t of oldTeams) {
          const row = insertTeam.get(period.id, t.name, t.created_at) as { id: number };
          nameToNewId.set(t.name, row.id);
        }
        idMapByPeriod.set(period.id, nameToNewId);
      }

      const oldIdToName = new Map(oldTeams.map((t) => [t.id, t.name]));

      function remapTeamId(table: string, column: string) {
        const tableExists = db
          .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
          .get(table);
        if (!tableExists) return;
        const rows = db.prepare(`SELECT id, period_id, ${column} AS old_team_id FROM ${table}`).all() as {
          id: number;
          period_id: number;
          old_team_id: number;
        }[];
        const update = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`);
        for (const row of rows) {
          const teamName = oldIdToName.get(row.old_team_id);
          if (!teamName) continue;
          const newTeamId = idMapByPeriod.get(row.period_id)?.get(teamName);
          if (newTeamId) update.run(newTeamId, row.id);
        }
      }

      remapTeamId("members", "team_id");
      remapTeamId("incidents", "team_id");
      remapTeamId("tickets", "team_id");
      remapTeamId("creation_rates", "team_id");
      remapTeamId("support_records", "team_nhan_ho_tro_id");

      db.exec(`DROP TABLE teams_old`);
    });
    migrateTeams();
    db.pragma("legacy_alter_table = OFF");
    db.pragma("foreign_keys = ON");
  }
}

// Trang Cấu hình, tab Tiêu chí — cấu hình tiêu chí + công thức tính điểm cho
// team, DÙNG CHUNG cho mọi tháng backlog (không gắn period_id). Điểm chuẩn /
// chỉ tiêu lưu theo team_name (không phải team_id) vì team giờ gắn theo
// period — khớp theo tên với danh sách team của tháng đang xem.
db.exec(`
  CREATE TABLE IF NOT EXISTS tieu_chi_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nhom TEXT NOT NULL,
    ten_tieu_chi TEXT NOT NULL,
    cach_tinh_diem TEXT,
    co_chi_tieu INTEGER NOT NULL DEFAULT 0,
    thu_tu INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tieu_chi_diem_chuan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tieu_chi_id INTEGER NOT NULL REFERENCES tieu_chi_configs(id) ON DELETE CASCADE,
    team_name TEXT NOT NULL,
    diem_chuan TEXT,
    chi_tieu TEXT,
    UNIQUE (tieu_chi_id, team_name)
  );

`);

// Trang Cấu hình, tab Ranking team — bảng cấu hình tự do: hàng = vị trí xếp
// hạng (vi_tri), cột = các kịch bản xếp hạng (VD "Rank", "Rank gần cuối",
// "Rank cuối"), ô = giá trị (VD A/B/C). Cho phép thêm/xóa cả hàng và cột.
db.exec(`
  CREATE TABLE IF NOT EXISTS ranking_rows (
    vi_tri INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ranking_columns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_cot TEXT NOT NULL UNIQUE,
    thu_tu INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS ranking_cells (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vi_tri INTEGER NOT NULL REFERENCES ranking_rows(vi_tri) ON DELETE CASCADE,
    column_id INTEGER NOT NULL REFERENCES ranking_columns(id) ON DELETE CASCADE,
    gia_tri TEXT,
    UNIQUE (vi_tri, column_id)
  );
`);

// Trang Cấu hình, tab Tag & Phân loại — danh mục Tag và Phân loại dùng ở form
// nhập task Backlog, DÙNG CHUNG cho mọi tháng backlog (không gắn period_id),
// giống tieu_chi_configs/ranking_columns.
db.exec(`
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_tag TEXT NOT NULL UNIQUE,
    thu_tu INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS phan_loai_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_phan_loai TEXT NOT NULL UNIQUE,
    thu_tu INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS nhom_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_nhom TEXT NOT NULL UNIQUE,
    thu_tu INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chuc_vu_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_chuc_vu TEXT NOT NULL UNIQUE,
    thu_tu INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Seed danh mục Tag/Phân loại từ danh sách vốn cố định cứng ở frontend trước
// đây — chỉ chạy 1 lần khi bảng còn rỗng, giữ đúng thứ tự cũ để không đổi
// màu badge của các task đã có sẵn.
{
  const tagCount = (db.prepare(`SELECT COUNT(*) AS c FROM tags`).get() as { c: number }).c;
  if (tagCount === 0) {
    const insertTag = db.prepare(`INSERT INTO tags (ten_tag, thu_tu) VALUES (?, ?)`);
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
    seedTags.forEach((ten, i) => insertTag.run(ten, i));
  }

  const phanLoaiCount = (db.prepare(`SELECT COUNT(*) AS c FROM phan_loai_options`).get() as { c: number }).c;
  if (phanLoaiCount === 0) {
    const insertPhanLoai = db.prepare(`INSERT INTO phan_loai_options (ten_phan_loai, thu_tu) VALUES (?, ?)`);
    const seedPhanLoai = ["NVKH", "NVPS", "NVTT", "NV được giao từ BGĐ"];
    seedPhanLoai.forEach((ten, i) => insertPhanLoai.run(ten, i));
  }

  // Seed danh mục Nhóm từ chính các giá trị "nhom" đang có trong
  // tieu_chi_configs (không hardcode) — giữ đúng dữ liệu thật đã cấu hình,
  // theo thứ tự xuất hiện lần đầu (MIN(id)).
  const nhomCount = (db.prepare(`SELECT COUNT(*) AS c FROM nhom_options`).get() as { c: number }).c;
  if (nhomCount === 0) {
    const existingNhom = db
      .prepare(`SELECT nhom FROM tieu_chi_configs GROUP BY nhom ORDER BY MIN(id) ASC`)
      .all() as { nhom: string }[];
    const insertNhom = db.prepare(`INSERT INTO nhom_options (ten_nhom, thu_tu) VALUES (?, ?)`);
    existingNhom.forEach((row, i) => insertNhom.run(row.nhom, i));
  }

  const chucVuCount = (db.prepare(`SELECT COUNT(*) AS c FROM chuc_vu_options`).get() as { c: number }).c;
  if (chucVuCount === 0) {
    const insertChucVu = db.prepare(`INSERT INTO chuc_vu_options (ten_chuc_vu, thu_tu) VALUES (?, ?)`);
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
    seedChucVu.forEach((ten, i) => insertChucVu.run(ten, i));
  }
}
