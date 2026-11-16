import { db } from "../db/database.js";
import { assertDepartmentInScope, isDepartmentInScope, ScopeForbiddenError, type DataScope } from "./scope.util.js";
import type { Actor } from "./reportShare.service.js";
import { getOrCreateReport, getWeekly, WeeklyReportError, type WeeklyData } from "./weeklyReport.service.js";

// Chia sẻ BC tuần cho người / phòng ban khác (giống Báo cáo PowerPoint): người nhận chỉ XEM + xuất PDF, không sửa nội dung.

const deptIds = (a: Actor): number[] => [...new Set([...(a.departmentIds ?? []), ...(a.departmentId != null ? [a.departmentId] : [])])];
const viewKey = (a: Actor): number | null => a.userId ?? (a.viewDepartmentId != null ? -a.viewDepartmentId : null);

async function reportOf(id: number) {
  return (await db("weekly_reports").where({ id }).first()) as { id: number; department_id: number; year: number; week: number; updated_at: string } | undefined;
}

export async function isSharedWith(reportId: number, actor: Actor): Promise<boolean> {
  const ids = deptIds(actor);
  if (actor.userId == null && ids.length === 0) return false;
  const q = db("weekly_report_shares").where({ report_id: reportId }).where((b) => {
    if (actor.userId != null) b.orWhere({ share_type: "user", user_id: actor.userId });
    if (ids.length) b.orWhere((c) => c.where({ share_type: "department" }).whereIn("department_id", ids));
  });
  return !!(await q.first());
}

export async function listShares(reportId: number, scope: DataScope) {
  const report = await reportOf(reportId);
  if (!report) throw new WeeklyReportError("Không tìm thấy báo cáo.");
  assertDepartmentInScope(scope, report.department_id);
  const rows = (await db("weekly_report_shares").where({ report_id: reportId }).orderBy("id", "asc")) as any[];
  const userIds = rows.map((r) => r.user_id).filter(Boolean);
  const users = userIds.length ? ((await db("users").whereIn("id", userIds).select("id", "name", "username", "department_id")) as any[]) : [];
  const depts = (await db("departments").select("id", "name")) as any[];
  const deptName = new Map(depts.map((d) => [d.id, d.name]));
  return rows.map((r) => {
    const u = users.find((x) => x.id === r.user_id);
    return {
      id: r.id,
      type: r.share_type,
      user_id: r.user_id,
      department_id: r.department_id,
      shared_by: r.shared_by,
      created_at: r.created_at,
      user_name: u ? u.name || u.username : null,
      user_department: u ? deptName.get(u.department_id) ?? null : null,
      department_name: r.department_id ? deptName.get(r.department_id) ?? null : null,
    };
  });
}

// Chia sẻ báo cáo của (phòng ban, năm, tuần) — tự tạo bản ghi báo cáo nếu tuần đó chưa có dòng nào.
export async function addShare(departmentId: number, year: number, week: number, input: { user_id?: number; department_id?: number }, by: Actor, scope: DataScope) {
  assertDepartmentInScope(scope, departmentId);
  const report = await getOrCreateReport(departmentId, year, week, by.name);
  const reportId = report.id;
  if (input.user_id) {
    const u = await db("users").where({ id: input.user_id, active: true }).first();
    if (!u) throw new WeeklyReportError("Không tìm thấy người dùng.");
    if (by.userId != null && u.id === by.userId) throw new WeeklyReportError("Không cần chia sẻ cho chính bạn.");
    if (await db("weekly_report_shares").where({ report_id: reportId, share_type: "user", user_id: u.id }).first()) throw new WeeklyReportError("Đã chia sẻ cho người này.");
    await db("weekly_report_shares").insert({ report_id: reportId, share_type: "user", user_id: u.id, shared_by: by.name, shared_by_id: by.userId });
  } else if (input.department_id) {
    const d = await db("departments").where({ id: input.department_id }).first();
    if (!d) throw new WeeklyReportError("Không tìm thấy phòng ban.");
    if (d.id === departmentId) throw new WeeklyReportError("Báo cáo đã thuộc phòng ban này.");
    if (await db("weekly_report_shares").where({ report_id: reportId, share_type: "department", department_id: d.id }).first()) throw new WeeklyReportError("Đã chia sẻ cho phòng ban này.");
    await db("weekly_report_shares").insert({ report_id: reportId, share_type: "department", department_id: d.id, shared_by: by.name, shared_by_id: by.userId });
  } else {
    throw new WeeklyReportError("Hãy chọn người hoặc phòng ban để chia sẻ.");
  }
  return reportId;
}

export async function removeShare(shareId: number, scope: DataScope): Promise<boolean> {
  const s = (await db("weekly_report_shares").where({ id: shareId }).first()) as any | undefined;
  if (!s) return false;
  const report = await reportOf(s.report_id);
  if (!report) return false;
  assertDepartmentInScope(scope, report.department_id);
  await db("weekly_report_shares").where({ id: shareId }).delete();
  return true;
}

// Danh sách BC tuần được chia sẻ cho tôi (trực tiếp hoặc cho phòng của tôi): "mới" = chưa mở lần nào; update_count = có thay đổi nội dung sau lần mở gần nhất.
export async function sharedWithMe(actor: Actor) {
  const ids = deptIds(actor);
  if (actor.userId == null && ids.length === 0) return [];
  const shares = (await db("weekly_report_shares as s")
    .join("weekly_reports as r", "r.id", "s.report_id")
    .join("departments as d", "d.id", "r.department_id")
    .where((b) => {
      if (actor.userId != null) b.orWhere({ "s.share_type": "user", "s.user_id": actor.userId });
      if (ids.length) b.orWhere((c) => c.where({ "s.share_type": "department" }).whereIn("s.department_id", ids));
    })
    .select("s.report_id", "s.shared_by", "s.created_at as shared_at", "r.year", "r.week", "r.updated_at", "d.name as department_name")) as any[];
  const byReport = new Map<number, any>();
  for (const s of shares) if (!byReport.has(s.report_id) || String(s.shared_at) > String(byReport.get(s.report_id).shared_at)) byReport.set(s.report_id, s);
  const reportIds = [...byReport.keys()];
  const key = viewKey(actor);
  const viewedAt = new Map<number, any>();
  if (key != null && reportIds.length) {
    const rows = (await db("weekly_report_views").where({ user_id: key }).whereIn("report_id", reportIds).select("report_id", "viewed_at")) as any[];
    for (const r of rows) viewedAt.set(Number(r.report_id), r.viewed_at);
  }
  return [...byReport.values()]
    .map((s) => {
      const v = viewedAt.get(s.report_id);
      return {
        report_id: s.report_id,
        year: s.year,
        week: s.week,
        department_name: s.department_name,
        shared_by: s.shared_by,
        shared_at: s.shared_at,
        is_new: v == null,
        update_count: v != null && String(s.updated_at) > String(v) ? 1 : 0,
      };
    })
    .sort((a, b) => String(b.shared_at).localeCompare(String(a.shared_at)));
}

export async function unseenSharedCount(actor: Actor): Promise<number> {
  return (await sharedWithMe(actor)).filter((r) => r.is_new || r.update_count > 0).length;
}

async function markViewed(reportId: number, actor: Actor) {
  const key = viewKey(actor);
  if (key == null) return;
  const hit = await db("weekly_report_views").where({ report_id: reportId, user_id: key }).first();
  if (hit) await db("weekly_report_views").where({ id: hit.id }).update({ viewed_at: db.fn.now() });
  else await db("weekly_report_views").insert({ report_id: reportId, user_id: key });
}

// Xem 1 BC tuần theo id: chủ (phòng ban trong phạm vi) hoặc người được chia sẻ. Người được chia sẻ mở = đã xem.
export async function viewReport(reportId: number, scope: DataScope, actor: Actor): Promise<WeeklyData & { access: "owner" | "shared" }> {
  const report = await reportOf(reportId);
  if (!report) throw new WeeklyReportError("Không tìm thấy báo cáo.");
  let access: "owner" | "shared";
  if (isDepartmentInScope(scope, report.department_id)) access = "owner";
  else if (await isSharedWith(reportId, actor)) access = "shared";
  else throw new ScopeForbiddenError();
  if (access === "shared") await markViewed(reportId, actor);
  return { ...(await getWeekly(report.department_id, report.year, report.week)), access };
}
