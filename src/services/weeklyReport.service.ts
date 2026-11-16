import { db } from "../db/database.js";
import { assertDepartmentInScope, type DataScope } from "./scope.util.js";

export class WeeklyReportError extends Error {}

export type WeeklySection = "A" | "B1" | "B2" | "C";
export const WEEKLY_SECTIONS: WeeklySection[] = ["A", "B1", "B2", "C"];
export const WEEKLY_STATUSES = ["Hoàn thành", "Đang thực hiện", "Vướng mắc / cần gia hạn", "Chưa cập nhật"] as const;
export const DEFAULT_COMPANY = "CÔNG TY CỔ PHẦN VIETTEL - CHT";

export interface WeeklyRow {
  id: number;
  report_id: number;
  section: WeeklySection;
  thu_tu: number;
  mang_cong_viec: string | null;
  muc_tieu: string | null;
  ten: string | null;
  chu_tri: string | null;
  noi_dung: string | null;
  tien_do: string | null;
  kho_khan: string | null;
  de_xuat: string | null;
  ke_hoach: string | null;
  trang_thai: string | null;
}
export interface WeeklyReportRow {
  id: number;
  department_id: number;
  year: number;
  week: number;
  ten_cong_ty: string | null;
}
export interface WeekInfo {
  year: number;
  week: number;
  start: string; // YYYY-MM-DD (thứ Hai)
  end: string; // chủ nhật
  next_year: number;
  next_week: number;
  next_start: string;
  next_end: string;
}
export interface WeeklyData {
  week: WeekInfo;
  department_id: number;
  department_name: string | null;
  report: WeeklyReportRow | null;
  ten_cong_ty: string;
  rows: WeeklyRow[];
}

const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

// Thứ Hai của tuần ISO (năm, tuần).
function mondayOfIsoWeek(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (dow - 1) + (week - 1) * 7);
  return monday;
}
function isoWeekOf(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { year: t.getUTCFullYear(), week: Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7) };
}
export function weekInfo(year: number, week: number): WeekInfo {
  const mon = mondayOfIsoWeek(year, week);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const nmon = new Date(mon);
  nmon.setUTCDate(mon.getUTCDate() + 7);
  const nsun = new Date(nmon);
  nsun.setUTCDate(nmon.getUTCDate() + 6);
  const n = isoWeekOf(nmon);
  return { year, week, start: iso(mon), end: iso(sun), next_year: n.year, next_week: n.week, next_start: iso(nmon), next_end: iso(nsun) };
}
export function validateWeek(yearRaw: unknown, weekRaw: unknown): { year: number; week: number } {
  const year = Number(yearRaw);
  const week = Number(weekRaw);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new WeeklyReportError("Năm không hợp lệ.");
  if (!Number.isInteger(week) || week < 1 || week > 53) throw new WeeklyReportError("Tuần không hợp lệ (1–53).");
  return { year, week };
}

const txt = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).replace(/\r\n/g, "\n").trim();
  return s === "" ? null : s;
};

// Các trường nhập theo từng mục.
const FIELDS: Record<WeeklySection, (keyof WeeklyRow)[]> = {
  A: ["mang_cong_viec", "muc_tieu", "noi_dung", "tien_do", "ke_hoach"],
  B1: ["ten", "chu_tri", "tien_do", "noi_dung", "kho_khan", "de_xuat", "ke_hoach", "trang_thai"],
  B2: ["ten", "chu_tri", "tien_do", "noi_dung", "kho_khan", "de_xuat", "ke_hoach", "trang_thai"],
  C: ["ten", "chu_tri", "tien_do", "kho_khan", "de_xuat", "ke_hoach", "trang_thai"],
};
function normalizeRow(section: WeeklySection, input: Record<string, unknown>) {
  const out: Record<string, string | null> = {};
  for (const f of FIELDS[section]) out[f as string] = txt(input[f as string]);
  if (section === "A") {
    if (!out.mang_cong_viec) throw new WeeklyReportError('Hãy nhập "Mảng công việc".');
    if (!out.muc_tieu && !out.noi_dung) throw new WeeklyReportError('Hãy nhập "Mục tiêu" hoặc "Nội dung công việc".');
  } else if (!out.ten) {
    throw new WeeklyReportError(section === "C" ? 'Hãy nhập "Văn bản".' : 'Hãy nhập "Nhiệm vụ".');
  }
  if (out.trang_thai && !(WEEKLY_STATUSES as readonly string[]).includes(out.trang_thai)) {
    throw new WeeklyReportError(`Trạng thái phải là một trong: ${WEEKLY_STATUSES.join(", ")}.`);
  }
  return out;
}

// Báo cáo có thay đổi nội dung -> cập nhật updated_at (để người được chia sẻ thấy "có cập nhật mới").
async function touch(reportId: number) {
  await db("weekly_reports").where({ id: reportId }).update({ updated_at: db.fn.now() });
}

export async function deptName(departmentId: number): Promise<string | null> {
  const d = (await db("departments").where({ id: departmentId }).select("name").first()) as { name: string } | undefined;
  return d?.name ?? null;
}
export async function findReport(departmentId: number, year: number, week: number) {
  return (await db("weekly_reports").where({ department_id: departmentId, year, week }).first()) as WeeklyReportRow | undefined;
}
export async function getOrCreateReport(departmentId: number, year: number, week: number, by: string | null) {
  const hit = await findReport(departmentId, year, week);
  if (hit) return hit;
  const [row] = await db("weekly_reports").insert({ department_id: departmentId, year, week, created_by: by }).returning("*");
  return row as WeeklyReportRow;
}

export async function getWeekly(departmentId: number, year: number, week: number): Promise<WeeklyData> {
  const report = (await findReport(departmentId, year, week)) ?? null;
  const rows = report ? ((await db("weekly_report_rows").where({ report_id: report.id }).orderBy("thu_tu", "asc").orderBy("id", "asc")) as WeeklyRow[]) : [];
  return {
    week: weekInfo(year, week),
    department_id: departmentId,
    department_name: await deptName(departmentId),
    report,
    ten_cong_ty: report?.ten_cong_ty?.trim() || DEFAULT_COMPANY,
    rows,
  };
}

export async function createRow(departmentId: number, year: number, week: number, section: unknown, input: Record<string, unknown>, scope: DataScope, by: string | null): Promise<WeeklyRow> {
  assertDepartmentInScope(scope, departmentId);
  if (!WEEKLY_SECTIONS.includes(section as WeeklySection)) throw new WeeklyReportError("Mục không hợp lệ.");
  const sec = section as WeeklySection;
  const fields = normalizeRow(sec, input);
  // Nhiệm vụ trực tiếp / Văn bản VOffice: Chủ trì luôn là phòng ban đang lập báo cáo (không sửa được).
  if (sec === "B2" || sec === "C") fields.chu_tri = await deptName(departmentId);
  const report = await getOrCreateReport(departmentId, year, week, by);
  const max = (await db("weekly_report_rows").where({ report_id: report.id, section: sec }).max({ m: "thu_tu" }).first()) as { m: number | null } | undefined;
  const [row] = await db("weekly_report_rows")
    .insert({ report_id: report.id, section: sec, thu_tu: Number(max?.m ?? 0) + 1, ...fields })
    .returning("*");
  await touch(report.id);
  return row as WeeklyRow;
}

async function rowWithReport(id: number) {
  const row = (await db("weekly_report_rows").where({ id }).first()) as WeeklyRow | undefined;
  if (!row) return undefined;
  const report = (await db("weekly_reports").where({ id: row.report_id }).first()) as WeeklyReportRow;
  return { row, report };
}

export async function updateRow(id: number, input: Record<string, unknown>, scope: DataScope): Promise<WeeklyRow | undefined> {
  const hit = await rowWithReport(id);
  if (!hit) return undefined;
  assertDepartmentInScope(scope, hit.report.department_id);
  const fields = normalizeRow(hit.row.section, input);
  if (hit.row.section === "B2" || hit.row.section === "C") fields.chu_tri = await deptName(hit.report.department_id);
  const [row] = await db("weekly_report_rows").where({ id }).update({ ...fields, updated_at: db.fn.now() }).returning("*");
  await touch(hit.report.id);
  return row as WeeklyRow;
}

export async function deleteRow(id: number, scope: DataScope): Promise<boolean> {
  const hit = await rowWithReport(id);
  if (!hit) return false;
  assertDepartmentInScope(scope, hit.report.department_id);
  await db("weekly_report_rows").where({ id }).delete();
  await touch(hit.report.id);
  return true;
}

// Đổi vị trí 1 dòng trong mục (lên/xuống) bằng cách hoán đổi thu_tu với dòng liền kề.
export async function moveRow(id: number, direction: "up" | "down", scope: DataScope): Promise<boolean> {
  const hit = await rowWithReport(id);
  if (!hit) return false;
  assertDepartmentInScope(scope, hit.report.department_id);
  const siblings = (await db("weekly_report_rows").where({ report_id: hit.row.report_id, section: hit.row.section }).orderBy("thu_tu", "asc").orderBy("id", "asc")) as WeeklyRow[];
  const i = siblings.findIndex((r) => r.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= siblings.length) return true;
  await db.transaction(async (trx) => {
    // Đánh lại thu_tu liên tục rồi hoán đổi (tránh trùng giá trị thu_tu).
    const order = siblings.map((r) => r.id);
    [order[i], order[j]] = [order[j], order[i]];
    for (let k = 0; k < order.length; k++) await trx("weekly_report_rows").where({ id: order[k] }).update({ thu_tu: k + 1 });
  });
  await touch(hit.report.id);
  return true;
}

export async function setCompany(departmentId: number, year: number, week: number, tenCongTy: unknown, scope: DataScope, by: string | null): Promise<WeeklyData> {
  assertDepartmentInScope(scope, departmentId);
  const report = await getOrCreateReport(departmentId, year, week, by);
  await db("weekly_reports").where({ id: report.id }).update({ ten_cong_ty: txt(tenCongTy), updated_at: db.fn.now() });
  return getWeekly(departmentId, year, week);
}

// Sao chép từ tuần liền trước (cùng phòng ban): "Kế hoạch tuần N" của tuần trước trở thành nội dung/tiến độ khởi đầu của tuần này;
// các trường kết quả/khó khăn/đề xuất/kế hoạch để trống để nhập mới; Trạng thái giữ như tuần trước, dòng đã Hoàn thành thì bỏ qua. Chỉ khi tuần này chưa có dòng nào.
export async function copyFromPrevious(departmentId: number, year: number, week: number, scope: DataScope, by: string | null): Promise<{ copied: number; skipped: number }> {
  assertDepartmentInScope(scope, departmentId);
  const cur = await findReport(departmentId, year, week);
  if (cur) {
    const n = (await db("weekly_report_rows").where({ report_id: cur.id }).count({ c: "*" }).first()) as { c: number | string } | undefined;
    if (Number(n?.c ?? 0) > 0) throw new WeeklyReportError("Tuần này đã có dữ liệu — không thể sao chép đè.");
  }
  const mon = mondayOfIsoWeek(year, week);
  mon.setUTCDate(mon.getUTCDate() - 7);
  const prev = isoWeekOf(mon);
  const prevReport = await findReport(departmentId, prev.year, prev.week);
  if (!prevReport) throw new WeeklyReportError("Tuần liền trước chưa có báo cáo để sao chép.");
  const prevRows = (await db("weekly_report_rows").where({ report_id: prevReport.id }).orderBy("thu_tu", "asc").orderBy("id", "asc")) as WeeklyRow[];
  if (!prevRows.length) throw new WeeklyReportError("Tuần liền trước chưa có dòng nào để sao chép.");
  const report = await getOrCreateReport(departmentId, year, week, by);
  if (!cur && prevReport.ten_cong_ty) await db("weekly_reports").where({ id: report.id }).update({ ten_cong_ty: prevReport.ten_cong_ty });
  // Mục B/C: giữ nguyên Trạng thái hiện tại của tuần trước; dòng đã "Hoàn thành" thì bỏ qua (không chuyển sang tuần mới). Mục A không có trạng thái -> chép hết.
  const carry = prevRows.filter((r) => r.section === "A" || r.trang_thai !== "Hoàn thành");
  if (!carry.length) throw new WeeklyReportError("Tuần liền trước chỉ còn các dòng đã hoàn thành — không có gì để sao chép.");
  for (const r of carry) {
    await db("weekly_report_rows").insert({
      report_id: report.id,
      section: r.section,
      thu_tu: r.thu_tu,
      mang_cong_viec: r.mang_cong_viec,
      muc_tieu: r.muc_tieu,
      ten: r.ten,
      chu_tri: r.chu_tri,
      noi_dung: r.section === "A" ? r.ke_hoach ?? r.noi_dung : r.noi_dung,
      tien_do: null,
      kho_khan: null,
      de_xuat: null,
      ke_hoach: null,
      trang_thai: r.section === "A" ? null : r.trang_thai,
    });
  }
  await touch(report.id);
  return { copied: carry.length, skipped: prevRows.length - carry.length };
}
