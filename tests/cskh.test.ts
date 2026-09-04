import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

async function makePeriod(app: ReturnType<typeof createApp>, year: number, month: number) {
  const res = await request(app).post("/api/periods").send({ year, month });
  return res.body.id as number;
}

async function makeTeam(app: ReturnType<typeof createApp>, name: string, periodId: number) {
  const res = await request(app).post("/api/teams").send({ name, period_id: periodId });
  return res.body.id as number;
}

describe("CSKH: Sự cố", () => {
  it("creates, lists (with team name + period label), updates, and deletes an incident", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2040, 1);
    const teamId = await makeTeam(app, "CSKH incident test team", periodId);

    const created = await request(app)
      .post("/api/incidents")
      .send({ team_id: teamId, period_id: periodId, su_co: "Lỗi đăng nhập", tinh_chat: "Nghiêm trọng" });
    expect(created.status).toBe(201);
    expect(created.body.su_co).toBe("Lỗi đăng nhập");

    const list = await request(app).get("/api/incidents");
    const found = list.body.find((i: { id: number }) => i.id === created.body.id);
    expect(found.team_name).toBe("CSKH incident test team");
    expect(found.period_label).toBe("Tháng 1/2040");

    const updated = await request(app)
      .put(`/api/incidents/${created.body.id}`)
      .send({ tinh_chat: "Đã xử lý" });
    expect(updated.body.tinh_chat).toBe("Đã xử lý");

    const del = await request(app).delete(`/api/incidents/${created.body.id}`);
    expect(del.status).toBe(204);
  });

  it("rejects an incident with an invalid team_id or period_id", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2040, 2);
    const teamId = await makeTeam(app, "CSKH incident invalid team", periodId);

    const badTeam = await request(app)
      .post("/api/incidents")
      .send({ team_id: 999999, period_id: periodId, su_co: "x" });
    expect(badTeam.status).toBe(400);

    const badPeriod = await request(app)
      .post("/api/incidents")
      .send({ team_id: teamId, period_id: 999999, su_co: "x" });
    expect(badPeriod.status).toBe(400);
  });
});

describe("CSKH: Hỗ trợ ticket", () => {
  it("computes ty_le = dung_han / tong_ticket", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2040, 3);
    const teamId = await makeTeam(app, "CSKH ticket test team", periodId);

    const created = await request(app)
      .post("/api/tickets")
      .send({ team_id: teamId, period_id: periodId, tong_ticket: 100, ticket_vuot: 20, dung_han: 80 });
    expect(created.status).toBe(201);

    const list = await request(app).get("/api/tickets");
    const found = list.body.find((t: { id: number }) => t.id === created.body.id);
    expect(found.ty_le).toBeCloseTo(0.8);
    expect(found.team_name).toBe("CSKH ticket test team");
    expect(found.period_label).toBe("Tháng 3/2040");

    const updated = await request(app)
      .put(`/api/tickets/${created.body.id}`)
      .send({ dung_han: 50 });
    expect(updated.body.dung_han).toBe(50);

    await request(app).delete(`/api/tickets/${created.body.id}`);
  });

  it("returns ty_le 0 when tong_ticket is 0 (no division by zero)", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2040, 4);
    const teamId = await makeTeam(app, "CSKH ticket zero team", periodId);
    const created = await request(app)
      .post("/api/tickets")
      .send({ team_id: teamId, period_id: periodId });
    const list = await request(app).get("/api/tickets");
    const found = list.body.find((t: { id: number }) => t.id === created.body.id);
    expect(found.ty_le).toBe(0);
  });
});

describe("CSKH: Tỉ lệ khởi tạo", () => {
  it("computes total and grand_total", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2040, 5);
    const teamId = await makeTeam(app, "CSKH creation rate team", periodId);

    const created = await request(app)
      .post("/api/creation-rates")
      .send({ team_id: teamId, period_id: periodId, so_luong_thanh_cong: 75, so_luong_that_bai: 25 });
    expect(created.status).toBe(201);

    const list = await request(app).get("/api/creation-rates");
    const found = list.body.find((r: { id: number }) => r.id === created.body.id);
    expect(found.total).toBe(100);
    expect(found.grand_total).toBeCloseTo(0.75);
    expect(found.period_label).toBe("Tháng 5/2040");

    const del = await request(app).delete(`/api/creation-rates/${created.body.id}`);
    expect(del.status).toBe(204);
  });
});
