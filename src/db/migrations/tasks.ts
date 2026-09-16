import { db } from "../connection.js";

// Cột bổ sung cho tasks: lịch sử chấm điểm khi task được kéo qua nhiều
// tháng backlog.
export async function migrateTaskGradingExtras(): Promise<void> {
  // tasks: thời điểm chấm điểm + snapshot đánh giá của tháng trước (giữ lại
  // khi task được chuyển sang tháng sau để user biết tháng trước chấm bao
  // nhiêu, đồng thời reset đánh giá cho tháng mới).
  if (!(await db.schema.hasColumn("tasks", "cpo_graded_at"))) {
    await db.schema.alterTable("tasks", (table) => {
      table.string("cpo_graded_at", 50);
      table.integer("prev_cpo_danh_gia");
      table.text("prev_cpo_comment");
      table.string("prev_cpo_graded_at", 50);
    });
  }
  // grading_history: JSON array các lần đánh giá của những THÁNG TRƯỚC (khi
  // task được kéo qua nhiều tháng). Tháng hiện tại vẫn nằm ở cpo_* trực tiếp.
  if (!(await db.schema.hasColumn("tasks", "grading_history"))) {
    await db.schema.alterTable("tasks", (table) => {
      table.text("grading_history");
    });
  }
}

// 29-30. task_members — nhân sự tham gia 1 task ở Backlog (VD 1 task dự án
// phần mềm có nhiều người cùng làm). "Vai trò" KHÔNG có danh mục riêng —
// lấy thẳng theo Chức vụ đã khai báo sẵn cho nhân sự đó ở Team & Nhân sự
// (join qua members.chuc_vu khi đọc), nên 1 nhân sự chỉ gán 1 lần / task.
export async function migrateTaskMembersTables(): Promise<void> {
  if (!(await db.schema.hasTable("task_members"))) {
    await db.schema.createTable("task_members", (table) => {
      table.increments("id").primary();
      table.integer("task_id").notNullable().references("id").inTable("tasks").onDelete("CASCADE");
      table.integer("member_id").notNullable().references("id").inTable("members").onDelete("NO ACTION");
      table.text("ghi_chu");
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
      table.unique(["task_id", "member_id"]);
    });
  }

  // task_members.ty_le_dong_gop / diem_ca_nhan — phân bổ điểm % Đánh giá
  // của task cho từng nhân sự tham gia (chỉ áp dụng khi task đã được chấm
  // điểm). ty_le_dong_gop: % đóng góp (0-100), tổng theo task không được
  // vượt 100% (validate ở service). diem_ca_nhan: điểm cá nhân quy theo %
  // (0-100) — nếu để trống thì tự tính = % Đánh giá của task × tỷ lệ đóng
  // góp; nhập tay ở đây (kể cả gõ theo thang điểm 5, FE tự quy đổi sang %
  // trước khi lưu) để ghi đè khi cần chấm riêng cho người đó.
  if (!(await db.schema.hasColumn("task_members", "ty_le_dong_gop"))) {
    await db.schema.alterTable("task_members", (table) => {
      table.decimal("ty_le_dong_gop", 5, 2);
      table.decimal("diem_ca_nhan", 5, 2);
    });
  }

  // phan_loai_nhan_su_options — danh mục Phân loại nhân sự tham gia task
  // (Thực hiện chính / Hỗ trợ...), khác với danh mục Phân loại của
  // Task/Roadmap (NVKH/NVPS...) nên tách bảng riêng, tránh lẫn.
  if (!(await db.schema.hasTable("phan_loai_nhan_su_options"))) {
    await db.schema.createTable("phan_loai_nhan_su_options", (table) => {
      table.increments("id").primary();
      table.string("ten_phan_loai", 255).notNullable().unique();
      table.integer("thu_tu").notNullable().defaultTo(0);
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
    });
  }
  const phanLoaiNhanSuCountRes = await db("phan_loai_nhan_su_options").count({ c: "*" }).first();
  if (Number((phanLoaiNhanSuCountRes as any)?.c ?? 0) === 0) {
    const seed = ["Thực hiện chính", "Hỗ trợ"];
    for (let i = 0; i < seed.length; i++) {
      await db("phan_loai_nhan_su_options").insert({ ten_phan_loai: seed[i], thu_tu: i });
    }
  }

  // task_members.phan_loai — Phân loại nhân sự tham gia task (giá trị lấy
  // từ phan_loai_nhan_su_options ở trên, lưu dạng chuỗi tự do giống các
  // cột "Phân loại" khác trong hệ thống — không ràng buộc FK).
  if (!(await db.schema.hasColumn("task_members", "phan_loai"))) {
    await db.schema.alterTable("task_members", (table) => {
      table.string("phan_loai", 255);
    });
  }
}
