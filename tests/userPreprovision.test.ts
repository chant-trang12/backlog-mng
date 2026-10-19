import { describe, expect, it } from "vitest";
import { db } from "../src/db/database.js";
import { getUserBySsoSub, listUsers, upsertUserFromSso } from "../src/services/user.service.js";
import type { AuthUser } from "../src/types/auth.js";

let n = 0;
const uniq = (p: string) => `${p}-${Date.now()}-${++n}`;
const sso = (id: string, username: string, email: string | undefined, name = "Từ SSO"): AuthUser => ({
  id,
  username,
  name,
  email,
});

// Admin INSERT sẵn user vào DB (sso_sub = 'pending:<username>'): lần đăng nhập SSO đầu phải gắn
// sub thật vào ĐÚNG dòng đó (giữ role/phòng ban), không tạo dòng trùng.
describe("tạo sẵn user trong DB (sso_sub = 'pending:...') — gắn sub khi đăng nhập lần đầu", () => {
  async function insertPending(username: string, opts: { email?: string; role?: string; deleted?: boolean } = {}) {
    await db("users").insert({
      sso_sub: `pending:${username.toLowerCase()}`,
      username,
      name: "Tên nhập sẵn",
      email: opts.email ?? null,
      role: opts.role ?? "editor",
      active: true,
      is_deleted: opts.deleted ?? false,
    });
  }

  it("khớp theo username (không phân biệt hoa/thường): gắn sub, giữ role, không tạo dòng mới", async () => {
    // đảm bảo không phải "người đầu tiên" (bootstrap admin)
    await upsertUserFromSso(sso(uniq("seed"), uniq("seed"), `${uniq("seed")}@t.local`));
    const username = `${uniq("Pre")}@viettelidc.com.vn`;
    await insertPending(username, { role: "editor" });
    const before = (await listUsers()).length;

    const sub = uniq("sub");
    const user = await upsertUserFromSso(sso(sub, username.toUpperCase(), undefined, "Tên thật SSO"));

    expect(user.sso_sub).toBe(sub);
    expect(user.role).toBe("editor");
    expect(user.name).toBe("Tên thật SSO"); // đồng bộ lại tên từ SSO như mọi lần đăng nhập
    expect((await listUsers()).length).toBe(before); // KHÔNG tạo bản ghi trùng
    expect((await getUserBySsoSub(sub))?.id).toBe(user.id);
  });

  it("khớp theo email khi username SSO khác", async () => {
    await upsertUserFromSso(sso(uniq("seed"), uniq("seed"), `${uniq("seed")}@t.local`));
    const email = `${uniq("mail")}@viettelidc.com.vn`;
    await insertPending(uniq("manual-user"), { email, role: "bgd" });
    const sub = uniq("sub");
    const user = await upsertUserFromSso(sso(sub, uniq("sso-name"), email.toUpperCase()));
    expect(user.sso_sub).toBe(sub);
    expect(user.role).toBe("bgd");
  });

  it("lần đăng nhập sau dùng sub thật, không gắn lại; người không có dòng sẵn vẫn thành viewer", async () => {
    await upsertUserFromSso(sso(uniq("seed"), uniq("seed"), `${uniq("seed")}@t.local`));
    const username = uniq("again");
    await insertPending(username, { role: "editor" });
    const sub = uniq("sub");
    const first = await upsertUserFromSso(sso(sub, username, undefined));
    const second = await upsertUserFromSso(sso(sub, username, undefined));
    expect(second.id).toBe(first.id);

    const stranger = await upsertUserFromSso(sso(uniq("sub"), uniq("khac"), `${uniq("khac")}@t.local`));
    expect(stranger.role).toBe("viewer");
  });

  it("dòng đã xóa mềm hoặc đã có sub thật không bị 'chiếm'", async () => {
    await upsertUserFromSso(sso(uniq("seed"), uniq("seed"), `${uniq("seed")}@t.local`));
    const deletedName = uniq("deleted");
    await insertPending(deletedName, { deleted: true });
    const u = await upsertUserFromSso(sso(uniq("sub"), deletedName, undefined));
    expect(u.role).toBe("viewer"); // tạo mới, không dùng lại dòng đã xóa

    const realSub = uniq("realsub");
    const real = await upsertUserFromSso(sso(realSub, uniq("real"), `${uniq("real")}@t.local`));
    const other = await upsertUserFromSso(sso(uniq("sub"), real.username, undefined));
    expect(other.sso_sub).not.toBe(realSub); // dòng đã gắn sub thật của người khác giữ nguyên
  });
});
