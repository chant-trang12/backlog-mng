import { db } from "../db/database.js";
import type {
  CanXuLyGapRow,
  CreateTaskMemberInput,
  KpiTheoTaskRow,
  TaskMemberWithName,
  UpdateTaskMemberInput,
} from "../types/backlog.js";
import { assertDepartmentInScope, departmentIdFromTaskId, type DataScope } from "./scope.util.js";
import { softDeleteWhere } from "./softDelete.util.js";

const SELECT_COLUMNS = [
  "task_members.id",
  "task_members.task_id",
  "task_members.member_id",
  "task_members.ty_le_dong_gop",
  "task_members.diem_ca_nhan",
  "task_members.phan_loai",
  "task_members.noi_dung_cong_viec",
  "task_members.ghi_chu",
  "task_members.can_xu_ly_gap",
  "task_members.can_xu_ly_gap_ly_do",
  "task_members.can_xu_ly_gap_tu_ngay",
  "task_members.da_xu_ly_gap_luc",
  "task_members.tru_diem_luc",
  "task_members.tru_diem_so_diem",
  "task_members.created_at",
  "task_members.updated_at",
  "members.name as member_name",
  "members.chuc_vu as member_chuc_vu",
];

// Danh sách nhân sự tham gia 1 task, kèm tên + chức vụ (join members) để FE
// hiển thị trực tiếp — sắp theo thời điểm gán (id tăng dần). "Vai trò" hiển
// thị ở FE chính là member_chuc_vu — không có danh mục riêng, lấy thẳng
// theo Chức vụ đã khai báo sẵn cho nhân sự đó ở Team & Nhân sự.
export async function listTaskMembers(taskId: number): Promise<TaskMemberWithName[]> {
  const rows = await db("task_members")
    .join("members", "task_members.member_id", "members.id")
    .where({ task_id: taskId, "task_members.is_deleted": false })
    .select(SELECT_COLUMNS)
    .orderBy("task_members.id", "asc");

  // Tổng Giờ công/MD = SUM(gio_cong) của người đó trên TẤT CẢ Việc (task_items)
  // của CHÍNH task này — cộng dồn qua các Việc khác nhau, MD = Hours/8 (cố
  // định, giống tasks.service.ts/taskItem.service.ts). Hiển thị ở bảng
  // "Nhân sự tham gia" để thấy ngay khối lượng thật, không cần mở từng Việc.
  const hoursByMember = await db("task_item_members as tim")
    .join("task_items as ti", "tim.task_item_id", "ti.id")
    .where("ti.task_id", taskId)
    .where("ti.is_deleted", false)
    .where("tim.is_deleted", false)
    .groupBy("tim.member_id")
    .select("tim.member_id")
    .sum({ tong_gio_cong: "tim.gio_cong" });
  const hoursMap = new Map<number, number>(
    hoursByMember.map((r: any) => [Number(r.member_id), Number(r.tong_gio_cong) || 0]),
  );

  return rows.map((r: any) => {
    const tongGioCong = hoursMap.get(r.member_id) ?? 0;
    return {
      ...r,
      can_xu_ly_gap: !!r.can_xu_ly_gap,
      tong_gio_cong: Math.round(tongGioCong * 100) / 100,
      tong_md: Math.round((tongGioCong / 8) * 100) / 100,
    };
  }) as TaskMemberWithName[];
}

export async function getTaskMember(id: number): Promise<TaskMemberWithName | undefined> {
  const row = await db("task_members")
    .join("members", "task_members.member_id", "members.id")
    .where({ "task_members.id": id, "task_members.is_deleted": false })
    .select(SELECT_COLUMNS)
    .first();
  return row ? ({ ...row, can_xu_ly_gap: !!row.can_xu_ly_gap } as TaskMemberWithName) : undefined;
}

// "YYYY-MM-DD" theo giờ local — dùng cho can_xu_ly_gap_tu_ngay (giống
// treo_viec_tu_ngay ở taskItem.service.ts).
function todayDateString(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// undefined -> giữ nguyên giá trị cũ, null -> xóa (về "— Không —"), chuỗi
// -> trim rồi lưu (rỗng cũng thành null).
function normalizeNullableText(
  value: string | null | undefined,
  existing: string | null,
): string | null {
  if (value === undefined) return existing;
  if (value === null) return null;
  return value.trim() || null;
}

// Tổng % đã phân bổ cho task (trừ chính dòng đang sửa, nếu có) không được
// vượt 100 — dung sai nhỏ (0.01) để tránh lỗi làm tròn số thực.
async function assertContributionWithinLimit(
  taskId: number,
  excludeId: number | null,
  newValue: number,
): Promise<void> {
  if (!Number.isFinite(newValue) || newValue < 0 || newValue > 100) {
    throw new Error("Tỷ lệ đóng góp phải là số trong khoảng 0-100%");
  }
  const query = db("task_members")
    .where({ task_id: taskId, is_deleted: false })
    .whereNotNull("ty_le_dong_gop");
  if (excludeId != null) query.whereNot({ id: excludeId });
  const rows = await query.select("ty_le_dong_gop");
  const othersSum = rows.reduce((s, r: any) => s + Number(r.ty_le_dong_gop), 0);
  const total = othersSum + newValue;
  if (total > 100.01) {
    const remaining = Math.max(0, Math.round((100 - othersSum) * 100) / 100);
    throw new Error(
      `Tổng tỷ lệ đóng góp của task này sẽ vượt quá 100% (đã phân bổ ${othersSum}%, chỉ còn ${remaining}% để chia).`,
    );
  }
}

// Gán 1 nhân sự vào task — idempotent theo (task_id, member_id): gán lại
// nhân sự đã có sẽ trả về dòng cũ (chỉ cập nhật ghi chú nếu có gửi kèm),
// tránh trùng lặp khi bấm nhiều lần. Không còn khái niệm "vai trò" riêng
// theo dòng — 1 nhân sự chỉ tham gia 1 lần / task. Tỷ lệ đóng góp/điểm cá
// nhân thường được chỉnh sau (sửa trực tiếp trên bảng), không bắt buộc khi
// gán mới, nhưng vẫn cho gửi kèm nếu có.
export async function createTaskMember(
  taskId: number,
  input: CreateTaskMemberInput,
  scope: DataScope,
): Promise<TaskMemberWithName> {
  const departmentId = await departmentIdFromTaskId(taskId);
  assertDepartmentInScope(scope, departmentId);
  if (input.ty_le_dong_gop != null) {
    await assertContributionWithinLimit(taskId, null, input.ty_le_dong_gop);
  }

  // is_deleted=false — nhân sự đã gỡ khỏi task (xóa mềm) trước đó không
  // tính "đã có", gán lại tạo dòng mới (khớp filtered unique index).
  const existing = await db("task_members")
    .where({ task_id: taskId, member_id: input.member_id, is_deleted: false })
    .first();
  if (existing) {
    const update: Record<string, unknown> = { updated_at: db.fn.now() };
    if (input.ghi_chu !== undefined) update.ghi_chu = normalizeNullableText(input.ghi_chu, null);
    if (input.noi_dung_cong_viec !== undefined)
      update.noi_dung_cong_viec = normalizeNullableText(input.noi_dung_cong_viec, null);
    if (input.ty_le_dong_gop !== undefined) update.ty_le_dong_gop = input.ty_le_dong_gop;
    if (input.diem_ca_nhan !== undefined) update.diem_ca_nhan = input.diem_ca_nhan;
    if (input.phan_loai !== undefined) update.phan_loai = normalizeNullableText(input.phan_loai, null);
    await db("task_members").where({ id: existing.id }).update(update);
    return (await getTaskMember(existing.id)) as TaskMemberWithName;
  }

  const [created] = await db("task_members")
    .insert({
      task_id: taskId,
      member_id: input.member_id,
      department_id: departmentId,
      ty_le_dong_gop: input.ty_le_dong_gop ?? null,
      diem_ca_nhan: input.diem_ca_nhan ?? null,
      phan_loai: normalizeNullableText(input.phan_loai, null),
      noi_dung_cong_viec: normalizeNullableText(input.noi_dung_cong_viec, null),
      ghi_chu: normalizeNullableText(input.ghi_chu, null),
    })
    .returning("*");
  return (await getTaskMember(created.id)) as TaskMemberWithName;
}

export async function updateTaskMember(
  id: number,
  input: UpdateTaskMemberInput,
  scope: DataScope,
): Promise<TaskMemberWithName | undefined> {
  const existing = await getTaskMember(id);
  if (!existing) return undefined;
  const existingRow = await db("task_members").where({ id, is_deleted: false }).select("department_id").first();
  assertDepartmentInScope(scope, (existingRow as any)?.department_id ?? null);

  if (input.ty_le_dong_gop !== undefined && input.ty_le_dong_gop !== null) {
    await assertContributionWithinLimit(existing.task_id, id, input.ty_le_dong_gop);
  }
  if (!input.mark_can_xu_ly_gap_resolved && input.can_xu_ly_gap === true && !input.can_xu_ly_gap_ly_do?.trim()) {
    throw new Error("Cần nhập lý do khi đánh dấu Việc cần xử lý gấp");
  }

  const update: Record<string, unknown> = {
    ty_le_dong_gop: input.ty_le_dong_gop !== undefined ? input.ty_le_dong_gop : existing.ty_le_dong_gop,
    diem_ca_nhan: input.diem_ca_nhan !== undefined ? input.diem_ca_nhan : existing.diem_ca_nhan,
    phan_loai: normalizeNullableText(input.phan_loai, existing.phan_loai),
    noi_dung_cong_viec: normalizeNullableText(input.noi_dung_cong_viec, existing.noi_dung_cong_viec),
    ghi_chu: normalizeNullableText(input.ghi_chu, existing.ghi_chu),
    updated_at: db.fn.now(),
  };
  // "Đã xử lý" (nút ở card đôn đốc Trang chủ) — tắt can_xu_ly_gap, ghi
  // da_xu_ly_gap_luc = hôm nay (CỘT RIÊNG, không nhét vào ghi_chu — trước
  // đó note vào ghi_chu khiến ô input 1 dòng tràn chữ không đọc được,
  // theo phản hồi của user). FE hiển thị badge riêng, xem renderTaskMemberBody
  // ở 04-tasks.js. Thắng mọi field can_xu_ly_gap* khác gửi kèm.
  if (input.mark_can_xu_ly_gap_resolved) {
    update.can_xu_ly_gap = false;
    update.can_xu_ly_gap_ly_do = null;
    update.can_xu_ly_gap_tu_ngay = null;
    update.da_xu_ly_gap_luc = todayDateString();
  } else if (input.can_xu_ly_gap === true) {
    // "Việc cần xử lý gấp" — cùng cơ chế Treo việc (task_items.treo_viec,
    // xem taskItem.service.ts): bắt buộc lý do, tự ghi/xóa ngày đánh dấu.
    // Đánh dấu lại (1 vòng đời mới) -> gỡ badge "Đã xử lý" của vòng trước.
    update.can_xu_ly_gap = true;
    update.can_xu_ly_gap_ly_do = input.can_xu_ly_gap_ly_do!.trim();
    update.can_xu_ly_gap_tu_ngay = existing.can_xu_ly_gap ? existing.can_xu_ly_gap_tu_ngay : todayDateString();
    update.da_xu_ly_gap_luc = null;
  } else if (input.can_xu_ly_gap === false) {
    update.can_xu_ly_gap = false;
    update.can_xu_ly_gap_ly_do = null;
    update.can_xu_ly_gap_tu_ngay = null;
  }

  // "Trừ điểm cá nhân" — nút 1 lần/dòng ở cột hành động bảng "Nhân sự tham
  // gia": trừ thẳng 10 điểm khỏi Điểm cá nhân ĐANG HIỂN THỊ của dòng (đang
  // tự tính theo % Đánh giá hay đã ghi đè tay đều được — giá trị mới lưu vào
  // diem_ca_nhan thành điểm ghi đè). VD dòng tự tính 5 điểm (như ảnh user
  // gửi) -> bấm 1 lần còn -5. tru_diem_luc giữ dấu "đã dùng lượt trừ" để
  // chặn trừ lần 2 (bấm lại -> 400, FE thay nút bằng badge "Đã trừ điểm").
  // Số điểm trừ ĐỒNG THỜI lưu vào tru_diem_so_diem (lớp riêng) — ↺ reset về
  // sau chỉ xóa điểm nhập tay (diem_ca_nhan), KHÔNG xóa được điểm trừ:
  // điểm mặc định của dòng = tự tính - tru_diem_so_diem (xem
  // defaultDiemCaNhan ở dưới + renderTaskMembers, 04-tasks.js).
  let truDiemPeriodId: number | null = null;
  if (input.tru_diem_ca_nhan === true) {
    if (existing.tru_diem_luc) {
      throw new Error("Dòng này đã trừ điểm cá nhân rồi — mỗi dòng chỉ trừ được 1 lần.");
    }
    const task = await db("tasks")
      .where({ id: existing.task_id })
      .select("cpo_danh_gia", "period_id")
      .first();
    const cpo = task?.cpo_danh_gia != null ? Number(task.cpo_danh_gia) : null;
    const tyLe = existing.ty_le_dong_gop != null ? Number(existing.ty_le_dong_gop) : null;
    // Điểm đang hiển thị — cùng công thức tự tính ở renderTaskMembers
    // (04-tasks.js) và listKpiTheoTask dưới đây: diem_ca_nhan ghi đè ưu
    // tiên; "Hỗ trợ" nhân Tỷ lệ đóng góp, còn lại thẳng % Đánh giá.
    const effective =
      existing.diem_ca_nhan != null
        ? Number(existing.diem_ca_nhan)
        : existing.phan_loai === HO_TRO_LABEL
          ? cpo != null && tyLe != null
            ? Math.round(((cpo * tyLe) / 100) * 100) / 100
            : null
          : cpo;
    update.diem_ca_nhan = Math.round(((effective ?? 0) - 10) * 100) / 100;
    update.tru_diem_luc = todayDateString();
    update.tru_diem_so_diem = 10;
    truDiemPeriodId = (task?.period_id as number | undefined) ?? null;
  }

  await db("task_members").where({ id }).update(update);
  // Sau khi trừ, kiểm tra tổng "Điểm cá nhân (Tính theo task)" của nhân sự
  // trong tháng của task — rơi <= 0 thì tự động Hạ KI (xem
  // autoHaKiNeuDiemNhoHonBang0 bên dưới). Chỉ chạy đúng bấm "Trừ điểm cá
  // nhân", không chạy cho các PUT sửa điểm/thay đổi khác.
  if (truDiemPeriodId != null) {
    await autoHaKiNeuDiemNhoHonBang0(existing.member_id, truDiemPeriodId);
  }
  return getTaskMember(id);
}

export async function deleteTaskMember(id: number, scope: DataScope): Promise<boolean> {
  const existingRow = await db("task_members").where({ id, is_deleted: false }).select("department_id").first();
  if (!existingRow) return false;
  assertDepartmentInScope(scope, (existingRow as any).department_id ?? null);
  const count = await softDeleteWhere(db, "task_members", { id });
  return count > 0;
}

// Nhãn "Hỗ trợ" trong danh mục phan_loai_nhan_su_options — khớp với
// HO_TRO_LABEL ở public/app.js (2 nơi định nghĩa độc lập, không có module
// dùng chung giữa FE/BE trong repo này).
const HO_TRO_LABEL = "Hỗ trợ";

// Điểm MẶC ĐỊNH (diem_ca_nhan null) sau khi áp điểm trừ "Trừ điểm cá nhân":
// tự tính - tru_diem_so_diem. Có điểm trừ mà tự tính null -> trừ trên 0
// (= -tru_diem_so_diem); không có điểm trừ -> giữ nguyên tự tính (kể cả
// null — task chưa chấm điểm thì không có điểm). ↺ reset chỉ xóa điểm nhập
// tay về giá trị này, không xóa được điểm trừ (yêu cầu user).
function defaultDiemSauTru(auto: number | null, truSoDiem: number): number | null {
  if (truSoDiem === 0) return auto;
  return Math.round(((auto ?? 0) - truSoDiem) * 100) / 100;
}

// Lý do cố định khi tự động Hạ KI sau khi trừ điểm cá nhân (đề nghị của
// user) — hiển thị ở cột "Ghi chú" tab Nhân sự + cạnh badge Hạ KI ở Home >
// Ranking > Ranking thành viên team (xem memberNoteCellContent, 03-members.js).
const AUTO_HA_KI_LY_DO = "Tự động trừ KI do điểm cá nhân <= 0";

// Tự động Hạ KI nhân sự khi tổng "Điểm cá nhân (Tính theo task)" của người
// đó trong 1 tháng backlog rơi <= 0 — do nút "Trừ điểm cá nhân" (ở Nhân sự
// tham gia task HOẶC ở Sự cố — incidentMember.service.ts cũng gọi hàm này,
// chỉ chạy đúng sau khi trừ, không chạy cho PUT sửa điểm thông thường). Cột
// "Điểm cá nhân (Tính theo task)" ở Team & Nhân sự = trung bình điểm các
// task "Thực hiện chính" (hoặc chưa phân loại) + cộng thẳng điểm các task
// "Hỗ trợ", TRỪ ĐI tổng điểm trừ từ Sự cố (memberAvgDiemTheoTask,
// 03-members.js / listKpiTheoTask ở dưới) — tính đúng theo công thức đó.
// Trả về true nếu đã tự Hạ KI. Không làm gì khi:
// - chưa có task nào có điểm VÀ chưa từng bị trừ điểm sự cố (chưa đủ dữ
//   liệu để kết luận),
// - tổng còn > 0,
// - nhân sự đã đang Hạ KI (giữ nguyên lý do cũ, không ghi đè).
// Bật ha_ki đồng thời tắt tang_ki (2 cờ loại trừ nhau — khớp updateMember,
// member.service.ts).
export async function autoHaKiNeuDiemNhoHonBang0(memberId: number, periodId: number): Promise<boolean> {
  const rows = await db("task_members as tm")
    .join("tasks as t", "tm.task_id", "t.id")
    .where("tm.member_id", memberId)
    .where("t.period_id", periodId)
    .where("tm.is_deleted", false)
    .where("t.is_deleted", false)
    .select(
      "tm.phan_loai as phan_loai",
      "tm.ty_le_dong_gop as ty_le",
      "tm.diem_ca_nhan as diem_ca_nhan",
      "tm.tru_diem_so_diem as tru_so_diem",
      "t.cpo_danh_gia as cpo",
    );

  let mainSum = 0;
  let mainCount = 0;
  let bonus = 0;
  for (const r of rows as any[]) {
    const diemCaNhan = r.diem_ca_nhan != null ? Number(r.diem_ca_nhan) : null;
    const tyLe = r.ty_le != null ? Number(r.ty_le) : null;
    const cpo = r.cpo != null ? Number(r.cpo) : null;
    const truSoDiem = r.tru_so_diem != null ? Number(r.tru_so_diem) : 0;
    // Cùng công thức điểm từng task với listKpiTheoTask dưới đây (gồm cả
    // điểm trừ "Trừ điểm cá nhân" trên nhánh điểm mặc định).
    const diem =
      diemCaNhan !== null
        ? diemCaNhan
        : r.phan_loai === HO_TRO_LABEL
          ? defaultDiemSauTru(
              cpo !== null && tyLe !== null ? Math.round(((cpo * tyLe) / 100) * 100) / 100 : null,
              truSoDiem,
            )
          : defaultDiemSauTru(cpo, truSoDiem);
    if (diem === null) continue;
    if (r.phan_loai === HO_TRO_LABEL) {
      bonus += diem;
    } else {
      mainSum += diem;
      mainCount += 1;
    }
  }
  // Khoản trừ từ Sự cố (CSKH) — ĐỘC LẬP với mọi task, áp SAU CÙNG (khớp
  // đúng công thức ở listKpiTheoTask/memberAvgDiemTheoTask phía trên).
  const incidentPenaltyRow = await db("incident_members as im")
    .join("incidents as inc", "im.incident_id", "inc.id")
    .where("im.member_id", memberId)
    .where("inc.period_id", periodId)
    .where("inc.is_deleted", false)
    .whereNotNull("im.tru_diem_luc")
    .sum({ tong: "im.tru_diem_so_diem" })
    .first();
  const truSuCo = Number((incidentPenaltyRow as any)?.tong ?? 0);

  if (mainCount === 0 && bonus === 0 && truSuCo === 0) return false;
  const total = Math.round(((mainCount > 0 ? mainSum / mainCount : 0) + bonus - truSuCo) * 100) / 100;
  if (total > 0) return false;

  const member = await db("members")
    .where({ id: memberId, is_deleted: false })
    .select("ha_ki", "tang_ki")
    .first();
  if (!member || member.ha_ki) return false;
  await db("members").where({ id: memberId }).update({
    ha_ki: true,
    tang_ki: false,
    ki_ly_do: AUTO_HA_KI_LY_DO,
  });
  return true;
}

// KPI nhân sự tính trực tiếp theo task (dùng cho phòng ban có
// departments.cach_tinh_kpi = "theo_task", không chia theo team) — cộng dồn
// Điểm cá nhân của mỗi nhân sự từ mọi task họ tham gia trong 1 tháng
// backlog. Điểm từng task:
// - diem_ca_nhan ghi đè tay -> luôn ưu tiên dùng giá trị đó, bất kể phân loại.
// - Task phân loại "Hỗ trợ" -> Điểm = Tỷ lệ đóng góp (%) × % Đánh giá / 100
//   (vẫn nhân tỷ lệ — hỗ trợ càng nhiều mới được cộng càng nhiều).
// - Task "Thực hiện chính" (hoặc chưa phân loại) -> thẳng % Đánh giá của
//   task, KHÔNG nhân tỷ lệ đóng góp — tránh việc task nhiều người chia sẻ
//   tỷ lệ thấp bị kéo điểm xuống so với task 1 người làm trọn dù % Đánh giá
//   như nhau, không phản ánh đúng nỗ lực.
// Áp dụng thống nhất cho cả tong_diem (KPI theo Task/Ranking nhân sự ở
// Home) lẫn diem từng task (Điểm cá nhân (Tính theo task)/popup chi tiết ở
// bảng Nhân sự). Task chưa chấm điểm thì không cộng điểm (không phải 0 —
// vẫn tính vào "số task tham gia" để biết họ có tham gia, chỉ không có điểm).
export async function listKpiTheoTask(
  periodId: number,
  departmentId: number | null,
): Promise<KpiTheoTaskRow[]> {
  const query = db("task_members")
    .join("tasks", "task_members.task_id", "tasks.id")
    .join("members", "task_members.member_id", "members.id")
    .leftJoin("teams", "members.team_id", "teams.id")
    .where("tasks.period_id", periodId)
    .where("task_members.is_deleted", false)
    .where("tasks.is_deleted", false)
    .where("members.is_deleted", false);
  if (departmentId != null) query.where("tasks.department_id", departmentId);

  const rows = await query.select(
    "members.id as member_id",
    "members.name as member_name",
    "members.chuc_vu as member_chuc_vu",
    "teams.name as team_name",
    "tasks.id as task_id",
    "tasks.nhiem_vu as nhiem_vu",
    "tasks.team as task_team",
    "tasks.cpo_danh_gia as cpo_danh_gia",
    "task_members.phan_loai as phan_loai",
    "task_members.ty_le_dong_gop as ty_le_dong_gop",
    "task_members.diem_ca_nhan as diem_ca_nhan",
    "task_members.tru_diem_so_diem as tru_diem_so_diem",
  );

  const byMember = new Map<number, KpiTheoTaskRow>();
  for (const r of rows as any[]) {
    const diemCaNhan = r.diem_ca_nhan !== null && r.diem_ca_nhan !== undefined ? Number(r.diem_ca_nhan) : null;
    const tyLeDongGop = r.ty_le_dong_gop !== null && r.ty_le_dong_gop !== undefined ? Number(r.ty_le_dong_gop) : null;
    const cpoDanhGia = r.cpo_danh_gia !== null && r.cpo_danh_gia !== undefined ? Number(r.cpo_danh_gia) : null;
    const truSoDiem = r.tru_diem_so_diem != null ? Number(r.tru_diem_so_diem) : 0;
    // diem_ca_nhan ghi đè luôn ưu tiên; không thì tùy phân loại — "Hỗ trợ"
    // nhân tỷ lệ đóng góp, "Thực hiện chính"/chưa phân loại thì không —
    // rồi trừ tiếp điểm trừ "Trừ điểm cá nhân" (không thể ↺ reset).
    const diem =
      diemCaNhan !== null
        ? diemCaNhan
        : r.phan_loai === HO_TRO_LABEL
          ? defaultDiemSauTru(
              cpoDanhGia !== null && tyLeDongGop !== null
                ? Math.round(((cpoDanhGia * tyLeDongGop) / 100) * 100) / 100
                : null,
              truSoDiem,
            )
          : defaultDiemSauTru(cpoDanhGia, truSoDiem);

    if (!byMember.has(r.member_id)) {
      byMember.set(r.member_id, {
        member_id: r.member_id,
        member_name: r.member_name,
        member_chuc_vu: r.member_chuc_vu,
        team_name: r.team_name,
        so_task: 0,
        tong_diem: 0,
        diem_tru_su_co: 0,
        su_co_tru_diem: [],
        tasks: [],
      });
    }
    const entry = byMember.get(r.member_id)!;
    entry.so_task += 1;
    entry.tong_diem = Math.round((entry.tong_diem + (diem ?? 0)) * 100) / 100;
    entry.tasks.push({
      task_id: r.task_id,
      nhiem_vu: r.nhiem_vu,
      team: r.task_team,
      phan_loai: r.phan_loai,
      ty_le_dong_gop: tyLeDongGop,
      cpo_danh_gia: cpoDanhGia,
      diem,
    });
  }

  // "Trừ điểm cá nhân" ở Sự cố (incident_members.tru_diem_so_diem) — khoản
  // trừ ĐỘC LẬP với mọi task, áp thẳng vào tong_diem SAU khi đã tính xong
  // (không ghi đè diem_ca_nhan của bất kỳ task nào — khác cơ chế "Trừ điểm
  // cá nhân" ở Nhân sự tham gia task, vì 1 Sự cố không gắn với task cụ
  // thể nào của nhân sự). Nhân sự có sự cố nhưng KHÔNG tham gia task nào
  // tháng đó vẫn cần xuất hiện ở đây để thấy điểm âm.
  const incidentPenaltyQuery = db("incident_members as im")
    .join("incidents as inc", "im.incident_id", "inc.id")
    .join("members as m", "im.member_id", "m.id")
    .leftJoin("teams as t", "m.team_id", "t.id")
    .where("inc.period_id", periodId)
    .where("inc.is_deleted", false)
    .whereNotNull("im.tru_diem_luc");
  if (departmentId != null) incidentPenaltyQuery.where("inc.department_id", departmentId);
  // KHÔNG groupBy — lấy từng dòng để dựng su_co_tru_diem (note ở cột Ghi
  // chú bảng Nhân sự, xem memberNoteCellContent 03-members.js), gộp tổng
  // ngay trong vòng lặp JS bên dưới (cùng kỹ thuật vòng lặp rows ở trên).
  const penaltyRows = await incidentPenaltyQuery.select(
    "im.member_id",
    "m.name as member_name",
    "m.chuc_vu as member_chuc_vu",
    "t.name as team_name",
    "inc.ten_su_co",
    "im.tru_diem_so_diem",
    "im.tru_diem_luc",
  );

  for (const r of penaltyRows as any[]) {
    const soDiem = Math.round(Number(r.tru_diem_so_diem ?? 0) * 100) / 100;
    if (soDiem === 0) continue;
    if (!byMember.has(r.member_id)) {
      byMember.set(r.member_id, {
        member_id: r.member_id,
        member_name: r.member_name,
        member_chuc_vu: r.member_chuc_vu,
        team_name: r.team_name,
        so_task: 0,
        tong_diem: 0,
        diem_tru_su_co: 0,
        su_co_tru_diem: [],
        tasks: [],
      });
    }
    const entry = byMember.get(r.member_id)!;
    entry.diem_tru_su_co = Math.round((entry.diem_tru_su_co + soDiem) * 100) / 100;
    entry.tong_diem = Math.round((entry.tong_diem - soDiem) * 100) / 100;
    entry.su_co_tru_diem.push({ ten_su_co: r.ten_su_co, so_diem: soDiem, ngay: r.tru_diem_luc });
  }

  return Array.from(byMember.values()).sort((a, b) => b.tong_diem - a.tong_diem);
}

// Danh sách Nhân sự đang bị đánh dấu "Việc cần xử lý gấp" — cho card đôn
// đốc ở Trang chủ, cùng tinh thần listTreoViec() ở taskItem.service.ts.
export async function listCanXuLyGap(periodId: number, departmentId?: number | null): Promise<CanXuLyGapRow[]> {
  const query = db("task_members as tm")
    .join("tasks as t", "tm.task_id", "t.id")
    .join("members as m", "tm.member_id", "m.id")
    .where("tm.is_deleted", false)
    .where("tm.can_xu_ly_gap", true)
    .where("t.is_deleted", false)
    .where("t.period_id", periodId);
  if (departmentId != null) query.where("t.department_id", departmentId);

  const rows = await query.select(
    "tm.id",
    "m.name as member_name",
    "tm.noi_dung_cong_viec",
    "tm.can_xu_ly_gap_ly_do",
    "tm.can_xu_ly_gap_tu_ngay",
    "tm.task_id",
    "t.nhiem_vu as task_nhiem_vu",
    "t.team as team",
  );

  const today = Date.now();
  return (rows as any[])
    .map((r) => {
      const tuNgay = r.can_xu_ly_gap_tu_ngay ? new Date(r.can_xu_ly_gap_tu_ngay).getTime() : today;
      return {
        id: r.id,
        member_name: r.member_name,
        noi_dung_cong_viec: r.noi_dung_cong_viec,
        can_xu_ly_gap_ly_do: r.can_xu_ly_gap_ly_do,
        can_xu_ly_gap_tu_ngay: r.can_xu_ly_gap_tu_ngay,
        so_ngay: Math.max(0, Math.round((today - tuNgay) / 86_400_000)),
        task_id: r.task_id,
        task_nhiem_vu: r.task_nhiem_vu,
        team: r.team,
      } as CanXuLyGapRow;
    })
    .sort((a, b) => b.so_ngay - a.so_ngay);
}
