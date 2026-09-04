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

describe("Team & Nhân sự: Đánh giá", () => {
  it("bulk-thêm Đánh giá cho nhiều nhân sự của 1 team cùng lúc, lists với chi tiết team/member/period", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2048, 1);
    const teamId = await makeTeam(app, "Đánh giá team", periodId);
    const memberA = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự A", team_id: teamId, period_id: periodId });
    const memberB = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự B", team_id: teamId, period_id: periodId });

    const bulk = await request(app)
      .post("/api/danh-gia-records/bulk")
      .send({
        period_id: periodId,
        team_id: teamId,
        entries: [
          { member_id: memberA.body.id, so_thu_tu: 1 },
          { member_id: memberB.body.id, so_thu_tu: 2 },
        ],
      });
    expect(bulk.status).toBe(201);
    expect(bulk.body).toHaveLength(2);

    const list = await request(app).get(`/api/danh-gia-records?period_id=${periodId}`);
    const foundA = list.body.find((d: { member_id: number }) => d.member_id === memberA.body.id);
    expect(foundA.so_thu_tu).toBe(1);
    expect(foundA.member_name).toBe("Nhân sự A");
    expect(foundA.team_name).toBe("Đánh giá team");
    expect(foundA.period_label).toBe("Tháng 1/2048");
  });

  it("bulk-upsert cho 1 nhân sự đã có bản ghi sẽ cập nhật, không tạo trùng", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2048, 2);
    const teamId = await makeTeam(app, "Đánh giá upsert team", periodId);
    const member = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự Upsert", team_id: teamId, period_id: periodId });

    await request(app)
      .post("/api/danh-gia-records/bulk")
      .send({ period_id: periodId, team_id: teamId, entries: [{ member_id: member.body.id, so_thu_tu: 1 }] });
    await request(app)
      .post("/api/danh-gia-records/bulk")
      .send({ period_id: periodId, team_id: teamId, entries: [{ member_id: member.body.id, so_thu_tu: 5 }] });

    const list = await request(app).get(`/api/danh-gia-records?period_id=${periodId}`);
    const records = list.body.filter((d: { member_id: number }) => d.member_id === member.body.id);
    expect(records).toHaveLength(1);
    expect(records[0].so_thu_tu).toBe(5);
  });

  it("edits and deletes a single record", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2048, 3);
    const teamId = await makeTeam(app, "Đánh giá edit team", periodId);
    const member = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự Sửa Xóa", team_id: teamId, period_id: periodId });
    const created = await request(app)
      .post("/api/danh-gia-records/bulk")
      .send({ period_id: periodId, team_id: teamId, entries: [{ member_id: member.body.id, so_thu_tu: 1 }] });
    const recordId = created.body[0].id;

    const updated = await request(app).put(`/api/danh-gia-records/${recordId}`).send({ so_thu_tu: 9 });
    expect(updated.status).toBe(200);
    expect(updated.body.so_thu_tu).toBe(9);

    const del = await request(app).delete(`/api/danh-gia-records/${recordId}`);
    expect(del.status).toBe(204);

    const list = await request(app).get(`/api/danh-gia-records?period_id=${periodId}`);
    expect(list.body.some((d: { id: number }) => d.id === recordId)).toBe(false);
  });

  it("rejects a bulk request when a member doesn't belong to the given team_id or period_id", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2048, 4);
    const teamId = await makeTeam(app, "Đánh giá invalid team", periodId);
    const otherTeamId = await makeTeam(app, "Đánh giá invalid team khác", periodId);
    const member = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự X", team_id: teamId, period_id: periodId });

    const res = await request(app)
      .post("/api/danh-gia-records/bulk")
      .send({
        period_id: periodId,
        team_id: otherTeamId,
        entries: [{ member_id: member.body.id, so_thu_tu: 1 }],
      });
    expect(res.status).toBe(400);
  });

  it("only lists records for the requested Tháng theo dõi, not other months", async () => {
    const app = createApp();
    const augId = await makePeriod(app, 2049, 8);
    const teamId = await makeTeam(app, "Đánh giá filter team", augId);
    const sepId = await makePeriod(app, 2049, 9);
    const member = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự Lọc Tháng", team_id: teamId, period_id: augId });

    const created = await request(app)
      .post("/api/danh-gia-records/bulk")
      .send({ period_id: augId, team_id: teamId, entries: [{ member_id: member.body.id, so_thu_tu: 1 }] });
    expect(created.status).toBe(201);

    const augList = await request(app).get(`/api/danh-gia-records?period_id=${augId}`);
    expect(augList.body.some((d: { member_id: number }) => d.member_id === member.body.id)).toBe(true);

    const sepList = await request(app).get(`/api/danh-gia-records?period_id=${sepId}`);
    expect(sepList.body.some((d: { member_id: number }) => d.member_id === member.body.id)).toBe(false);
  });
});
