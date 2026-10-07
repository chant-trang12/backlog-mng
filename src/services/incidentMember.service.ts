import { db } from "../db/database.js";
import type { CreateIncidentMemberInput, IncidentMember } from "../types/cskh.js";
import { getIncident } from "./incident.service.js";
import { assertDepartmentInScope, type DataScope } from "./scope.util.js";
import { getMember } from "./member.service.js";

const TRU_DIEM_SO_DIEM = 50; // trừ điểm cá nhân cho nhân sự liên quan sự cố

// SQLite trả cột boolean là 0/1 — chuẩn hóa về boolean cho FE/test.
function normalizeRow(row: any): IncidentMember {
  return { ...row, member_ha_ki: !!row.member_ha_ki, member_tang_ki: !!row.member_tang_ki };
}

function todayDateString(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Nạp 1 dòng nhân sự liên quan (join member) — trả undefined nếu không có.
async function getIncidentMemberRow(id: number): Promise<IncidentMember | undefined> {
  const row = await db("incident_members")
    .join("members", "members.id", "incident_members.member_id")
    .where("incident_members.id", id)
    .select(
      "incident_members.*",
      "members.name as member_name",
      "members.chuc_vu as member_chuc_vu",
      "members.ha_ki as member_ha_ki",
      "members.tang_ki as member_tang_ki",
    )
    .first();
  return row ? normalizeRow(row) : undefined;
}

export async function listIncidentMembers(incidentId: number): Promise<IncidentMember[]> {
  const rows = await db("incident_members")
    .join("members", "members.id", "incident_members.member_id")
    .where({ "incident_members.incident_id": incidentId })
    .select(
      "incident_members.*",
      "members.name as member_name",
      "members.chuc_vu as member_chuc_vu",
      "members.ha_ki as member_ha_ki",
      "members.tang_ki as member_tang_ki",
    )
    .orderBy("incident_members.id", "asc");
  return rows.map(normalizeRow);
}

export async function addIncidentMember(
  incidentId: number,
  input: CreateIncidentMemberInput,
  scope: DataScope,
): Promise<IncidentMember> {
  const incident = await getIncident(incidentId);
  if (!incident) throw new Error("Không tìm thấy sự cố");
  assertDepartmentInScope(scope, (incident as any).department_id ?? null);
  const member = await getMember(input.member_id);
  if (!member) throw new Error("Nhân sự không tồn tại");

  const duplicate = await db("incident_members")
    .where({ incident_id: incidentId, member_id: input.member_id })
    .first();
  if (duplicate) throw new Error("Nhân sự này đã có trong danh sách liên quan sự cố");

  const textOrNull = (v: unknown) => {
    const s = String(v ?? "").trim();
    return s || null;
  };
  const [created] = await db("incident_members")
    .insert({
      incident_id: incidentId,
      member_id: input.member_id,
      noi_dung_cong_viec: textOrNull(input.noi_dung_cong_viec),
      nguyen_nhan: textOrNull(input.nguyen_nhan),
    })
    .returning("*");
  const row = await getIncidentMemberRow(created.id);
  return row as IncidentMember;
}

export async function removeIncidentMember(id: number, scope: DataScope): Promise<boolean> {
  const existing = await getIncidentMemberRow(id);
  if (!existing) return false;
  const incident = await getIncident(existing.incident_id);
  assertDepartmentInScope(scope, (incident as any)?.department_id ?? null);
  const count = await db("incident_members").where({ id }).del();
  return count > 0;
}

// Hạ KI — lý do tự sinh theo tên sự cố (yêu cầu user): bật cờ hạ_ki, tự tắt
// tang_ki (giống updateMember: bật 1 cờ tự tắt cờ kia).
export async function haKiIncidentMember(id: number, scope: DataScope): Promise<IncidentMember | undefined> {
  const existing = await getIncidentMemberRow(id);
  if (!existing) return undefined;
  const incident = await getIncident(existing.incident_id);
  assertDepartmentInScope(scope, (incident as any)?.department_id ?? null);
  const lyDo = `Hạ KI do gây ra sự cố "${incident?.ten_su_co ?? ""}"`;
  await db("members")
    .where({ id: existing.member_id })
    .update({ ha_ki: true, tang_ki: false, ki_ly_do: lyDo });
  return getIncidentMemberRow(id);
}

export async function tangKiIncidentMember(id: number, scope: DataScope): Promise<IncidentMember | undefined> {
  const existing = await getIncidentMemberRow(id);
  if (!existing) return undefined;
  const incident = await getIncident(existing.incident_id);
  assertDepartmentInScope(scope, (incident as any)?.department_id ?? null);
  const lyDo = `Tăng KI do xử lý sự cố "${incident?.ten_su_co ?? ""}"`;
  await db("members")
    .where({ id: existing.member_id })
    .update({ tang_ki: true, ha_ki: false, ki_ly_do: lyDo });
  return getIncidentMemberRow(id);
}

// Trừ điểm cá nhân — ghi nhận TRỪ 50 điểm trên dòng liên quan (mỗi dòng chỉ
// trừ 1 lần, như "Trừ điểm cá nhân" của Nhân sự tham gia task).
export async function truDiemIncidentMember(id: number, scope: DataScope): Promise<IncidentMember | undefined> {
  const existing = await getIncidentMemberRow(id);
  if (!existing) return undefined;
  const incident = await getIncident(existing.incident_id);
  assertDepartmentInScope(scope, (incident as any)?.department_id ?? null);
  if (existing.tru_diem_luc) {
    throw new Error("Dòng này đã trừ điểm cá nhân rồi — mỗi dòng chỉ trừ được 1 lần.");
  }
  // Lý do tự sinh theo tên sự cố — cùng cơ chế Hạ KI/Tăng KI (xem
  // haKiIncidentMember/tangKiIncidentMember phía trên), trước đây hành
  // động này không ghi lý do gì.
  const lyDo = `Trừ điểm cá nhân do sự cố "${incident?.ten_su_co ?? ""}"`;
  await db("incident_members")
    .where({ id })
    .update({
      tru_diem_luc: todayDateString(),
      tru_diem_so_diem: TRU_DIEM_SO_DIEM,
      tru_diem_ly_do: lyDo,
      updated_at: db.fn.now(),
    });
  return getIncidentMemberRow(id);
}
