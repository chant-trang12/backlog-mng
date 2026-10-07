import { db } from "../db/database.js";
import type {
  CreateIncidentInput,
  Incident,
  IncidentWithTeam,
  UpdateIncidentInput,
} from "../types/cskh.js";
import { assertDepartmentInScope, departmentIdFromTeamId, type DataScope } from "./scope.util.js";
import { softDeleteWhere } from "./softDelete.util.js";

// Bộ cột chi tiết của Sự cố (ngoài period_id/team_id) — KHỚP thứ tự cột
// bảng dữ liệu trang Sự cố + các trường form "Thêm/Sửa sự cố" (xem
// migrations/core.ts). datetime: 2 cột thời điểm lưu chuỗi
// "YYYY-MM-DDTHH:mm" của <input type="datetime-local">, còn lại text tự do.
export const INCIDENT_FIELDS: Array<{ key: keyof CreateIncidentInput; datetime?: boolean }> = [
  { key: "tao_boi" },
  { key: "dich_vu_idc" },
  { key: "ten_su_co" },
  { key: "hien_tuong" },
  { key: "pham_vi_anh_huong" },
  { key: "nguyen_nhan" },
  { key: "hanh_dong" },
  { key: "thoi_diem_ghi_nhan", datetime: true },
  { key: "thoi_diem_hoan_thanh", datetime: true },
  { key: "thoi_gian_xu_ly" },
  { key: "gian_doad_dich_vu" },
  { key: "thoi_gian_gian_doad" },
  { key: "ly_do_khong_gian_doad" },
  { key: "dich_vu" },
  { key: "nhom_dich_vu" },
  { key: "don_vi_trach_nhiem" },
  { key: "bu_site_trach_nhiem" },
  { key: "cap_do_anh_huong" },
  { key: "tinh_trang" },
  { key: "link_ticket" },
  { key: "link_itsm" },
  { key: "danh_gia_sla" },
  { key: "danh_gia_nguyen_nhan" },
  { key: "dien_giai_vuot_sla" },
];

// undefined -> bỏ qua (update: giữ nguyên), null/rỗng -> null, chuỗi -> trim.
function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

export async function createIncident(input: CreateIncidentInput, scope: DataScope): Promise<Incident> {
  const departmentId = await departmentIdFromTeamId(input.team_id);
  assertDepartmentInScope(scope, departmentId);
  const fields: Record<string, unknown> = {};
  for (const f of INCIDENT_FIELDS) fields[f.key] = textOrNull(input[f.key]);
  const [created] = await db("incidents")
    .insert({
      period_id: input.period_id,
      team_id: input.team_id,
      department_id: departmentId,
      ...fields,
    })
    .returning("*");
  return created as Incident;
}

export async function getIncident(id: number): Promise<Incident | undefined> {
  const row = await db("incidents").where({ id, is_deleted: false }).first();
  return row as Incident | undefined;
}

export async function listIncidents(departmentId?: number | null): Promise<IncidentWithTeam[]> {
  const query = db("incidents")
    .join("teams", "teams.id", "incidents.team_id")
    .join("periods", "periods.id", "incidents.period_id")
    .where("incidents.is_deleted", false)
    .where("teams.is_deleted", false)
    .select(
      "incidents.*",
      "teams.name as team_name",
      "periods.label as period_label",
    );
  if (departmentId != null) query.where("incidents.department_id", departmentId);
  const rows = await query
    .orderBy("periods.year", "desc")
    .orderBy("periods.month", "desc")
    .orderBy("teams.name", "asc")
    .orderBy("incidents.id", "desc");
  if (rows.length === 0) return [];

  // Đếm số nhân sự liên quan mỗi sự cố (gộp theo incident_id) — 1 query
  // duy nhất thay vì N+1, cùng kỹ thuật member_count ở listTasks()
  // (task.service.ts) — hiện số lượng ở nút "Nhân sự liên quan" (FE).
  const counts = await db("incident_members")
    .whereIn("incident_id", rows.map((r: any) => r.id))
    .groupBy("incident_id")
    .select("incident_id")
    .count({ c: "*" });
  const countMap = new Map<number, number>(counts.map((r: any) => [Number(r.incident_id), Number(r.c)]));

  return rows.map((r: any) => ({ ...r, member_count: countMap.get(r.id) ?? 0 })) as IncidentWithTeam[];
}

export async function updateIncident(
  id: number,
  input: UpdateIncidentInput,
  scope: DataScope,
): Promise<Incident | undefined> {
  const existing = await getIncident(id);
  if (!existing) return undefined;
  assertDepartmentInScope(scope, (existing as any).department_id ?? null);

  const merged: Record<string, unknown> = {
    period_id: input.period_id ?? existing.period_id,
    team_id: input.team_id ?? existing.team_id,
  };
  for (const f of INCIDENT_FIELDS) {
    const value = input[f.key];
    merged[f.key] = value === undefined ? (existing as any)[f.key] ?? null : textOrNull(value);
  }

  const [updated] = await db("incidents")
    .where({ id })
    .update({
      ...merged,
      updated_at: db.fn.now(),
    })
    .returning("*");

  return updated as Incident;
}

export async function deleteIncident(id: number, scope: DataScope): Promise<boolean> {
  const existing = await getIncident(id);
  if (!existing) return false;
  assertDepartmentInScope(scope, (existing as any).department_id ?? null);
  const count = await softDeleteWhere(db, "incidents", { id });
  return count > 0;
}
