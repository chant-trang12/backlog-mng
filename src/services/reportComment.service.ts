import { db } from "../db/database.js";
import { assertDepartmentInScope, type DataScope } from "./scope.util.js";
import { ReportError } from "./reportTemplate.service.js";

// Góp ý theo đầu mục của báo cáo PowerPoint (người duyệt như sếp góp ý, người lập báo cáo đánh dấu "Đã xử lý").
export interface ReportComment {
  id: number;
  report_id: number;
  field_code: string;
  slide_no: number | null;
  content: string;
  status: "open" | "resolved";
  author_id: number | null;
  author_name: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}
export interface CommentUser {
  id: number | null;
  name: string | null;
  canDeleteAny: boolean;
}

async function reportOf(id: number) {
  return (await db("reports").where({ id, is_deleted: false }).first()) as any | undefined;
}

export async function listReportComments(reportId: number): Promise<ReportComment[]> {
  return (await db("report_comments").where({ report_id: reportId, is_deleted: false }).orderBy("created_at", "asc").orderBy("id", "asc")) as ReportComment[];
}

export async function addComment(reportId: number, code: string, content: string, user: CommentUser, scope: DataScope): Promise<ReportComment> {
  const report = await reportOf(reportId);
  if (!report) throw new ReportError("Không tìm thấy báo cáo.");
  assertDepartmentInScope(scope, report.department_id);
  const text = content.trim();
  if (!text) throw new ReportError("Hãy nhập nội dung góp ý.");
  if (text.length > 2000) throw new ReportError("Góp ý tối đa 2000 ký tự.");
  const tpl = (await db("report_templates").where({ department_id: report.department_id, period_type: report.period_type }).first()) as any;
  const field = tpl ? ((await db("report_template_fields").where({ template_id: tpl.id, code }).first()) as any) : undefined;
  if (!field) throw new ReportError("Không tìm thấy đầu mục để góp ý.");
  const [row] = await db("report_comments")
    .insert({ report_id: reportId, field_code: code, slide_no: field.slide_no ?? null, content: text, author_id: user.id, author_name: user.name })
    .returning("*");
  return row as ReportComment;
}

export async function setCommentStatus(commentId: number, status: string, user: CommentUser, scope: DataScope): Promise<ReportComment | undefined> {
  if (status !== "open" && status !== "resolved") throw new ReportError("Trạng thái không hợp lệ.");
  const c = (await db("report_comments").where({ id: commentId, is_deleted: false }).first()) as ReportComment | undefined;
  if (!c) return undefined;
  const report = await reportOf(c.report_id);
  if (!report) return undefined;
  assertDepartmentInScope(scope, report.department_id);
  const [row] = await db("report_comments")
    .where({ id: commentId })
    .update(status === "resolved" ? { status, resolved_by: user.name, resolved_at: db.fn.now() } : { status, resolved_by: null, resolved_at: null })
    .returning("*");
  return row as ReportComment;
}

export async function deleteComment(commentId: number, user: CommentUser, scope: DataScope): Promise<boolean> {
  const c = (await db("report_comments").where({ id: commentId, is_deleted: false }).first()) as ReportComment | undefined;
  if (!c) return false;
  const report = await reportOf(c.report_id);
  if (!report) return false;
  assertDepartmentInScope(scope, report.department_id);
  // Chỉ người viết (hoặc admin/subadmin; hoặc khi chưa bật đăng nhập SSO) mới xoá được góp ý.
  if (!user.canDeleteAny && user.id != null && c.author_id !== user.id) throw new ReportError("Chỉ người viết góp ý (hoặc admin) mới xóa được.");
  await db("report_comments").where({ id: commentId }).update({ is_deleted: true, deleted_at: db.fn.now() });
  return true;
}

// Số góp ý CHƯA XỬ LÝ của mọi báo cáo thuộc 1 phòng ban — dùng cho chấm đỏ ở menu (giống Yêu cầu tính năng).
export async function openCommentCount(departmentId: number): Promise<number> {
  const row = (await db("report_comments as c")
    .join("reports as r", "r.id", "c.report_id")
    .where({ "r.department_id": departmentId, "r.is_deleted": false, "c.is_deleted": false, "c.status": "open" })
    .count({ n: "*" })
    .first()) as any;
  return Number(row?.n ?? 0);
}
