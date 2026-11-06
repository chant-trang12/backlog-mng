import { db } from "../db/database.js";
import type { AuthUser } from "../types/auth.js";
import type { AppRole, AppUser, UpdateAppUserInput } from "../types/user.js";
import { softDeleteWhere } from "./softDelete.util.js";
import { stripHtmlChars } from "../utils/sanitize.util.js";

function toAppUser(row: any): AppUser {
  return { ...row, active: !!row.active };
}

export async function listUsers(): Promise<AppUser[]> {
  const rows = await db("users").where({ is_deleted: false }).orderBy("created_at", "asc");
  return rows.map(toAppUser);
}

export async function getUser(id: number): Promise<AppUser | undefined> {
  const row = await db("users").where({ id, is_deleted: false }).first();
  return row ? toAppUser(row) : undefined;
}

// is_deleted=false — QUAN TRỌNG: hàm này được requireAuth gọi ở MỌI request
// đã đăng nhập để xác định req.appUser. Tài khoản đã xóa mềm phải KHÔNG
// được tìm thấy ở đây, nếu không coi như xóa "không thật" — vẫn đăng nhập
// vào được bình thường.
export async function getUserBySsoSub(ssoSub: string): Promise<AppUser | undefined> {
  const row = await db("users").where({ sso_sub: ssoSub, is_deleted: false }).first();
  return row ? toAppUser(row) : undefined;
}

// Gọi mỗi lần đăng nhập SSO thành công (callbackHandler) và như một lớp
// phòng vệ ở requireAuth nếu vì lý do gì đó user chưa có record cục bộ.
// Idempotent theo sso_sub — user đã có thì chỉ đồng bộ lại
// username/name/email/last_login_at, GIỮ NGUYÊN role/active (Admin đã set
// tay thì không bị ghi đè bởi lần đăng nhập sau).
//
// Bootstrap quyền: chưa có user cục bộ nào trong hệ thống (users rỗng) ->
// người đăng nhập đầu tiên tự thành "admin". Mọi người đăng nhập lần đầu
// sau đó mặc định "viewer" (quyền thấp nhất) — admin vào Quản lý User để
// nâng quyền cho từng người.
// Tiền tố của sso_sub cho tài khoản được tạo sẵn trong DB, chưa gắn sub thật.
export const PENDING_SSO_SUB_PREFIX = "pending:";

async function claimPendingUser(authUser: AuthUser, safeUsername: string): Promise<any | undefined> {
  const username = safeUsername.trim().toLowerCase();
  const email = String(authUser.email ?? "").trim().toLowerCase();
  const keys = [username, email].filter((k) => k !== "");
  if (keys.length === 0) return undefined;

  const pendingRows = await db("users")
    .where({ is_deleted: false })
    .where("sso_sub", "like", `${PENDING_SSO_SUB_PREFIX}%`)
    .orderBy("id", "asc");
  const lower = (v: unknown) => String(v ?? "").trim().toLowerCase();
  const match =
    pendingRows.find((r: any) => username !== "" && lower(r.username) === username) ??
    pendingRows.find((r: any) => keys.includes(lower(r.username)) || (email !== "" && lower(r.email) === email));
  if (!match) return undefined;

  // Gắn sub thật. Điều kiện sso_sub còn là "pending:" để 2 lần đăng nhập đồng thời
  // không cùng chiếm 1 dòng; nếu ai đó chiếm trước thì coi như không khớp.
  const updated = await db("users")
    .where({ id: match.id, sso_sub: match.sso_sub })
    .update({ sso_sub: authUser.id, updated_at: db.fn.now() });
  if (!updated) return undefined;
  return { ...match, sso_sub: authUser.id };
}

export async function upsertUserFromSso(authUser: AuthUser): Promise<AppUser> {
  // ATTT (Stored XSS): username/name từ IdP cũng là dữ liệu render ở FE —
  // strip ký tự tạo thẻ HTML như mọi đầu vào ghi khác (route /auth/* nằm
  // ngoài middleware /api nên phải tự làm sạch tại đây).
  const safeUsername = stripHtmlChars(String(authUser.username ?? ""));
  const safeName = stripHtmlChars(String(authUser.name ?? ""));
  // is_deleted=false — tài khoản đã xóa mềm đăng nhập lại SSO sẽ tạo bản
  // ghi MỚI (không "hồi sinh" bản ghi cũ đã xóa — khớp filtered unique
  // index trên sso_sub, xem migrations/users.ts).
  let existing = await db("users").where({ sso_sub: authUser.id, is_deleted: false }).first();

  // Tài khoản Admin INSERT sẵn vào DB trước khi người đó đăng nhập lần đầu
  // (chưa biết sub của IdP): sso_sub đặt dạng "pending:<username>" (cột NOT NULL
  // + UNIQUE nên không để null được). Lần đăng nhập đầu: tìm dòng "pending:" có
  // username HOẶC email trùng (không phân biệt hoa/thường) với claim của IdP rồi
  // GẮN sub thật vào chính dòng đó — giữ nguyên role/active/phòng ban đã gán,
  // không tạo bản ghi trùng. Ưu tiên khớp username trước, rồi mới tới email.
  if (!existing) {
    existing = await claimPendingUser(authUser, safeUsername);
  }
  if (existing) {
    await db("users")
      .where({ id: existing.id })
      .update({
        username: safeUsername,
        name: safeName,
        email: authUser.email ?? null,
        last_login_at: db.fn.now(),
        updated_at: db.fn.now(),
      });
    return (await getUser(existing.id)) as AppUser;
  }

  const countRes = await db("users").where({ is_deleted: false }).count({ c: "*" }).first();
  const isFirstUser = Number((countRes as any)?.c ?? 0) === 0;

  const [created] = await db("users")
    .insert({
      sso_sub: authUser.id,
      username: safeUsername,
      name: safeName,
      email: authUser.email ?? null,
      role: isFirstUser ? "admin" : "viewer",
      active: true,
      last_login_at: db.fn.now(),
    })
    .returning("*");
  return toAppUser(created);
}

const VALID_ROLES: AppRole[] = ["admin", "subadmin", "editor", "bgd", "viewer"];

export function isValidRole(value: unknown): value is AppRole {
  return typeof value === "string" && (VALID_ROLES as string[]).includes(value);
}

// Chặn admin tự hạ quyền/tự khóa chính mình qua API này (tránh tự khóa hết
// quyền truy cập Quản lý User, không ai vào gỡ lại được) — muốn đổi role/
// khóa tài khoản của chính mình thì phải nhờ 1 admin khác.
export async function updateUser(
  id: number,
  actingUserId: number,
  input: UpdateAppUserInput,
): Promise<AppUser | undefined | { error: string }> {
  const existing = await getUser(id);
  if (!existing) return undefined;
  if (id === actingUserId && (input.role !== undefined || input.active !== undefined)) {
    return { error: "Không thể tự đổi quyền/khóa chính tài khoản đang đăng nhập — nhờ admin khác thực hiện." };
  }
  if (input.department_id !== undefined && input.department_id !== null) {
    const department = await db("departments").where({ id: input.department_id, is_deleted: false }).first();
    if (!department) {
      return { error: "Phòng ban không tồn tại." };
    }
  }
  await db("users")
    .where({ id })
    .update({
      role: input.role ?? existing.role,
      active: input.active !== undefined ? input.active : existing.active,
      department_id: input.department_id !== undefined ? input.department_id : existing.department_id,
      ma_nhan_vien: input.ma_nhan_vien !== undefined ? (input.ma_nhan_vien?.trim() || null) : existing.ma_nhan_vien,
      updated_at: db.fn.now(),
    });
  return getUser(id);
}

const nameKey = (s: unknown) => String(s ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

// Mã nhân viên theo Họ và Tên (chuẩn hoá). Trùng tên giữa các phòng ban -> ưu tiên user CÙNG phòng ban với dòng dữ liệu;
// không có user cùng phòng thì chỉ dùng khi tên đó chỉ có ĐÚNG 1 user (tránh lấy nhầm mã của người trùng tên phòng khác).
type CodeEntry = { departmentId: number | null; code: string };
export async function userCodeMap(): Promise<Map<string, CodeEntry[]>> {
  const rows = await db("users").where({ is_deleted: false }).whereNotNull("ma_nhan_vien").select("name", "ma_nhan_vien", "department_id");
  const map = new Map<string, CodeEntry[]>();
  for (const r of rows as { name: string; ma_nhan_vien: string; department_id: number | null }[]) {
    const code = r.ma_nhan_vien?.trim();
    if (!code) continue;
    const k = nameKey(r.name);
    map.set(k, [...(map.get(k) ?? []), { departmentId: r.department_id ?? null, code }]);
  }
  return map;
}

export function pickUserCode(entries: CodeEntry[] | undefined, departmentId: number | null | undefined): string | null {
  if (!entries?.length) return null;
  const same = entries.find((e) => e.departmentId != null && e.departmentId === departmentId);
  if (same) return same.code;
  return entries.length === 1 ? entries[0].code : null;
}

// Điền Mã nhân viên từ bảng user (khớp Họ và Tên + phòng ban của dòng) — user có mã thì ưu tiên hơn giá trị đã lưu.
export async function applyUserCodes<T extends { ho_va_ten: string; ma_nhan_vien: string | null; department_id?: number | null }>(rows: T[]): Promise<T[]> {
  const map = await userCodeMap();
  if (map.size === 0) return rows;
  return rows.map((r) => ({ ...r, ma_nhan_vien: pickUserCode(map.get(nameKey(r.ho_va_ten)), r.department_id) ?? r.ma_nhan_vien }));
}

export async function listUserCodes(): Promise<{ name: string; ma_nhan_vien: string; department_id: number | null }[]> {
  const rows = await db("users").where({ is_deleted: false }).whereNotNull("ma_nhan_vien").select("name", "ma_nhan_vien", "department_id");
  return (rows as { name: string; ma_nhan_vien: string; department_id: number | null }[]).filter((r) => r.ma_nhan_vien?.trim());
}

export async function deleteUser(id: number, actingUserId: number): Promise<boolean | { error: string }> {
  if (id === actingUserId) {
    return { error: "Không thể tự xóa chính tài khoản đang đăng nhập." };
  }
  const count = await softDeleteWhere(db, "users", { id });
  return count > 0;
}
