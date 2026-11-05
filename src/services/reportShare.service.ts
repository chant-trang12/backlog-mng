import { db } from "../db/database.js";
import { isDepartmentInScope, assertDepartmentInScope, ScopeForbiddenError, type DataScope } from "./scope.util.js";
import { ReportError } from "./reportTemplate.service.js";
import { periodLabel, type PeriodType } from "./reportPeriod.util.js";

// Người đang thao tác (từ req.appUser) — dùng để xét quyền truy cập báo cáo được chia sẻ.
export interface Actor {
  userId: number | null;
  departmentId: number | null;
  name: string | null;
  // Mọi phòng ban "tôi đang đại diện": phòng của tài khoản + phòng đang chọn ở bộ chuyển phòng ban (admin/full-access, hoặc chưa bật SSO
  // — khi đó không có tài khoản/phòng gốc nên phòng đang chọn là danh tính duy nhất).
  departmentIds?: number[];
  viewDepartmentId?: number | null;
}
const deptIds = (a: Actor): number[] => [...new Set([...(a.departmentIds ?? []), ...(a.departmentId != null ? [a.departmentId] : [])])];
// Khoá ghi nhận "đã mở": id tài khoản; không có tài khoản (chưa bật SSO) thì dùng -id phòng ban đang chọn.
const viewKey = (a: Actor): number | null => a.userId ?? (a.viewDepartmentId != null ? -a.viewDepartmentId : null);

async function reportOf(id: number) {
  return (await db("reports").where({ id, is_deleted: false }).first()) as any | undefined;
}

// Báo cáo có được chia sẻ cho người này (trực tiếp hoặc cho cả phòng của họ) không.
export async function isSharedWith(reportId: number, actor: Actor): Promise<boolean> {
  const ids = deptIds(actor);
  if (actor.userId == null && ids.length === 0) return false;
  const q = db("report_shares").where({ report_id: reportId }).where((b) => {
    if (actor.userId != null) b.orWhere({ share_type: "user", user_id: actor.userId });
    if (ids.length) b.orWhere((c) => c.where({ share_type: "department" }).whereIn("department_id", ids));
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
  const ids = deptIds(actor);
  if (actor.userId == null && ids.length === 0) return [];
  const shares = (await db("report_shares as s")
    .join("reports as r", "r.id", "s.report_id")
    .join("departments as d", "d.id", "r.department_id")
    .where("r.is_deleted", false)
    .where((b) => {
      if (actor.userId != null) b.orWhere({ "s.share_type": "user", "s.user_id": actor.userId });
      if (ids.length) b.orWhere((c) => c.where({ "s.share_type": "department" }).whereIn("s.department_id", ids));
    })
    .select("s.report_id", "s.shared_by", "s.created_at as shared_at", "r.period_type", "r.year", "r.idx", "r.status", "d.name as department_name")) as any[];
  const byReport = new Map<number, any>();
  for (const s of shares) if (!byReport.has(s.report_id) || String(s.shared_at) > String(byReport.get(s.report_id).shared_at)) byReport.set(s.report_id, s);
  const reportIds = [...byReport.keys()];
  // Lần cuối tôi mở từng báo cáo (viewed_at) — mốc để tính "có cập nhật mới" từ lúc đó.
  const key = viewKey(actor);
  const viewedAt = new Map<number, any>();
  if (key != null && reportIds.length) {
    const rows = (await db("report_share_views").where({ user_id: key }).whereIn("report_id", reportIds).select("report_id", "viewed_at")) as any[];
    for (const r of rows) viewedAt.set(Number(r.report_id), r.viewed_at);
  }
  // Cập nhật mới = góp ý mới của người khác + góp ý được Xử lý + nội dung báo cáo bị sửa, tất cả SAU lần mở gần nhất.
  const updates = new Map<number, number>();
  for (const id of reportIds) {
    const v = viewedAt.get(id);
    if (v == null) continue;
    const base = () => db("report_comments").where({ report_id: id, is_deleted: false });
    const cnt = async (q: any) => Number(((await q.count({ n: "*" }).first()) as any)?.n ?? 0);
    const fresh = await cnt(base().where("created_at", ">", v).where((b) => (actor.userId != null ? b.whereNull("author_id").orWhereNot("author_id", actor.userId) : b)));
    const resolved = await cnt(base().where({ status: "resolved" }).where("resolved_at", ">", v));
    const changed = Number(((await db("reports").where({ id }).where("updated_at", ">", v).count({ n: "*" }).first()) as any)?.n ?? 0);
    updates.set(id, fresh + resolved + (changed > 0 ? 1 : 0));
  }
  const open = new Map<number, number>();
  if (reportIds.length) {
    const rows = (await db("report_comments").whereIn("report_id", reportIds).where({ is_deleted: false, status: "open" }).groupBy("report_id").select("report_id").count({ n: "*" })) as any[];
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
      is_new: !viewedAt.has(s.report_id),
      update_count: updates.get(s.report_id) ?? 0,
      open_comments: open.get(s.report_id) ?? 0,
    }))
    .sort((a, b) => String(b.shared_at).localeCompare(String(a.shared_at)));
}

export async function unseenSharedCount(actor: Actor): Promise<number> {
  // Số báo cáo được chia sẻ cần chú ý: MỚI (chưa mở lần nào) hoặc CÓ CẬP NHẬT từ lần mở gần nhất.
  return (await sharedWithMe(actor)).filter((r) => r.is_new || r.update_count > 0).length;
}

export async function markViewed(reportId: number, actor: Actor) {
  const key = viewKey(actor);
  if (key == null) return;
  // Mỗi lần mở = "đã xem tới thời điểm này" -> các cập nhật trước đó hết là mới.
  const hit = await db("report_share_views").where({ report_id: reportId, user_id: key }).first();
  if (hit) await db("report_share_views").where({ id: hit.id }).update({ viewed_at: db.fn.now() });
  else await db("report_share_views").insert({ report_id: reportId, user_id: key });
}
