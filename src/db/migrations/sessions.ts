import { db } from "../connection.js";

// Phiên đăng nhập (express-session) lưu trong DB thay vì bộ nhớ process —
// restart dịch vụ không đá mọi người ra, và chạy được nhiều process. Xem
// src/db/sessionStore.ts. expires_at là epoch milliseconds.
export async function migrateSessionsTable(): Promise<void> {
  if (await db.schema.hasTable("sessions")) return;
  await db.schema.createTable("sessions", (t) => {
    t.string("sid", 255).primary();
    t.text("sess").notNullable();
    t.bigInteger("expires_at").notNullable().index();
  });
}
