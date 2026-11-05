import { db } from "../db/database.js";
import { assertDepartmentInScope, type DataScope } from "./scope.util.js";
import { ReportError } from "./reportTemplate.service.js";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB / ảnh
export interface ImageMeta {
  has_image: boolean;
  file_name: string | null;
  mime: string | null;
  size_bytes: number;
  caption: string;
  updated_at: string | null;
}

// Nhận diện PNG/JPEG theo chữ ký file (không tin phần mở rộng/Content-Type do client gửi).
export function sniffImage(buf: Buffer): { ext: "png" | "jpg"; mime: string } | null {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { ext: "png", mime: "image/png" };
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  return null;
}

async function reportOf(id: number) {
  return (await db("reports").where({ id, is_deleted: false }).first()) as any | undefined;
}
async function checkField(report: any, code: string) {
  const tpl = (await db("report_templates").where({ department_id: report.department_id, period_type: report.period_type }).first()) as any;
  const f = tpl ? ((await db("report_template_fields").where({ template_id: tpl.id, code }).first()) as any) : undefined;
  if (!f || f.kind !== "image") throw new ReportError("Đầu mục này không phải kiểu Hình ảnh.");
}

const emptyMeta = (): ImageMeta => ({ has_image: false, file_name: null, mime: null, size_bytes: 0, caption: "", updated_at: null });

// Thông tin ảnh (KHÔNG kèm dữ liệu ảnh) của mọi đầu mục ảnh trong 1 báo cáo.
export async function imageMetaByCode(reportId: number): Promise<Map<string, ImageMeta>> {
  const rows = (await db("report_images").where({ report_id: reportId }).select("field_code", "file_name", "mime", "size_bytes", "caption", "updated_at")) as any[];
  return new Map(rows.map((r) => [r.field_code, { has_image: true, file_name: r.file_name, mime: r.mime, size_bytes: Number(r.size_bytes), caption: r.caption ?? "", updated_at: r.updated_at }]));
}
export async function imageRowsForExport(reportId: number) {
  return (await db("report_images").where({ report_id: reportId })) as any[];
}

export async function saveImage(reportId: number, code: string, buf: Buffer, fileName: string | null, scope: DataScope): Promise<ImageMeta> {
  const report = await reportOf(reportId);
  if (!report) throw new ReportError("Không tìm thấy báo cáo.");
  assertDepartmentInScope(scope, report.department_id);
  await checkField(report, code);
  if (buf.length === 0) throw new ReportError("Thiếu file ảnh.");
  if (buf.length > MAX_IMAGE_BYTES) throw new ReportError("Ảnh vượt quá 5 MB — hãy chọn ảnh nhỏ hơn.");
  const kind = sniffImage(buf);
  if (!kind) throw new ReportError("Chỉ nhận ảnh PNG hoặc JPG.");
  const hit = await db("report_images").where({ report_id: reportId, field_code: code }).first();
  const row = { file_name: fileName?.slice(0, 255) ?? null, mime: kind.mime, size_bytes: buf.length, data: buf };
  if (hit) await db("report_images").where({ id: hit.id }).update({ ...row, updated_at: db.fn.now() });
  else await db("report_images").insert({ report_id: reportId, field_code: code, ...row });
  await db("reports").where({ id: reportId }).update({ updated_at: db.fn.now(), rev: db.raw("rev + 1"), status: "draft" });
  return (await imageMetaByCode(reportId)).get(code) ?? emptyMeta();
}

export async function setCaption(reportId: number, code: string, caption: string, scope: DataScope): Promise<ImageMeta> {
  const report = await reportOf(reportId);
  if (!report) throw new ReportError("Không tìm thấy báo cáo.");
  assertDepartmentInScope(scope, report.department_id);
  const text = caption.replace(/\s+/g, " ").trim().slice(0, 200);
  const n = await db("report_images").where({ report_id: reportId, field_code: code }).update({ caption: text || null, updated_at: db.fn.now() });
  if (!n) throw new ReportError("Chưa có ảnh để thêm chú thích.");
  await db("reports").where({ id: reportId }).update({ updated_at: db.fn.now(), rev: db.raw("rev + 1"), status: "draft" });
  return (await imageMetaByCode(reportId)).get(code) ?? emptyMeta();
}

export async function deleteImage(reportId: number, code: string, scope: DataScope): Promise<void> {
  const report = await reportOf(reportId);
  if (!report) throw new ReportError("Không tìm thấy báo cáo.");
  assertDepartmentInScope(scope, report.department_id);
  await db("report_images").where({ report_id: reportId, field_code: code }).delete();
  await db("reports").where({ id: reportId }).update({ updated_at: db.fn.now(), rev: db.raw("rev + 1"), status: "draft" });
}

export async function getImageFile(reportId: number, code: string, scope: DataScope) {
  const report = await reportOf(reportId);
  if (!report) return null;
  assertDepartmentInScope(scope, report.department_id);
  return (await db("report_images").where({ report_id: reportId, field_code: code }).first()) as { mime: string; data: Buffer; file_name: string | null } | undefined;
}
