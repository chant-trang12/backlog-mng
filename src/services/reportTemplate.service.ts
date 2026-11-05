import { db } from "../db/database.js";
import { assertDepartmentInScope, type DataScope } from "./scope.util.js";
import { scanPptx } from "./pptx.service.js";
import { PERIOD_TYPES, type PeriodType } from "./reportPeriod.util.js";

export class ReportError extends Error {}

export type FieldKind = "auto" | "table" | "list" | "paragraph" | "image";
export type FieldSource = "manual" | "sum" | "suggest" | "last" | "prior_year" | "auto";
export const FIELD_KINDS: FieldKind[] = ["auto", "table", "list", "paragraph", "image"];
export const SOURCES_BY_KIND: Record<FieldKind, FieldSource[]> = {
  auto: ["auto"],
  table: ["manual", "sum", "last", "prior_year"],
  list: ["manual", "suggest", "last"],
  paragraph: ["manual", "last"],
  image: ["manual"],
};

export interface TemplateField {
  id: number;
  template_id: number;
  code: string;
  label: string;
  slide_no: number | null;
  kind: FieldKind;
  required: boolean;
  source: FieldSource;
  carry_over: boolean;
  thu_tu: number;
  is_hidden: boolean;
}

const humanize = (code: string) => {
  const t = code.replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

// Đoán kiểu/nguồn mặc định từ tên mã — người dùng chỉnh lại ở bảng "Đầu mục báo cáo".
function defaultsFor(code: string, hasRowTokens: boolean, type: PeriodType) {
  let kind: FieldKind = "list";
  if (code === "ky_bao_cao") kind = "auto";
  else if (/^(anh|hinh|img|image)(_|$)/.test(code)) kind = "image";
  else if (hasRowTokens || /ket_qua|chi_tieu|_kd|so_sanh|bang/.test(code)) kind = "table";
  else if (/danh_gia|nhan_xet|tong_ket|y_kien|ghi_chu/.test(code)) kind = "paragraph";
  let source: FieldSource = "manual";
  if (kind === "auto") source = "auto";
  else if (type !== "month") {
    if (kind === "table") source = /so_sanh/.test(code) ? "prior_year" : "sum";
    else if (kind === "list") source = /ton_tai|vuong_mac/.test(code) ? "last" : "suggest";
  } else if (kind === "table" && /so_sanh/.test(code)) source = "prior_year";
  return {
    kind,
    source,
    required: kind !== "auto" && kind !== "image" && !/so_sanh/.test(code),
    carry_over: kind === "list" && /ton_tai|vuong_mac/.test(code),
  };
}

const user = (name?: string | null) => name ?? null;

export async function listTemplates(departmentId: number) {
  const rows = await db("report_templates").where({ department_id: departmentId }).select("id", "period_type", "file_name", "slide_count", "size_bytes", "version", "uploaded_by", "uploaded_at");
  const out = [];
  for (const type of PERIOD_TYPES) {
    const t = (rows as any[]).find((r) => r.period_type === type);
    if (!t) {
      out.push({ period_type: type, exists: false });
      continue;
    }
    const fieldCount = Number((await db("report_template_fields").where({ template_id: t.id, is_hidden: false }).count({ c: "*" }).first() as any)?.c ?? 0);
    const used = Number((await db("reports").where({ template_id: t.id, is_deleted: false }).count({ c: "*" }).first() as any)?.c ?? 0);
    out.push({ ...t, exists: true, field_count: fieldCount, used_count: used });
  }
  return out;
}

export async function getTemplate(departmentId: number, type: PeriodType) {
  const t = (await db("report_templates").where({ department_id: departmentId, period_type: type }).select("id", "period_type", "file_name", "slide_count", "size_bytes", "version", "uploaded_by", "uploaded_at").first()) as any;
  if (!t) return null;
  const fields = (await db("report_template_fields").where({ template_id: t.id }).orderBy("thu_tu", "asc")) as TemplateField[];
  return { ...t, fields };
}

export async function getTemplateFile(departmentId: number, type: PeriodType) {
  return (await db("report_templates").where({ department_id: departmentId, period_type: type }).first()) as any;
}

export interface TemplateDiff {
  kept: string[];
  added: string[];
  removed: string[];
}

// Tải/thay file mẫu. dryRun=true: chỉ phân tích, trả diff (mã giữ nguyên/mới/bị bỏ) mà KHÔNG ghi gì.
export async function uploadTemplate(
  departmentId: number,
  type: PeriodType,
  buffer: Buffer,
  fileName: string,
  byUser: string | null,
  scope: DataScope,
  dryRun: boolean,
) {
  assertDepartmentInScope(scope, departmentId);
  const scan = await scanPptx(buffer);
  if (scan.codes.length === 0) {
    throw new ReportError("Không tìm thấy mã giữ chỗ nào dạng {{ten_ma}} trong file — hãy thay phần nội dung thay đổi bằng mã rồi tải lại.");
  }
  const existing = (await db("report_templates").where({ department_id: departmentId, period_type: type }).first()) as any;
  const oldFields = existing ? ((await db("report_template_fields").where({ template_id: existing.id })) as TemplateField[]) : [];
  const newCodes = new Set(scan.codes.map((c) => c.code));
  const oldActive = new Set(oldFields.filter((f) => !f.is_hidden).map((f) => f.code));
  const diff: TemplateDiff = {
    kept: scan.codes.filter((c) => oldActive.has(c.code)).map((c) => c.code),
    added: scan.codes.filter((c) => !oldActive.has(c.code)).map((c) => c.code),
    removed: [...oldActive].filter((c) => !newCodes.has(c)),
  };
  const summary = { slide_count: scan.slide_count, code_count: scan.codes.length, size_bytes: buffer.length, file_name: fileName, replacing: !!existing };
  if (dryRun) return { diff, summary };

  await db.transaction(async (trx) => {
    let templateId: number;
    if (existing) {
      templateId = existing.id;
      await trx("report_templates").where({ id: templateId }).update({
        file_name: fileName, slide_count: scan.slide_count, size_bytes: buffer.length, file_data: buffer,
        version: Number(existing.version) + 1, uploaded_by: user(byUser), uploaded_at: trx.fn.now(),
      });
    } else {
      const [row] = await trx("report_templates")
        .insert({ department_id: departmentId, period_type: type, file_name: fileName, slide_count: scan.slide_count, size_bytes: buffer.length, file_data: buffer, uploaded_by: user(byUser) })
        .returning("id");
      templateId = typeof row === "object" ? (row as any).id : (row as number);
    }
    const byCode = new Map(oldFields.map((f) => [f.code, f]));
    let order = 0;
    for (const c of scan.codes) {
      const old = byCode.get(c.code);
      if (old) {
        await trx("report_template_fields").where({ id: old.id }).update({ slide_no: c.slide_no, thu_tu: order, is_hidden: false });
      } else {
        const d = defaultsFor(c.code, c.has_row_tokens, type);
        await trx("report_template_fields").insert({ template_id: templateId, code: c.code, label: humanize(c.code), slide_no: c.slide_no, thu_tu: order, ...d });
      }
      order++;
    }
    // Mã bị bỏ: ẩn đi, KHÔNG xoá dữ liệu.
    for (const code of diff.removed) await trx("report_template_fields").where({ template_id: templateId, code }).update({ is_hidden: true });
  });
  return { diff, summary, template: await getTemplate(departmentId, type) };
}

export interface FieldInput {
  id: number;
  label?: string;
  kind?: string;
  required?: boolean;
  source?: string;
  carry_over?: boolean;
  thu_tu?: number;
}

export async function updateTemplateFields(departmentId: number, type: PeriodType, inputs: FieldInput[], scope: DataScope) {
  assertDepartmentInScope(scope, departmentId);
  const t = (await db("report_templates").where({ department_id: departmentId, period_type: type }).first()) as any;
  if (!t) throw new ReportError("Chưa có file mẫu cho loại kỳ này.");
  const fields = (await db("report_template_fields").where({ template_id: t.id })) as TemplateField[];
  await db.transaction(async (trx) => {
    for (const inp of inputs) {
      const cur = fields.find((f) => f.id === inp.id);
      if (!cur) continue;
      const kind = (FIELD_KINDS as string[]).includes(String(inp.kind)) ? (inp.kind as FieldKind) : cur.kind;
      let source = (inp.source ?? cur.source) as FieldSource;
      if (!SOURCES_BY_KIND[kind].includes(source)) source = SOURCES_BY_KIND[kind][0];
      const label = (inp.label ?? cur.label).toString().trim() || cur.label;
      await trx("report_template_fields").where({ id: cur.id }).update({
        label, kind, source,
        required: kind === "auto" ? false : inp.required ?? cur.required,
        carry_over: kind === "auto" ? false : inp.carry_over ?? cur.carry_over,
        thu_tu: Number.isInteger(inp.thu_tu) ? inp.thu_tu : cur.thu_tu,
      });
    }
  });
  return getTemplate(departmentId, type);
}
