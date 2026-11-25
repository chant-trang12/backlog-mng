import { db } from "../db/database.js";
import { statsBySystem } from "./systemFeature.service.js";

export const SYSTEM_STATUSES = ["dang_phat_trien", "dang_van_hanh", "bao_tri", "ngung_su_dung"] as const;
export type SystemStatus = (typeof SYSTEM_STATUSES)[number];

export class SystemError extends Error {}

export interface DocType {
  key: string;
  label: string;
  sub?: string;
  required: boolean;
}

// 5 loại tài liệu mặc định (4 loại đầu được chọn sẵn như mẫu giao diện).
export const DEFAULT_DOC_TYPES: DocType[] = [
  { key: "dac_ta", label: "Đặc tả", sub: "Yêu cầu, use case", required: true },
  { key: "thiet_ke", label: "Thiết kế", sub: "Giao diện, CSDL, API", required: true },
  { key: "test_case", label: "Test case", sub: "Kịch bản kiểm thử", required: true },
  { key: "huong_dan", label: "Hướng dẫn sử dụng", sub: "Tài liệu cho người dùng", required: true },
  { key: "nghiem_thu", label: "Biên bản nghiệm thu", sub: "Xác nhận hoàn thành", required: false },
];

export async function nextSystemCode(): Promise<string> {
  const rows = (await db("he_thong_options").whereNotNull("ma_he_thong").select("ma_he_thong")) as any[];
  let max = 0;
  for (const r of rows) {
    const m = /^HT-(\d+)$/i.exec(String(r.ma_he_thong));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `HT-${String(max + 1).padStart(2, "0")}`;
}

function parseDocs(raw: unknown): DocType[] {
  if (typeof raw === "string" && raw) {
    try {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) return v as DocType[];
    } catch {
      /* dùng mặc định */
    }
  }
  return DEFAULT_DOC_TYPES.map((d) => ({ ...d }));
}

async function toView(r: any, depts: Map<number, string>, users: Map<number, string>, stats?: Map<number, { total: number; doing: number; done: number; docs: number }>) {
  const st = stats?.get(r.id) ?? { total: 0, doing: 0, done: 0, docs: 0 };
  return {
    id: r.id,
    ma_he_thong: r.ma_he_thong,
    ten_he_thong: r.ten_he_thong,
    mo_ta: r.mo_ta ?? "",
    trang_thai: r.trang_thai ?? "dang_phat_trien",
    don_vi_quan_ly_id: r.don_vi_quan_ly_id ?? null,
    don_vi_quan_ly_name: r.don_vi_quan_ly_id != null ? depts.get(r.don_vi_quan_ly_id) ?? null : null,
    dau_moi_ky_thuat_id: r.dau_moi_ky_thuat_id ?? null,
    dau_moi_ky_thuat_name: r.dau_moi_ky_thuat_id != null ? users.get(r.dau_moi_ky_thuat_id) ?? null : null,
    don_vi_phat_trien: r.don_vi_phat_trien ?? "",
    dia_chi_truy_cap: r.dia_chi_truy_cap ?? "",
    phien_ban: r.phien_ban ?? "",
    ngay_van_hanh: r.ngay_van_hanh ?? "",
    tai_lieu_bat_buoc: parseDocs(r.tai_lieu_bat_buoc),
    so_tinh_nang: st.total,
    dang_lam: st.doing,
    so_tai_lieu: st.docs,
    hoan_thanh: st.done,
    updated_at: r.updated_at ?? r.created_at ?? null,
  };
}

async function lookups() {
  const depts = new Map<number, string>(((await db("departments").select("id", "name")) as any[]).map((d) => [d.id, d.name]));
  const users = new Map<number, string>(((await db("users").select("id", "name", "username")) as any[]).map((u) => [u.id, u.name || u.username]));
  return { depts, users };
}

export async function listSystems(deptId: number | null) {
  const rows = (await db("he_thong_options").orderBy("thu_tu", "asc").orderBy("id", "asc")) as any[];
  const { depts, users } = await lookups();
  const stats = await statsBySystem(deptId);
  return Promise.all(rows.map((r) => toView(r, depts, users, stats)));
}

export async function getSystem(id: number, deptId?: number | null) {
  const r = await db("he_thong_options").where({ id }).first();
  if (!r) return undefined;
  const { depts, users } = await lookups();
  return toView(r, depts, users, await statsBySystem(deptId));
}

export interface SystemInput {
  ma_he_thong?: unknown;
  ten_he_thong?: unknown;
  mo_ta?: unknown;
  trang_thai?: unknown;
  don_vi_quan_ly_id?: unknown;
  dau_moi_ky_thuat_id?: unknown;
  don_vi_phat_trien?: unknown;
  dia_chi_truy_cap?: unknown;
  phien_ban?: unknown;
  ngay_van_hanh?: unknown;
  tai_lieu_bat_buoc?: unknown;
}

const str = (v: unknown, max: number, label: string): string => {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length > max) throw new SystemError(`${label} tối đa ${max} ký tự.`);
  return s;
};

async function clean(input: SystemInput, existingId?: number) {
  const out: Record<string, any> = {};
  const ma = str(input.ma_he_thong, 50, "Mã hệ thống");
  const ten = str(input.ten_he_thong, 255, "Tên hệ thống");
  if (!ma) throw new SystemError("Mã hệ thống là bắt buộc.");
  if (!ten) throw new SystemError("Tên hệ thống là bắt buộc.");
  const dupMa = await db("he_thong_options").whereRaw("lower(ma_he_thong) = ?", [ma.toLowerCase()]).modify((q) => existingId && q.whereNot("id", existingId)).first();
  if (dupMa) throw new SystemError("Mã hệ thống đã tồn tại.");
  const dupTen = await db("he_thong_options").whereRaw("lower(ten_he_thong) = ?", [ten.toLowerCase()]).modify((q) => existingId && q.whereNot("id", existingId)).first();
  if (dupTen) throw new SystemError("Tên hệ thống đã tồn tại.");
  out.ma_he_thong = ma;
  out.ten_he_thong = ten;
  out.mo_ta = str(input.mo_ta, 2000, "Mô tả") || null;
  const tt = typeof input.trang_thai === "string" && input.trang_thai ? input.trang_thai : "dang_phat_trien";
  if (!(SYSTEM_STATUSES as readonly string[]).includes(tt)) throw new SystemError("Trạng thái không hợp lệ.");
  out.trang_thai = tt;
  const dv = Number(input.don_vi_quan_ly_id);
  if (!Number.isInteger(dv) || dv <= 0) throw new SystemError("Đơn vị quản lý là bắt buộc.");
  if (!(await db("departments").where({ id: dv }).first())) throw new SystemError("Không tìm thấy đơn vị quản lý.");
  out.don_vi_quan_ly_id = dv;
  if (input.dau_moi_ky_thuat_id != null && input.dau_moi_ky_thuat_id !== "") {
    const u = Number(input.dau_moi_ky_thuat_id);
    if (!Number.isInteger(u) || !(await db("users").where({ id: u }).first())) throw new SystemError("Không tìm thấy đầu mối kỹ thuật.");
    out.dau_moi_ky_thuat_id = u;
  } else out.dau_moi_ky_thuat_id = null;
  out.don_vi_phat_trien = str(input.don_vi_phat_trien, 255, "Đơn vị phát triển") || null;
  const url = str(input.dia_chi_truy_cap, 500, "Địa chỉ truy cập");
  if (url && !/^https?:\/\//i.test(url)) throw new SystemError("Địa chỉ truy cập phải bắt đầu bằng http:// hoặc https://.");
  out.dia_chi_truy_cap = url || null;
  out.phien_ban = str(input.phien_ban, 50, "Phiên bản") || null;
  const d = str(input.ngay_van_hanh, 10, "Ngày đưa vào vận hành");
  if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new SystemError("Ngày đưa vào vận hành không hợp lệ.");
  out.ngay_van_hanh = d || null;
  const docsIn = Array.isArray(input.tai_lieu_bat_buoc) ? input.tai_lieu_bat_buoc : DEFAULT_DOC_TYPES;
  const seen = new Set<string>();
  const docs: DocType[] = [];
  for (const raw of docsIn.slice(0, 30) as any[]) {
    const label = str(raw?.label, 100, "Tên loại tài liệu");
    if (!label) continue;
    const key = str(raw?.key, 60, "Mã loại tài liệu") || label.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    if (seen.has(key)) continue;
    seen.add(key);
    docs.push({ key, label, sub: str(raw?.sub, 150, "Mô tả loại tài liệu"), required: !!raw?.required });
  }
  out.tai_lieu_bat_buoc = JSON.stringify(docs);
  return out;
}

export async function createSystem(input: SystemInput) {
  const data = await clean(input.ma_he_thong ? input : { ...input, ma_he_thong: await nextSystemCode() });
  const maxRow = await db("he_thong_options").max({ m: "thu_tu" }).first();
  const [created] = await db("he_thong_options")
    .insert({ ...data, thu_tu: Number((maxRow as any)?.m ?? -1) + 1, updated_at: db.fn.now() })
    .returning("id");
  const id = typeof created === "object" ? (created as any).id : created;
  return (await getSystem(Number(id)))!;
}

export async function updateSystem(id: number, input: SystemInput) {
  const cur = await db("he_thong_options").where({ id }).first();
  if (!cur) return undefined;
  const data = await clean(input, id);
  await db("he_thong_options").where({ id }).update({ ...data, updated_at: db.fn.now() });
  return getSystem(id);
}
