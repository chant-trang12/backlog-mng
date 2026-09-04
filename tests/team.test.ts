import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

async function makePeriod(app: ReturnType<typeof createApp>, year: number, month: number) {
  const res = await request(app).post("/api/periods").send({ year, month });
  return res.body.id as number;
}

describe("Team declaration (gắn theo period_id)", () => {
  it("declares a team for 1 tháng backlog, lists it, and removes it — idempotent theo (period_id, name)", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2060, 1);

    const team = await request(app).post("/api/teams").send({ name: "Team declaration test", period_id: periodId });
    expect(team.status).toBe(201);
    expect(team.body.name).toBe("Team declaration test");
    expect(team.body.period_id).toBe(periodId);

    const dup = await request(app)
      .post("/api/teams")
      .send({ name: "Team declaration test", period_id: periodId });
    expect(dup.status).toBe(201);
    expect(dup.body.id).toBe(team.body.id);

    const list = await request(app).get(`/api/teams?period_id=${periodId}`);
    expect(list.status).toBe(200);
    expect(list.body.some((t: { id: number }) => t.id === team.body.id)).toBe(true);

    const del = await request(app).delete(`/api/teams/${team.body.id}`);
    expect(del.status).toBe(204);

    const listAfter = await request(app).get(`/api/teams?period_id=${periodId}`);
    expect(listAfter.body.some((t: { id: number }) => t.id === team.body.id)).toBe(false);
  });

  it("rejects creating/listing teams với period_id không hợp lệ", async () => {
    const app = createApp();
    const badCreate = await request(app).post("/api/teams").send({ name: "X", period_id: 999999 });
    expect(badCreate.status).toBe(400);

    const badList = await request(app).get("/api/teams?period_id=999999");
    expect(badList.status).toBe(400);
  });

  it("team thêm ở 1 tháng chỉ hiển thị từ tháng đó trở đi — không xuất hiện ngược ở tháng đã tạo trước đó", async () => {
    const app = createApp();
    // DB test dùng chung file với các test khác — 1 tháng mới tạo luôn kế
    // thừa team từ tháng "gần nhất" trên TOÀN BỘ DB (không scope theo test),
    // nên không thể giả định baseline rỗng. Chỉ kiểm tra đúng hành vi đang
    // test: team mới thêm ở tháng 9 không xuất hiện ngược ở tháng 8.
    const augId = await makePeriod(app, 2061, 8);
    // Tạo tháng 9 SAU khi tháng 8 đã tồn tại — tháng 9 kế thừa team hiện có.
    const sepId = await makePeriod(app, 2061, 9);

    // Thêm 1 team mới ở tháng 9 (mô phỏng đúng tình huống người dùng: "tháng
    // 9 phát sinh thêm 1 team cần quản lý").
    const newTeam = await request(app).post("/api/teams").send({ name: "Team mới tháng 9", period_id: sepId });
    expect(newTeam.status).toBe(201);

    const sepTeamsAfter = await request(app).get(`/api/teams?period_id=${sepId}`);
    expect(sepTeamsAfter.body.some((t: { id: number }) => t.id === newTeam.body.id)).toBe(true);

    // Tháng 8 (đã tạo trước đó) KHÔNG được thấy team mới này.
    const augTeamsAfter = await request(app).get(`/api/teams?period_id=${augId}`);
    expect(augTeamsAfter.body.some((t: { name: string }) => t.name === "Team mới tháng 9")).toBe(false);
  });

  it("tháng mới tạo kế thừa danh sách team từ tháng gần nhất, độc lập từ đó trở đi", async () => {
    const app = createApp();
    const augId = await makePeriod(app, 2062, 8);
    await request(app).post("/api/teams").send({ name: "BSS Test Unique", period_id: augId });
    await request(app).post("/api/teams").send({ name: "CRM Test Unique", period_id: augId });
    const augTeamsBefore = await request(app).get(`/api/teams?period_id=${augId}`);
    const augNamesBefore = augTeamsBefore.body.map((t: { name: string }) => t.name).sort();

    // Tháng 9 phải kế thừa ĐÚNG danh sách team của tháng 8 tại thời điểm tạo
    // (bao gồm cả 2 team vừa thêm), dù tháng 8 có thể đã có sẵn team khác từ
    // trước (cross-test baseline).
    const sepId = await makePeriod(app, 2062, 9);
    const sepTeams = await request(app).get(`/api/teams?period_id=${sepId}`);
    expect(sepTeams.body.map((t: { name: string }) => t.name).sort()).toEqual(augNamesBefore);

    // Xóa 1 team ở tháng 9 — tháng 8 phải còn nguyên (2 danh sách độc lập).
    const bssInSep = sepTeams.body.find((t: { name: string }) => t.name === "BSS Test Unique");
    await request(app).delete(`/api/teams/${bssInSep.id}`);

    const augTeamsAfter = await request(app).get(`/api/teams?period_id=${augId}`);
    expect(augTeamsAfter.body.map((t: { name: string }) => t.name).sort()).toEqual(augNamesBefore);

    const sepTeamsAfter = await request(app).get(`/api/teams?period_id=${sepId}`);
    expect(sepTeamsAfter.body.some((t: { name: string }) => t.name === "BSS Test Unique")).toBe(false);
    expect(sepTeamsAfter.body.some((t: { name: string }) => t.name === "CRM Test Unique")).toBe(true);
  });

  it("xóa 1 team cascade xóa nhân sự thuộc team đó (đúng tháng)", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2063, 1);
    const team = await request(app).post("/api/teams").send({ name: "Cascade team", period_id: periodId });
    const member = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự cascade", team_id: team.body.id, period_id: periodId });

    await request(app).delete(`/api/teams/${team.body.id}`);

    const membersAfter = await request(app).get(`/api/members?period_id=${periodId}`);
    expect(membersAfter.body.some((m: { id: number }) => m.id === member.body.id)).toBe(false);
  });
});
