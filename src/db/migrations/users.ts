import { db } from "../connection.js";

// Quản lý User + Phân quyền — user cục bộ được tạo tự động khi đăng nhập
// SSO lần đầu (upsertUserFromSso), KHÔNG tạo tay ở đây. sso_sub là
// "sub" claim từ IdP (định danh không đổi), unique để upsert theo đúng
// 1 người dù username/email đổi sau này.
export async function migrateUsersTable(): Promise<void> {
  const hasUsers = await db.schema.hasTable("users");
  if (!hasUsers) {
    await db.schema.createTable("users", (table) => {
      table.increments("id").primary();
      table.string("sso_sub", 255).notNullable().unique();
      table.string("username", 255).notNullable();
      table.string("name", 255).notNullable();
      table.string("email", 255);
      // "admin" | "editor" | "viewer" — xem src/types/user.ts. Người đầu
      // tiên đăng nhập thành công tự thành admin (bootstrap), những người
      // sau mặc định "viewer" (quyền thấp nhất) — admin vào Quản lý User
      // để nâng quyền.
      table.string("role", 20).notNullable().defaultTo("viewer");
      table.boolean("active").notNullable().defaultTo(true);
      table.dateTime("last_login_at");
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
    });
  }
}

// members.ha_ki — nút "Hạ KI" ở tab Nhân sự, hạ KI của nhân sự đó xuống 1
// bậc khi hiển thị ở Home > Ranking > "Ranking thành viên team" (thang
// A+ > A > B > C > D > E, xem homeLowerKiOneLevel ở app.js). Mặc định
// false — hành vi cũ không đổi.
export async function migrateMembersHaKi(): Promise<void> {
  if (!(await db.schema.hasColumn("members", "ha_ki"))) {
    await db.schema.alterTable("members", (table) => {
      table.boolean("ha_ki").notNullable().defaultTo(false);
    });
  }
}
