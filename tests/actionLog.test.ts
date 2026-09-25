import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { db, initDatabase } from "../src/db/database.js";

// created_at theo đúng định dạng SQLite lưu (CURRENT_TIMESTAMP, giờ UTC).
function sqliteTs(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
}

describe("Nhật ký hoạt động — lọc theo thời gian", () => {
  it("mặc định chỉ lấy 90 ngày gần nhất; lọc date_from/date_to lấy trọn ngày; bỏ qua ngày sai định dạng", async () => {
    await initDatabase();
    const app = createApp();
    const marker = `al-test-${Date.now()}`;
    await db("action_logs").insert([
      { user_name: "t", action: "tao_moi", module: "Test", description: `${marker} gần đây`, created_at: sqliteTs(1) },
      { user_name: "t", action: "tao_moi", module: "Test", description: `${marker} cũ`, created_at: sqliteTs(200) },
      { user_name: "t", action: "tao_moi", module: "Test", description: `${marker} cuối ngày`, created_at: "2020-03-15 23:30:00" },
    ]);

    const byDefault = await request(app).get("/api/action-logs").query({ q: marker });
    expect(byDefault.status).toBe(200);
    expect(byDefault.body.map((r: { description: string }) => r.description)).toEqual([`${marker} gần đây`]);

    const ranged = await request(app)
      .get("/api/action-logs")
      .query({ q: marker, date_from: "2020-03-15", date_to: "2020-03-15" });
    expect(ranged.status).toBe(200);
    expect(ranged.body.map((r: { description: string }) => r.description)).toEqual([`${marker} cuối ngày`]);

    const invalid = await request(app).get("/api/action-logs").query({ q: marker, date_from: "15/03/2020" });
    expect(invalid.status).toBe(200);
    expect(invalid.body).toHaveLength(1);
  });
});
