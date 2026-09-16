import { db } from "../connection.js";

// 23. departments — tầng "Phòng" trên team, cùng mọi cột/backfill liên quan
// ở các bảng khác (teams/tasks/tieu_chi_configs). Phải chạy SAU
// migrateCoreTables + migrateScoringTables (cần bảng teams/tasks/
// tieu_chi_configs tồn tại sẵn để thêm cột department_id + backfill).
export async function migrateDepartments(): Promise<void> {
  // departments — tầng "Phòng" trên team. Mỗi phòng có nhiều team; team
  // (và qua đó nhân sự, task, CSKH...) thuộc đúng 1 phòng. Period vẫn dùng
  // chung mọi phòng.
  const hasDepartments = await db.schema.hasTable("departments");
  if (!hasDepartments) {
    await db.schema.createTable("departments", (table) => {
      table.increments("id").primary();
      table.string("name", 255).notNullable().unique();
      table.string("code", 50);
      table.integer("thu_tu").notNullable().defaultTo(0);
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
    });
  }

  // Seed 1 phòng mặc định (dữ liệu cũ nếu có sẽ gán vào phòng này).
  const deptCountRes = await db("departments").count({ c: "*" }).first();
  if (Number((deptCountRes as any)?.c ?? 0) === 0) {
    await db("departments").insert([
      { name: "Phòng Công nghệ thông tin", code: "CNTT", thu_tu: 0 },
      { name: "Phòng Vận hành", code: "VH", thu_tu: 1 },
    ]);
  }

  // departments.dung_tieu_chi_chung — phòng này có dùng chung danh mục
  // Tiêu chí (department_id NULL, xem bên dưới) không, hay CHỈ dùng đúng
  // tiêu chí riêng của mình. Mặc định bật (true) để hành vi cũ không đổi.
  if (!(await db.schema.hasColumn("departments", "dung_tieu_chi_chung"))) {
    await db.schema.alterTable("departments", (table) => {
      table.integer("dung_tieu_chi_chung").notNullable().defaultTo(1);
    });
  }

  // departments.cach_tinh_kpi — 1 số phòng ban không tổ chức KPI theo team
  // (VD team quá nhỏ/lẻ, hoặc nhân sự làm việc xuyên team theo từng task)
  // nên tab "Tổng hợp"/"Ranking" theo Team (dựa vào Tiêu chí + team_name)
  // không phù hợp. "theo_task" chuyển sang tính KPI trực tiếp theo từng
  // NHÂN SỰ, cộng dồn Điểm cá nhân từ mọi task họ tham gia trong tháng
  // (xem task_members — dialog "Nhân sự tham gia" của Backlog), không cần
  // chia theo team. Mặc định "theo_team" — hành vi cũ không đổi.
  if (!(await db.schema.hasColumn("departments", "cach_tinh_kpi"))) {
    await db.schema.alterTable("departments", (table) => {
      table.string("cach_tinh_kpi", 20).notNullable().defaultTo("theo_team");
    });
  }

  const firstDept = await db("departments").orderBy("thu_tu", "asc").first();
  const firstDeptId = Number((firstDept as any)?.id ?? 1);

  // teams.department_id — thêm cột nếu chưa có, backfill dữ liệu cũ về phòng
  // đầu tiên.
  if (!(await db.schema.hasColumn("teams", "department_id"))) {
    await db.schema.alterTable("teams", (table) => {
      table.integer("department_id").references("id").inTable("departments").onDelete("NO ACTION");
    });
    await db("teams").whereNull("department_id").update({ department_id: firstDeptId });
  }

  // tasks.department_id — tương tự. Backfill: khớp tasks.team (chuỗi) với
  // team cùng period để lấy phòng; không khớp thì về phòng đầu tiên.
  if (!(await db.schema.hasColumn("tasks", "department_id"))) {
    await db.schema.alterTable("tasks", (table) => {
      table.integer("department_id").references("id").inTable("departments").onDelete("NO ACTION");
    });
    const staleTasks = await db("tasks").whereNull("department_id").select("id", "period_id", "team");
    for (const t of staleTasks) {
      const team = await db("teams")
        .where({ period_id: (t as any).period_id, name: (t as any).team })
        .first();
      await db("tasks")
        .where({ id: (t as any).id })
        .update({ department_id: Number((team as any)?.department_id ?? firstDeptId) });
    }
  }

  // tieu_chi_configs.department_id — NULL = tiêu chí DÙNG CHUNG cho mọi
  // phòng (giữ nguyên hành vi cũ: toàn bộ tiêu chí có sẵn đều để NULL khi
  // thêm cột này, không phòng nào bị mất tiêu chí đang dùng); có giá trị =
  // tiêu chí RIÊNG của đúng 1 phòng đó. 1 phòng "thấy" được: tiêu chí dùng
  // chung (nếu departments.dung_tieu_chi_chung = true) + tiêu chí riêng
  // của chính phòng đó — xem listTieuChiConfigs() ở tieuchi.service.ts.
  if (!(await db.schema.hasColumn("tieu_chi_configs", "department_id"))) {
    await db.schema.alterTable("tieu_chi_configs", (table) => {
      table.integer("department_id").references("id").inTable("departments").onDelete("CASCADE");
    });
  }

  // tieu_chi_configs.kieu_tinh / nguon_du_lieu / he_so — trước đây công
  // thức tính "Tổng điểm" ở tab Tổng hợp hard-code cứng theo ĐÚNG TÊN của
  // vài tiêu chí cố định trong code (homeComputeTeamScores ở app.js) — đổi
  // tên/xóa tiêu chí đó (VD phòng ban dùng bộ tiêu chí khác hẳn) là Tổng
  // điểm ra sai/rỗng. 3 cột này đưa công thức đó thành DỮ LIỆU cấu hình
  // được trên giao diện (dialog Tiêu chí), không cần sửa code nữa:
  // - kieu_tinh: 1 trong các kiểu tính đã hỗ trợ sẵn (không phải công thức
  //   tự do) — xem TIEU_CHI_KIEU_TINH ở app.js để biết danh sách + ý nghĩa.
  // - nguon_du_lieu: nguồn số liệu thực tế dùng cho kiểu tính đó (VD tỷ lệ
  //   hoàn thành nhiệm vụ, SL sự cố CSKH, số dòng khai báo Hỗ trợ...).
  // - he_so: tham số đi kèm (VD % trừ mỗi lỗi, hệ số chia số dòng khai báo).
  // Mặc định "khong_tinh" — tiêu chí thuần thông tin, không cộng vào Tổng
  // điểm (giữ đúng hành vi cũ cho tiêu chí chưa từng được tính vào).
  if (!(await db.schema.hasColumn("tieu_chi_configs", "kieu_tinh"))) {
    await db.schema.alterTable("tieu_chi_configs", (table) => {
      table.string("kieu_tinh", 50).notNullable().defaultTo("khong_tinh");
      table.string("nguon_du_lieu", 50);
      table.decimal("he_so", 10, 4);
    });

    // Backfill: nếu deployment này đã có sẵn tiêu chí trùng ĐÚNG tên với
    // công thức cũ hard-code trong app.js, gán đúng kiểu tính tương ứng để
    // Tổng điểm KHÔNG đổi so với trước (không phá dữ liệu/điểm đang có).
    // Không có tiêu chí nào trùng tên (cài đặt mới, hoặc phòng đã đổi tên)
    // thì các UPDATE này chỉ đơn giản không khớp dòng nào, vô hại.
    const backfill: { name: string; kieuTinh: string; nguon: string; heSo: number | null }[] = [
      { name: "Tiến độ hoàn thành Sprint goal", kieuTinh: "ty_le_x_diem_chuan", nguon: "ty_le_hoan_thanh_nhiem_vu", heSo: null },
      {
        name: "Số lượng sự cố mức độ ảnh hưởng nghiêm trọng đến khách hàng",
        kieuTinh: "tru_theo_loi",
        nguon: "so_luong_su_co",
        heSo: 0.1,
      },
      { name: "Tỷ lệ xử lý yêu cầu hỗ trợ đúng hạn", kieuTinh: "ty_le_chia_chi_tieu_x_diem_chuan", nguon: "ty_le_xu_ly_ticket", heSo: null },
      { name: "Tỷ lệ khởi tạo dịch vụ thành công đúng hạn", kieuTinh: "ty_le_chia_chi_tieu_x_diem_chuan", nguon: "ty_le_khoi_tao", heSo: null },
      { name: "Thực hiện theo quy trình, kế hoạch chung", kieuTinh: "dem_dong_tru", nguon: "dem_tuan_thu", heSo: 2 },
      {
        name: "Tuân thủ nội quy quy định công ty  (đi muộn/về sớm; trang phục; nề nếp nội vụ; hội họp giao ban…)",
        kieuTinh: "dem_dong_tru",
        nguon: "dem_noi_quy",
        heSo: 2,
      },
      { name: "Hỗ trợ, phối hợp", kieuTinh: "dem_dong_cong", nguon: "dem_ho_tro", heSo: 2 },
      { name: "Đào tạo và phát triển đội nhóm", kieuTinh: "dem_dong_cong", nguon: "dem_dao_tao", heSo: 2 },
    ];
    for (const b of backfill) {
      await db("tieu_chi_configs")
        .where({ ten_tieu_chi: b.name })
        .update({ kieu_tinh: b.kieuTinh, nguon_du_lieu: b.nguon, he_so: b.heSo });
    }
  }
}
