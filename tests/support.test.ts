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

describe("Team & Nhân sự: Hỗ trợ", () => {
  it("creates, lists (with member/team thực hiện/team nhận/period details), updates, and deletes a support record", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2046, 1);
    const teamThucHienId = await makeTeam(app, "Support thực hiện team", periodId);
    const teamNhanId = await makeTeam(app, "Support nhận team", periodId);
    const member = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự Hỗ trợ", team_id: teamThucHienId, period_id: periodId });

    const created = await request(app).post("/api/support-records").send({
      member_id: member.body.id,
      team_nhan_ho_tro_id: teamNhanId,
      period_id: periodId,
      noi_dung: "Hỗ trợ xử lý sự cố",
      ngay_ho_tro: "2026-01-15",
      nguoi_xac_nhan: "Nguyễn Văn A",
    });
    expect(created.status).toBe(201);
    expect(created.body.noi_dung).toBe("Hỗ trợ xử lý sự cố");

    const list = await request(app).get(`/api/support-records?period_id=${periodId}`);
    const found = list.body.find((s: { id: number }) => s.id === created.body.id);
    expect(found.member_name).toBe("Nhân sự Hỗ trợ");
    expect(found.team_name).toBe("Support thực hiện team");
    expect(found.team_nhan_ho_tro_name).toBe("Support nhận team");
    expect(found.period_label).toBe("Tháng 1/2046");
    expect(found.nguoi_xac_nhan).toBe("Nguyễn Văn A");

    const updated = await request(app)
      .put(`/api/support-records/${created.body.id}`)
      .send({ noi_dung: "Đã hỗ trợ xong", nguoi_xac_nhan: "Trần Thị B" });
    expect(updated.status).toBe(200);
    expect(updated.body.noi_dung).toBe("Đã hỗ trợ xong");
    expect(updated.body.nguoi_xac_nhan).toBe("Trần Thị B");

    const del = await request(app).delete(`/api/support-records/${created.body.id}`);
    expect(del.status).toBe(204);
  });

  it("rejects a support record with an invalid member_id, team_nhan_ho_tro_id, or period_id", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2046, 2);
    const teamId = await makeTeam(app, "Support invalid team", periodId);
    const member = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự X", team_id: teamId, period_id: periodId });

    const badMember = await request(app)
      .post("/api/support-records")
      .send({ member_id: 999999, team_nhan_ho_tro_id: teamId, period_id: periodId });
    expect(badMember.status).toBe(400);

    const badTeamNhan = await request(app)
      .post("/api/support-records")
      .send({ member_id: member.body.id, team_nhan_ho_tro_id: 999999, period_id: periodId });
    expect(badTeamNhan.status).toBe(400);

    const badPeriod = await request(app)
      .post("/api/support-records")
      .send({ member_id: member.body.id, team_nhan_ho_tro_id: teamId, period_id: 999999 });
    expect(badPeriod.status).toBe(400);
  });

  it("cascades deletion when the parent period or member is deleted", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2046, 3);
    const teamId = await makeTeam(app, "Support cascade team", periodId);
    const member = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự Z", team_id: teamId, period_id: periodId });
    const record = await request(app)
      .post("/api/support-records")
      .send({ member_id: member.body.id, team_nhan_ho_tro_id: teamId, period_id: periodId });

    await request(app).delete(`/api/members/${member.body.id}`);

    const list = await request(app).get(`/api/support-records?period_id=${periodId}`);
    expect(list.body.some((s: { id: number }) => s.id === record.body.id)).toBe(false);
  });

  it("only lists records for the requested Tháng theo dõi, not other months", async () => {
    const app = createApp();
    const augId = await makePeriod(app, 2047, 8);
    const teamId = await makeTeam(app, "Support filter team", augId);
    const sepId = await makePeriod(app, 2047, 9);
    const member = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự Lọc Tháng", team_id: teamId, period_id: augId });

    const record = await request(app)
      .post("/api/support-records")
      .send({ member_id: member.body.id, team_nhan_ho_tro_id: teamId, period_id: augId });
    expect(record.status).toBe(201);

    const augList = await request(app).get(`/api/support-records?period_id=${augId}`);
    expect(augList.body.some((s: { id: number }) => s.id === record.body.id)).toBe(true);

    const sepList = await request(app).get(`/api/support-records?period_id=${sepId}`);
    expect(sepList.body.some((s: { id: number }) => s.id === record.body.id)).toBe(false);
  });
});
