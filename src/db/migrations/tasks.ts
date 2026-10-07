import { db } from "../connection.js";
import { ensureSoftDeleteColumns, ensureFilteredUniqueIndex } from "./core.js";

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
  // cpo_graded_by / prev_cpo_graded_by — SNAPSHOT tên người vừa chấm điểm
  // (không JOIN sang users — user có thể bị xóa/đổi tên sau, lịch sử vẫn
  // phải giữ nguyên tên tại thời điểm chấm, giống user_name ở action_logs).
  // NULL khi SSO tắt (không có khái niệm "người đăng nhập" — xem
  // updateTaskHandler#task.controller.ts) hoặc task chưa từng được chấm.
  if (!(await db.schema.hasColumn("tasks", "cpo_graded_by"))) {
    await db.schema.alterTable("tasks", (table) => {
      table.string("cpo_graded_by", 255);
      table.string("prev_cpo_graded_by", 255);
    });
  }
}

// tasks.tien_do_history — lịch sử cột "Tiến độ" qua các tháng, dùng đúng cơ
// chế với grading_history ở trên: khi task được kéo qua tháng sau (NV tồn),
// nếu tháng nguồn có ghi Tiến độ thì snapshot vào đây rồi reset tien_do về
// rỗng cho tháng mới (xem moveTasksToNextMonth ở task.service.ts) — để ô
// Tiến độ luôn là ghi chú CỦA THÁNG ĐANG XEM, các tháng trước xem qua nút
// "Lịch sử" giống cột Nội dung đánh giá.
export async function migrateTaskTienDoHistory(): Promise<void> {
  if (!(await db.schema.hasColumn("tasks", "tien_do_history"))) {
    await db.schema.alterTable("tasks", (table) => {
      table.text("tien_do_history");
    });
  }
}

// tasks.dau_moi_phoi_hop — cột "Đầu mối phối hợp" ở bảng dữ liệu Backlog
// (đặt sau cột Trạng thái), nhập/sửa cùng lúc với Nhiệm vụ/DoD/Deadline ở
// dialog Thêm/Sửa task. Chỉ là text tự do (tên người/phòng ban phối hợp),
// không dùng trong công thức tính điểm nào.
export async function migrateTaskDauMoiPhoiHop(): Promise<void> {
  if (!(await db.schema.hasColumn("tasks", "dau_moi_phoi_hop"))) {
    await db.schema.alterTable("tasks", (table) => {
      table.string("dau_moi_phoi_hop", 255);
    });
  }
}

// tasks.moved_to_task_id — id của task bản sao được tạo ra lần GẦN NHẤT
// "Chuyển sang tháng sau". Trước đây chỉ có cờ da_chuyen_thang (boolean) để
// chặn chuyển trùng — nhưng nếu bản sao ở tháng sau bị xóa đi (xóa mềm hay
// xóa thật), bản gốc vẫn mắc kẹt với da_chuyen_thang=1, không chuyển lại
// được nữa dù bản sao không còn tồn tại. Thêm cột này để tại thời điểm
// chuyển, kiểm tra ĐÚNG bản sao đó còn sống hay không (xem
// moveTasksToNextMonth, task.service.ts) thay vì chỉ dựa vào cờ boolean.
//
// CHỦ Ý không khai báo FK (.references()) cho cột này — chỉ 1 integer
// thường: tasks tự tham chiếu chính nó (self-reference) nên THÊM CỘT KÈM
// FK sẽ buộc SQLite rebuild lại toàn bộ bảng tasks (ADD COLUMN có ràng
// buộc luôn cần rebuild) — lúc rebuild, SQLite validate lại TẤT CẢ FK sẵn
// có của bảng (period_id/department_id), và gặp thực tế: DB đang dùng có
// sẵn một số dòng mồ côi lịch sử (period_id trỏ tới period đã xóa từ trước
// — dữ liệu demo cũ, không liên quan đợt này) khiến rebuild báo lỗi
// "FOREIGN KEY constraint failed" dù dữ liệu mới thêm hoàn toàn hợp lệ.
// Không khai báo FK tránh được rebuild, chỉ ADD COLUMN đơn thuần (an toàn,
// không rebuild) — ứng dụng tự quản lý tính hợp lệ của cột này (chỉ gán
// trong moveTasksToNextMonth, chỉ đọc qua getTask() đã lọc is_deleted).
export async function migrateTaskMovedToTaskId(): Promise<void> {
  if (!(await db.schema.hasColumn("tasks", "moved_to_task_id"))) {
    await db.schema.alterTable("tasks", (table) => {
      table.integer("moved_to_task_id");
    });
  }
}

// tasks.thay_the_task_id — id task thay thế được tạo khi task này bị Hủy
// quá SỚM (chưa trôi qua 1/4 thời gian mục tiêu, từ đầu tháng backlog tới
// Deadline — xem computeElapsedFraction, task.service.ts): hủy sớm không
// bị phạt điểm, nhưng bắt buộc khai báo ngay 1 task thay thế mới cho hủy,
// id task thay thế lưu ở đây để truy vết. CHỦ Ý không khai báo FK — lý do
// y hệt moved_to_task_id ở trên (tự tham chiếu, tránh SQLite rebuild toàn
// bảng khi thêm cột kèm FK).
export async function migrateTaskThayTheTaskId(): Promise<void> {
  if (!(await db.schema.hasColumn("tasks", "thay_the_task_id"))) {
    await db.schema.alterTable("tasks", (table) => {
      table.integer("thay_the_task_id");
    });
  }
}

// tasks.thay_cho_task_id — CHIỀU NGƯỢC LẠI của thay_the_task_id ở trên: lưu
// trên chính task THAY THẾ, trỏ về id task GỐC đã bị hủy. Dùng để FE hiển
// thị "Thay thế cho nhiệm vụ đã hủy: ..." như 1 khối thông tin TÁCH BIỆT
// với DoD (không còn nhét chữ vào DoD nữa — xem updateTask, task.service.ts
// — DoD phải luôn là nội dung thật, sửa/xóa tự do). Không khai báo FK —
// cùng lý do tự tham chiếu như thay_the_task_id/moved_to_task_id.
export async function migrateTaskThayChoTaskId(): Promise<void> {
  if (!(await db.schema.hasColumn("tasks", "thay_cho_task_id"))) {
    await db.schema.alterTable("tasks", (table) => {
      table.integer("thay_cho_task_id");
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

  // task_members.noi_dung_cong_viec — mô tả cụ thể nhân sự này LÀM GÌ
  // trong task (khác Ghi chú — ghi_chu là ghi chú tự do chung chung, còn
  // cột này riêng cho nội dung công việc cụ thể được giao). Nhập cùng lúc
  // với Ghi chú ở khung "Thêm nhân sự", chỉ hiển thị (không sửa trực tiếp
  // trong bảng danh sách), giống hệt cơ chế ghi_chu.
  if (!(await db.schema.hasColumn("task_members", "noi_dung_cong_viec"))) {
    await db.schema.alterTable("task_members", (table) => {
      table.text("noi_dung_cong_viec");
    });
  }

  // task_members.can_xu_ly_gap — "Việc cần xử lý gấp", tick ở cột hành
  // động của bảng "Nhân sự tham gia" — CÙNG CƠ CHẾ với "Treo việc"
  // (task_items.treo_viec, xem taskItem.service.ts): bắt buộc nhập lý do
  // + tự ghi ngày đánh dấu, hiển thị note để dễ nhận biết.
  if (!(await db.schema.hasColumn("task_members", "can_xu_ly_gap"))) {
    await db.schema.alterTable("task_members", (table) => {
      table.boolean("can_xu_ly_gap").notNullable().defaultTo(false);
      table.text("can_xu_ly_gap_ly_do");
      table.string("can_xu_ly_gap_tu_ngay", 10);
    });
  }

  // task_members.da_xu_ly_gap_luc — ngày bấm "Đã xử lý" ở card đôn đốc
  // Trang chủ (mark_can_xu_ly_gap_resolved, xem taskMember.service.ts).
  // Cột RIÊNG, không nhét vào ghi_chu — trước đây note vào ghi_chu khiến
  // ô input 1 dòng bị tràn chữ, không đọc được (user phản hồi). Hiển thị
  // thành badge riêng ở cột hành động, cạnh checkbox "Việc cần xử lý gấp".
  if (!(await db.schema.hasColumn("task_members", "da_xu_ly_gap_luc"))) {
    await db.schema.alterTable("task_members", (table) => {
      table.string("da_xu_ly_gap_luc", 10);
    });
  }

  // task_members.tru_diem_luc — ngày bấm nút "Trừ điểm cá nhân" ở cột hành
  // động bảng "Nhân sự tham gia" (04-tasks.js). Mỗi dòng chỉ được trừ 1 lần:
  // cột khác null = đã dùng lượt trừ của dòng đó (nút bị thay bằng badge
  // "Đã trừ điểm"). Điểm bị trừ lưu thẳng vào diem_ca_nhan (ghi đè tay),
  // cột này chỉ giữ dấu "đã dùng" + ngày dùng để hiển thị.
  if (!(await db.schema.hasColumn("task_members", "tru_diem_luc"))) {
    await db.schema.alterTable("task_members", (table) => {
      table.string("tru_diem_luc", 10);
    });
  }

  // task_members.tru_diem_so_diem — số điểm đã trừ (hiện tại cố định 10) của
  // lượt "Trừ điểm cá nhân". Tách RIÊNG khỏi diem_ca_nhan: ↺ reset chỉ xóa
  // điểm nhập tay (diem_ca_nhan) về tự tính, KHÔNG xóa được điểm trừ — điểm
  // mặc định sau khi trừ = tự tính - tru_diem_so_diem (yêu cầu user: "chỉ
  // cho restart về điểm mặc định, còn điểm bị trừ do trừ điểm cá nhân không
  // restart được"). diem_ca_nhan khác null vẫn ghi đè lên cả hai (người dùng
  // chủ động nhập điểm cuối).
  if (!(await db.schema.hasColumn("task_members", "tru_diem_so_diem"))) {
    await db.schema.alterTable("task_members", (table) => {
      table.decimal("tru_diem_so_diem", 5, 2);
    });
    // Backfill: dòng đã trừ trước đó (tru_diem_luc set) — ghi nhận đủ số
    // điểm trừ. Với dòng mà diem_ca_nhan đang giữ giá trị SAU TRỪ (chưa bị
    // ↺ xóa), giữ nguyên diem_ca_nhan — không trừ đôi; tru_diem_so_diem chỉ
    // áp dụng lên nhánh "điểm mặc định" (diem_ca_nhan null).
    await db("task_members")
      .whereNotNull("tru_diem_luc")
      .whereNull("tru_diem_so_diem")
      .update({ tru_diem_so_diem: 10 });
  }

  // task_members.department_id — Quy tắc 9.2, suy trực tiếp từ department_id
  // của chính task (đáng tin cậy hơn suy qua team/member vì task luôn có
  // đúng 1 department_id cố định — xem departments.ts). Cần chạy sau
  // migrateDepartments() (tasks.department_id đã tồn tại).
  if (!(await db.schema.hasColumn("task_members", "department_id"))) {
    await db.schema.alterTable("task_members", (table) => {
      table.integer("department_id").references("id").inTable("departments").onDelete("NO ACTION").index();
    });
    const staleRows = await db("task_members").whereNull("department_id").select("id", "task_id");
    for (const row of staleRows) {
      const task = await db("tasks").where({ id: (row as any).task_id }).first();
      if (task) {
        await db("task_members")
          .where({ id: (row as any).id })
          .update({ department_id: (task as any).department_id ?? null });
      }
    }
  }
}

// Xóa mềm cho task_members — UNIQUE(task_id, member_id) đổi sang filtered
// unique index (chỉ áp dụng dòng chưa xóa), để gỡ 1 nhân sự khỏi task rồi
// gán lại không bị chặn (xem comment đầy đủ ở migrateSoftDeleteCore,
// core.ts).
export async function migrateSoftDeleteTaskMembers(): Promise<void> {
  await ensureSoftDeleteColumns("task_members");
  await ensureFilteredUniqueIndex("task_members", ["task_id", "member_id"], "task_members_task_member_active_unique");
}
