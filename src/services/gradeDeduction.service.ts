import { db } from "../db/database.js";
import type { GradeDeduction } from "../types/backlog.js";
import { getTask } from "./task.service.js";
import { assertDepartmentInScope, type DataScope } from "./scope.util.js";

const SO_DIEM_TRU = 10;
// "Điểm cá nhân (Mặc định)" — mặc định mỗi nhân sự 100 điểm/tháng (yêu cầu
// user), trừ dần theo grade_deductions của period đó, tự về 100 khi sang
// tháng (period) mới vì tính theo period_id của task gây trừ điểm.
export const DIEM_MAC_DINH_GOC = 100;

function todayDateString(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function listGradeDeductionsForTask(taskId: number): Promise<GradeDeduction[]> {
  const rows = await db("grade_deductions as gd")
    .join("members as m", "gd.member_id", "m.id")
    .where("gd.task_id", taskId)
    .where("gd.is_deleted", false)
    .select(
      "gd.id",
      "gd.task_id",
      "gd.member_id",
      "m.name as member_name",
      "gd.so_diem",
      "gd.tru_luc",
      "gd.nguoi_tru",
      "gd.created_at",
    )
    .orderBy("gd.id", "asc");
  return rows as GradeDeduction[];
}

// Trừ 10 điểm cá nhân (vào "Điểm cá nhân (Mặc định)") của 1 nhân sự, gắn
// với 1 task cụ thể — mỗi (task, nhân sự) chỉ trừ được 1 lần (chặn ở
// unique index grade_deductions_task_member_active_unique). Sau khi trừ,
// kiểm tra lại tổng "Mặc định" của nhân sự trong tháng, rơi <= 0 thì tự
// động Hạ KI (giống các cơ chế "Trừ điểm cá nhân" khác đã có).
export async function addGradeDeduction(
  taskId: number,
  memberId: number,
  nguoiTru: string | null,
  scope: DataScope,
): Promise<GradeDeduction> {
  const task = await getTask(taskId);
  if (!task) throw new Error("Không tìm thấy nhiệm vụ");
  assertDepartmentInScope(scope, task.department_id ?? null);

  const existing = await db("grade_deductions")
    .where({ task_id: taskId, member_id: memberId, is_deleted: false })
    .first();
  if (existing) {
    throw new Error("Nhân sự này đã bị trừ điểm cá nhân ở nhiệm vụ này rồi — mỗi nhiệm vụ chỉ trừ được 1 lần/người.");
  }

  const [created] = await db("grade_deductions")
    .insert({
      task_id: taskId,
      member_id: memberId,
      so_diem: SO_DIEM_TRU,
      tru_luc: todayDateString(),
      nguoi_tru: nguoiTru,
    })
    .returning("*");

  await autoHaKiNeuMacDinhNhoHonBang0(memberId, task.period_id);

  const [row] = await db("grade_deductions as gd")
    .join("members as m", "gd.member_id", "m.id")
    .where("gd.id", created.id)
    .select("gd.id", "gd.task_id", "gd.member_id", "m.name as member_name", "gd.so_diem", "gd.tru_luc", "gd.nguoi_tru", "gd.created_at");
  return row as GradeDeduction;
}

// Tổng điểm bị trừ (grade_deductions) của 1 nhân sự trong 1 tháng (period)
// — SUM theo period_id của các task gây trừ điểm, không phải period riêng
// của bảng grade_deductions (không có cột này, tận dụng luôn task_id).
export async function sumGradeDeductions(memberId: number, periodId: number): Promise<number> {
  const row = await db("grade_deductions as gd")
    .join("tasks as t", "gd.task_id", "t.id")
    .where("gd.member_id", memberId)
    .where("t.period_id", periodId)
    .where("gd.is_deleted", false)
    .sum({ tong: "gd.so_diem" })
    .first();
  return Math.round(Number((row as any)?.tong ?? 0) * 100) / 100;
}

// Tổng điểm bị trừ từ Sự cố (incident_members.tru_diem_so_diem, nút "Trừ
// điểm cá nhân" ở popup "Nhân sự liên quan") của 1 nhân sự trong 1 tháng —
// CŨNG trừ vào "Điểm cá nhân (Mặc định)" (yêu cầu user: gộp mọi rule "Trừ
// điểm cá nhân" trong hệ thống về chung 1 đích là cột Mặc định, không còn
// đụng vào "Điểm cá nhân (Tính theo task)" nữa).
async function sumIncidentDeductions(memberId: number, periodId: number): Promise<number> {
  const row = await db("incident_members as im")
    .join("incidents as inc", "im.incident_id", "inc.id")
    .where("im.member_id", memberId)
    .where("inc.period_id", periodId)
    .where("inc.is_deleted", false)
    .whereNotNull("im.tru_diem_luc")
    .sum({ tong: "im.tru_diem_so_diem" })
    .first();
  return Math.round(Number((row as any)?.tong ?? 0) * 100) / 100;
}

// Tổng mọi khoản trừ vào "Điểm cá nhân (Mặc định)" của 1 nhân sự trong 1
// tháng — gộp grade_deductions (popup Chấm điểm + nút "Trừ điểm cá nhân" ở
// "Nhân sự tham gia") VÀ incident_members (Sự cố). Dùng cho cả
// listKpiTheoTask (taskMember.service.ts, hiển thị cột Mặc định) lẫn
// autoHaKiNeuMacDinhNhoHonBang0 bên dưới.
export async function sumMacDinhDeductions(memberId: number, periodId: number): Promise<number> {
  const [grade, incident] = await Promise.all([
    sumGradeDeductions(memberId, periodId),
    sumIncidentDeductions(memberId, periodId),
  ]);
  return Math.round((grade + incident) * 100) / 100;
}

const AUTO_HA_KI_LY_DO_MAC_DINH = "Tự động trừ KI do Điểm cá nhân (Mặc định) <= 0";

// Tự động Hạ KI khi "Điểm cá nhân (Mặc định)" (100 - tổng mọi khoản trừ
// trong tháng, gồm grade_deductions + Sự cố) rơi <= 0 — gọi từ CẢ
// addGradeDeduction (trên) lẫn truDiemIncidentMember (incidentMember.
// service.ts). Không đụng nhân sự đã đang Hạ KI (giữ nguyên lý do cũ).
export async function autoHaKiNeuMacDinhNhoHonBang0(memberId: number, periodId: number): Promise<boolean> {
  const tongTru = await sumMacDinhDeductions(memberId, periodId);
  const macDinh = Math.round((DIEM_MAC_DINH_GOC - tongTru) * 100) / 100;
  if (macDinh > 0) return false;

  const member = await db("members").where({ id: memberId, is_deleted: false }).select("ha_ki").first();
  if (!member || member.ha_ki) return false;
  await db("members").where({ id: memberId }).update({
    ha_ki: true,
    tang_ki: false,
    ki_ly_do: AUTO_HA_KI_LY_DO_MAC_DINH,
  });
  return true;
}
