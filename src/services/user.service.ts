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
export async function upsertUserFromSso(authUser: AuthUser): Promise<AppUser> {
  // ATTT (Stored XSS): username/name từ IdP cũng là dữ liệu render ở FE —
  // strip ký tự tạo thẻ HTML như mọi đầu vào ghi khác (route /auth/* nằm
  // ngoài middleware /api nên phải tự làm sạch tại đây).
  const safeUsername = stripHtmlChars(String(authUser.username ?? ""));
  const safeName = stripHtmlChars(String(authUser.name ?? ""));
  // is_deleted=false — tài khoản đã xóa mềm đăng nhập lại SSO sẽ tạo bản
  // ghi MỚI (không "hồi sinh" bản ghi cũ đã xóa — khớp filtered unique
  // index trên sso_sub, xem migrations/users.ts).
  const existing = await db("users").where({ sso_sub: authUser.id, is_deleted: false }).first();
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

const VALID_ROLES: AppRole[] = ["admin", "editor", "bgd", "viewer"];

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
      updated_at: db.fn.now(),
    });
  return getUser(id);
}

export async function deleteUser(id: number, actingUserId: number): Promise<boolean | { error: string }> {
  if (id === actingUserId) {
    return { error: "Không thể tự xóa chính tài khoản đang đăng nhập." };
  }
  const count = await softDeleteWhere(db, "users", { id });
  return count > 0;
}
