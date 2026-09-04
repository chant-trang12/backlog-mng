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

// Tháng mới tạo kế thừa team/nhân sự từ tháng "gần nhất" trên TOÀN BỘ DB test
// (dùng chung file với các test khác) — chọn năm chắc chắn lớn hơn mọi năm
// khác đang có để đảm bảo period vừa tạo luôn là tháng gần nhất thật sự.
async function nextAvailableYear(app: ReturnType<typeof createApp>, baseline: number) {
  const periods = await request(app).get("/api/periods");
  const maxYear = Math.max(baseline, ...periods.body.map((p: { year: number }) => p.year));
  return maxYear + 1;
}

describe("Team & Nhân sự: Đào tạo nội bộ và Chứng chỉ quốc tế", () => {
  it("creates, lists (with member/team/period details), updates, and deletes a training record", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2047, 1);
    const teamId = await makeTeam(app, "Training test team", periodId);
    const member = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự Đào tạo", team_id: teamId, period_id: periodId });

    const created = await request(app)
      .post("/api/training-records")
      .send({
        member_id: member.body.id,
        period_id: periodId,
        loai: "Chứng chỉ QT",
        ngay_thuc_hien: "2047-01-15",
        nguoi_xac_nhan: "Trưởng nhóm A",
        noi_dung: "AWS Cloud Practitioner",
      });
    expect(created.status).toBe(201);
    expect(created.body.loai).toBe("Chứng chỉ QT");
    expect(created.body.ngay_thuc_hien).toBe("2047-01-15");
    expect(created.body.nguoi_xac_nhan).toBe("Trưởng nhóm A");
    expect(created.body.noi_dung).toBe("AWS Cloud Practitioner");

    const list = await request(app).get(`/api/training-records?period_id=${periodId}`);
    const found = list.body.find((t: { id: number }) => t.id === created.body.id);
    expect(found.member_name).toBe("Nhân sự Đào tạo");
    expect(found.team_name).toBe("Training test team");
    expect(found.period_label).toBe("Tháng 1/2047");

    const updated = await request(app)
      .put(`/api/training-records/${created.body.id}`)
      .send({ loai: "Đào tạo", noi_dung: "Khóa Scrum Master" });
    expect(updated.status).toBe(200);
    expect(updated.body.loai).toBe("Đào tạo");
    expect(updated.body.noi_dung).toBe("Khóa Scrum Master");

    const del = await request(app).delete(`/api/training-records/${created.body.id}`);
    expect(del.status).toBe(204);
  });

  it("rejects a training record with missing/invalid loai, invalid member_id, or invalid period_id", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2047, 2);
    const teamId = await makeTeam(app, "Training invalid team", periodId);
    const member = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự X", team_id: teamId, period_id: periodId });

    const missingLoai = await request(app)
      .post("/api/training-records")
      .send({ member_id: member.body.id, period_id: periodId });
    expect(missingLoai.status).toBe(400);

    const badLoai = await request(app)
      .post("/api/training-records")
      .send({ member_id: member.body.id, period_id: periodId, loai: "Không hợp lệ" });
    expect(badLoai.status).toBe(400);

    const badMember = await request(app)
      .post("/api/training-records")
      .send({ member_id: 999999, period_id: periodId, loai: "Đào tạo" });
    expect(badMember.status).toBe(400);

    const badPeriod = await request(app)
      .post("/api/training-records")
      .send({ member_id: member.body.id, period_id: 999999, loai: "Đào tạo" });
    expect(badPeriod.status).toBe(400);
  });

  it("cascades deletion when the parent period or member is deleted", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2047, 4);
    const teamId = await makeTeam(app, "Training cascade team", periodId);
    const member = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự Z", team_id: teamId, period_id: periodId });
    const record = await request(app)
      .post("/api/training-records")
      .send({ member_id: member.body.id, period_id: periodId, loai: "Đào tạo" });

    await request(app).delete(`/api/members/${member.body.id}`);

    const list = await request(app).get(`/api/training-records?period_id=${periodId}`);
    expect(list.body.some((t: { id: number }) => t.id === record.body.id)).toBe(false);
  });

  it("only lists records for the requested Tháng theo dõi, not other months", async () => {
    const app = createApp();
    const augId = await makePeriod(app, 2048, 8);
    const teamId = await makeTeam(app, "Training filter team", augId);
    const sepId = await makePeriod(app, 2048, 9);
    const member = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự Lọc Tháng", team_id: teamId, period_id: augId });

    const record = await request(app)
      .post("/api/training-records")
      .send({ member_id: member.body.id, period_id: augId, loai: "Đào tạo" });
    expect(record.status).toBe(201);

    const augList = await request(app).get(`/api/training-records?period_id=${augId}`);
    expect(augList.body.some((t: { id: number }) => t.id === record.body.id)).toBe(true);

    const sepList = await request(app).get(`/api/training-records?period_id=${sepId}`);
    expect(sepList.body.some((t: { id: number }) => t.id === record.body.id)).toBe(false);
  });

  it("sửa hoặc xóa 1 bản ghi Đào tạo chỉ ảnh hưởng đúng tháng đó, không ảnh hưởng tháng khác", async () => {
    const app = createApp();
    const testYear = await nextAvailableYear(app, 2049);
    const augId = await makePeriod(app, testYear, 8);
    const teamAugId = await makeTeam(app, "Training edit-delete scope team", augId);
    const sepId = await makePeriod(app, testYear, 9);
    const teamSepId = (await request(app).get(`/api/teams?period_id=${sepId}`)).body.find(
      (t: { name: string }) => t.name === "Training edit-delete scope team",
    ).id;

    const memberAug = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự Sửa Xóa", team_id: teamAugId, period_id: augId });
    const memberSep = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự Sửa Xóa", team_id: teamSepId, period_id: sepId });

    const recordAug = await request(app)
      .post("/api/training-records")
      .send({ member_id: memberAug.body.id, period_id: augId, loai: "Đào tạo", noi_dung: "Ban đầu" });
    const recordSep = await request(app)
      .post("/api/training-records")
      .send({ member_id: memberSep.body.id, period_id: sepId, loai: "Đào tạo", noi_dung: "Ban đầu" });

    const updated = await request(app)
      .put(`/api/training-records/${recordSep.body.id}`)
      .send({ noi_dung: "Đã sửa ở tháng 9" });
    expect(updated.status).toBe(200);
    expect(updated.body.noi_dung).toBe("Đã sửa ở tháng 9");

    const augAfterEdit = await request(app).get(`/api/training-records?period_id=${augId}`);
    const augRecordAfterEdit = augAfterEdit.body.find((t: { id: number }) => t.id === recordAug.body.id);
    expect(augRecordAfterEdit.noi_dung).toBe("Ban đầu");

    const del = await request(app).delete(`/api/training-records/${recordSep.body.id}`);
    expect(del.status).toBe(204);

    const augAfterDelete = await request(app).get(`/api/training-records?period_id=${augId}`);
    expect(augAfterDelete.body.some((t: { id: number }) => t.id === recordAug.body.id)).toBe(true);

    const sepAfterDelete = await request(app).get(`/api/training-records?period_id=${sepId}`);
    expect(sepAfterDelete.body.some((t: { id: number }) => t.id === recordSep.body.id)).toBe(false);
  });
});
