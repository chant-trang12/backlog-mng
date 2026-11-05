import { db } from "../db/database.js";
import { isDepartmentInScope, assertDepartmentInScope, ScopeForbiddenError, type DataScope } from "./scope.util.js";
import { ReportError } from "./reportTemplate.service.js";
import { periodLabel, type PeriodType } from "./reportPeriod.util.js";

// Người đang thao tác (từ req.appUser) — dùng để xét quyền truy cập báo cáo được chia sẻ.
export interface Actor {
  userId: number | null;
  departmentId: number | null;
  name: string | null;
}

async function reportOf(id: number) {
  return (await db("reports").where({ id, is_deleted: false }).first()) as any | undefined;
}

// Báo cáo có được chia sẻ cho người này (trực tiếp hoặc cho cả phòng của họ) không.
export async function isSharedWith(reportId: number, actor: Actor): Promise<boolean> {
  if (actor.userId == null && actor.departmentId == null) return false;
  const q = db("report_shares").where({ report_id: reportId }).where((b) => {
    if (actor.userId != null) b.orWhere({ share_type: "user", user_id: actor.userId });
    if (actor.departmentId != null) b.orWhere({ share_type: "department", department_id: actor.departmentId });
  });
  return !!(await q.first());
}

// Quyền XEM/góp ý/xuất: chủ (phòng ban nằm trong phạm vi) hoặc người được chia sẻ. Trả về "owner" | "shared".
export async function assertCanView(report: { id: number; department_id: number | null }, scope: DataScope, actor: Actor): Promise<"owner" | "shared"> {
  if (isDepartmentInScope(scope, report.department_id)) return "owner";
  if (await isSharedWith(report.id, actor)) return "shared";
  throw new ScopeForbiddenError();
}

const shareRow = async (r: any) => ({
  id: r.id,
  type: r.share_type,
  user_id: r.user_id,
  department_id: r.department_id,
  shared_by: r.shared_by,
  created_at: r.created_at,
});

export async function listShares(reportId: number, scope: DataScope) {
  const report = await reportOf(reportId);
  if (!report) throw new ReportError("Không tìm thấy báo cáo.");
  assertDepartmentInScope(scope, report.department_id);
  const rows = (await db("report_shares").where({ report_id: reportId }).orderBy("id", "asc")) as any[];
  const users = rows.length ? ((await db("users").whereIn("id", rows.map((r) => r.user_id).filter(Boolean)).select("id", "name", "username", "department_id")) as any[]) : [];
  const depts = (await db("departments").select("id", "name")) as any[];
  const deptName = new Map(depts.map((d) => [d.id, d.name]));
  return Promise.all(
    rows.map(async (r) => {
      const base = await shareRow(r);
      const u = users.find((x) => x.id === r.user_id);
      return { ...base, user_name: u ? u.name || u.username : null, user_department: u ? deptName.get(u.department_id) ?? null : null, department_name: r.department_id ? deptName.get(r.department_id) ?? null : null };
    }),
  );
}

export async function addShare(reportId: number, input: { user_id?: number; department_id?: number }, by: Actor, scope: DataScope) {
  const report = await reportOf(reportId);
  if (!report) throw new ReportError("Không tìm thấy báo cáo.");
  assertDepartmentInScope(scope, report.department_id);
  if (input.user_id) {
    const u = await db("users").where({ id: input.user_id, active: true }).first();
    if (!u) throw new ReportError("Không tìm thấy người dùng.");
    if (by.userId != null && u.id === by.userId) throw new ReportError("Không cần chia sẻ cho chính bạn.");
    if (await db("report_shares").where({ report_id: reportId, share_type: "user", user_id: u.id }).first()) throw new ReportError("Đã chia sẻ cho người này.");
    await db("report_shares").insert({ report_id: reportId, share_type: "user", user_id: u.id, shared_by: by.name, shared_by_id: by.userId });
  } else if (input.department_id) {
    const d = await db("departments").where({ id: input.department_id }).first();
    if (!d) throw new ReportError("Không tìm thấy phòng ban.");
    if (d.id === report.department_id) throw new ReportError("Báo cáo đã thuộc phòng ban này.");
    if (await db("report_shares").where({ report_id: reportId, share_type: "department", department_id: d.id }).first()) throw new ReportError("Đã chia sẻ cho phòng ban này.");
    await db("report_shares").insert({ report_id: reportId, share_type: "department", department_id: d.id, shared_by: by.name, shared_by_id: by.userId });
  } else {
    throw new ReportError("Hãy chọn người hoặc phòng ban để chia sẻ.");
  }
}

export async function removeShare(shareId: number, scope: DataScope): Promise<boolean> {
  const s = (await db("report_shares").where({ id: shareId }).first()) as any | undefined;
  if (!s) return false;
  const report = await reportOf(s.report_id);
  if (!report) return false;
  assertDepartmentInScope(scope, report.department_id);
  await db("report_shares").where({ id: shareId }).delete();
  return true;
}

// Danh bạ chọn người để chia sẻ (chỉ thông tin tối thiểu: tên, tài khoản, phòng ban).
export async function searchUsers(q: string, self: Actor) {
  const query = db("users as u").leftJoin("departments as d", "d.id", "u.department_id").where("u.active", true);
  const term = q.trim();
  if (term) query.where((b) => b.where("u.name", "like", `%${term}%`).orWhere("u.username", "like", `%${term}%`));
  if (self.userId != null) query.whereNot("u.id", self.userId);
  const rows = (await query.orderBy("u.name", "asc").limit(30).select("u.id", "u.name", "u.username", "u.department_id", "d.name as department_name")) as any[];
  return rows;
}

// Báo cáo được chia sẻ cho tôi (trực tiếp hoặc cho phòng của tôi) — kèm "mới" (chưa mở lần nào) + số góp ý chưa xử lý.
export async function sharedWithMe(actor: Actor) {
  if (actor.userId == null && actor.departmentId == null) return [];
  const shares = (await db("report_shares as s")
    .join("reports as r", "r.id", "s.report_id")
    .join("departments as d", "d.id", "r.department_id")
    .where("r.is_deleted", false)
    .where((b) => {
      if (actor.userId != null) b.orWhere({ "s.share_type": "user", "s.user_id": actor.userId });
      if (actor.departmentId != null) b.orWhere({ "s.share_type": "department", "s.department_id": actor.departmentId });
    })
    .select("s.report_id", "s.shared_by", "s.created_at as shared_at", "r.period_type", "r.year", "r.idx", "r.status", "d.name as department_name")) as any[];
  const byReport = new Map<number, any>();
  for (const s of shares) if (!byReport.has(s.report_id) || String(s.shared_at) > String(byReport.get(s.report_id).shared_at)) byReport.set(s.report_id, s);
  const ids = [...byReport.keys()];
  const viewed = new Set<number>(
    actor.userId != null && ids.length ? ((await db("report_share_views").where({ user_id: actor.userId }).whereIn("report_id", ids).pluck("report_id")) as number[]) : [],
  );
  const open = new Map<number, number>();
  if (ids.length) {
    const rows = (await db("report_comments").whereIn("report_id", ids).where({ is_deleted: false, status: "open" }).groupBy("report_id").select("report_id").count({ n: "*" })) as any[];
    for (const r of rows) open.set(Number(r.report_id), Number(r.n));
  }
  return [...byReport.values()]
    .map((s) => ({
      report_id: s.report_id,
      label: periodLabel(s.period_type as PeriodType, s.year, s.idx),
      period_type: s.period_type,
      department_name: s.department_name,
      status: s.status,
      shared_by: s.shared_by,
      shared_at: s.shared_at,
      is_new: !viewed.has(s.report_id),
      open_comments: open.get(s.report_id) ?? 0,
    }))
    .sort((a, b) => String(b.shared_at).localeCompare(String(a.shared_at)));
}

export async function unseenSharedCount(actor: Actor): Promise<number> {
  return (await sharedWithMe(actor)).filter((r) => r.is_new).length;
}

export async function markViewed(reportId: number, actor: Actor) {
  if (actor.userId == null) return;
  const hit = await db("report_share_views").where({ report_id: reportId, user_id: actor.userId }).first();
  if (!hit) await db("report_share_views").insert({ report_id: reportId, user_id: actor.userId });
}
