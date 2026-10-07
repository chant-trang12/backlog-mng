import { describe, expect, it } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import { createApp } from "../src/app.js";

// Sinh buffer .xlsx cho test import (giống pattern tests/roadmap.test.ts).
async function xlsxBuffer(headers: string[], rows: (string | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Sheet1");
  sheet.addRow(headers);
  rows.forEach((r) => sheet.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function binaryParser(res: request.Response, callback: (err: Error | null, body?: Buffer) => void) {
  res.setEncoding("binary");
  let data = "";
  res.on("data", (c) => (data += c));
  res.on("end", () => callback(null, Buffer.from(data, "binary")));
}

async function makePeriod(app: ReturnType<typeof createApp>, year: number, month: number) {
  const res = await request(app).post("/api/periods").send({ year, month });
  return res.body.id as number;
}

async function makeTeam(app: ReturnType<typeof createApp>, name: string, periodId: number) {
  const res = await request(app).post("/api/teams").send({ name, period_id: periodId });
  return res.body.id as number;
}

// Tên duy nhất theo lần chạy — các tháng (period) được dùng chung giữa các
// file test và tháng mới tạo kế thừa team/nhân sự từ tháng "gần nhất" trên
// toàn DB test, nên tên tĩnh có thể bị nhân bản làm sai lệch assert.
let uniqueCounter = 0;
function uniqueName(prefix: string): string {
  uniqueCounter += 1;
  return `${prefix} ${Date.now()}-${uniqueCounter}`;
}

describe("CSKH: Sự cố", () => {
  it("creates with the new detailed columns, lists (team name + period label), updates, clears to null, and deletes", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2040, 1);
    const teamId = await makeTeam(app, "CSKH incident test team", periodId);

    const created = await request(app)
      .post("/api/incidents")
      .send({
        team_id: teamId,
        period_id: periodId,
        ten_su_co: "Lỗi đăng nhập portal",
        tao_boi: "Nguyễn Văn A",
        dich_vu_idc: "IDC quản lý",
        hien_tuong: "Không đăng nhập được",
        pham_vi_anh_huong: "50 khách hàng",
        nguyen_nhan: "Lỗi chứng chỉ",
        hanh_dong: "Cấp lại chứng chỉ",
        thoi_diem_ghi_nhan: "2026-10-07T08:30",
        thoi_diem_hoan_thanh: "2026-10-07T10:00",
        thoi_gian_xu_ly: "1 giờ 30 phút",
        gian_doad_dich_vu: "Có",
        thoi_gian_gian_doad: "1 giờ",
        ly_do_khong_gian_doad: null,
        dich_vu: "Portal",
        nhom_dich_vu: "Portal",
        don_vi_trach_nhiem: "Phòng CNTT",
        bu_site_trach_nhiem: "BU HN",
        cap_do_anh_huong: "Cấp 2",
        tinh_trang: "Đã đóng",
        link_ticket: "https://ticket.example.com/123",
        link_itsm: "https://itsm.example.com/456",
        danh_gia_sla: "Đạt",
        danh_gia_nguyen_nhan: "Lỗi kỹ thuật",
        dien_giai_vuot_sla: "Không vượt SLA",
      });
    expect(created.status).toBe(201);
    expect(created.body.ten_su_co).toBe("Lỗi đăng nhập portal");
    expect(created.body.thoi_diem_ghi_nhan).toBe("2026-10-07T08:30");
    expect(created.body.link_ticket).toBe("https://ticket.example.com/123");

    const list = await request(app).get("/api/incidents");
    const found = list.body.find((i: { id: number }) => i.id === created.body.id);
    expect(found.team_name).toBe("CSKH incident test team");
    expect(found.period_label).toBe("Tháng 1/2040");
    expect(found.hien_tuong).toBe("Không đăng nhập được");
    expect(found.danh_gia_sla).toBe("Đạt");

    // Cập nhật 1 phần + xóa trắng (gửi "") -> về null, không mất field khác.
    const updated = await request(app)
      .put(`/api/incidents/${created.body.id}`)
      .send({ tinh_trang: "Đang xử lý", nguyen_nhan: "", thoi_diem_hoan_thanh: "2026-10-07T11:45" });
    expect(updated.status).toBe(200);
    expect(updated.body.tinh_trang).toBe("Đang xử lý");
    expect(updated.body.nguyen_nhan).toBeNull();
    expect(updated.body.thoi_diem_hoan_thanh).toBe("2026-10-07T11:45");
    expect(updated.body.ten_su_co).toBe("Lỗi đăng nhập portal"); // giữ nguyên

    const del = await request(app).delete(`/api/incidents/${created.body.id}`);
    expect(del.status).toBe(204);
  });

  it("rejects an incident missing ten_su_co, or with an invalid team_id or period_id", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2040, 2);
    const teamId = await makeTeam(app, "CSKH incident invalid team", periodId);

    const missingName = await request(app)
      .post("/api/incidents")
      .send({ team_id: teamId, period_id: periodId, tao_boi: "x" });
    expect(missingName.status).toBe(400);

    const badTeam = await request(app)
      .post("/api/incidents")
      .send({ team_id: 999999, period_id: periodId, ten_su_co: "x" });
    expect(badTeam.status).toBe(400);

    const badPeriod = await request(app)
      .post("/api/incidents")
      .send({ team_id: teamId, period_id: 999999, ten_su_co: "x" });
    expect(badPeriod.status).toBe(400);
  });

  it("serves an import template with the 24 data columns and imports rows from an Excel file", async () => {
    const app = createApp();

    // File mẫu: 200 + đúng 24 cột theo thứ tự bảng dữ liệu.
    const tpl = await request(app)
      .get("/api/incidents/import-template")
      .buffer(true)
      .parse(binaryParser);
    expect(tpl.status).toBe(200);
    expect(tpl.headers["content-type"]).toContain("spreadsheetml");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(tpl.body as Buffer);
    const headerRow = wb.worksheets[0].getRow(1);
    const headerTexts: string[] = [];
    headerRow.eachCell((cell) => headerTexts.push(String(cell.value)));
    expect(headerTexts.length).toBe(24);
    expect(headerTexts[0]).toBe("Tạo bởi");
    expect(headerTexts[2]).toBe("Tên sự cố");
    expect(headerTexts[7]).toBe("Thời Điểm Ghi Nhận Sự Cố");
    expect(headerTexts[23]).toBe("Diễn giải lý do vượt SLA");

    // Import: dòng 1 hợp lệ (kèm thời điểm dd/mm/yyyy hh:mm), dòng 2 thiếu
    // Tên sự cố -> bị bỏ qua, dòng 3 hợp lệ.
    const periodId = await makePeriod(app, 2041, 3);
    const teamId = await makeTeam(app, "CSKH import team", periodId);
    const buf = await xlsxBuffer(
      ["Tạo bởi", "Tên sự cố", "Nguyên nhân", "Thời Điểm Ghi Nhận Sự Cố", "Link Ticket", "Tình trạng"],
      [
        ["QA A", "Su co import 1", "Loi he thong", "07/10/2026 08:30", "https://t.example/1", "Đang xử lý"],
        ["QA B", "", "Thiếu tên", "07/10/2026 09:00", "", ""],
        ["QA C", "Su co import 2", "", "2026-10-08 14:05", "", ""],
      ],
    );
    const imported = await request(app)
      .post(`/api/incidents/import?period_id=${periodId}&team_id=${teamId}`)
      .set("Content-Type", "application/octet-stream")
      .send(buf);
    expect(imported.status).toBe(201);
    expect(imported.body.imported).toBe(2);
    expect(imported.body.skipped).toHaveLength(1);
    expect(imported.body.skipped[0].row).toBe(3);
    expect(imported.body.skipped[0].reason).toContain("Tên sự cố");

    const list = await request(app).get("/api/incidents");
    const rows = list.body.filter((i: { team_id: number }) => i.team_id === teamId);
    expect(rows).toHaveLength(2);
    const first = rows.find((i: { ten_su_co: string }) => i.ten_su_co === "Su co import 1");
    const second = rows.find((i: { ten_su_co: string }) => i.ten_su_co === "Su co import 2");
    expect(first.tao_boi).toBe("QA A");
    expect(first.thoi_diem_ghi_nhan).toBe("2026-10-07T08:30"); // dd/mm/yyyy hh:mm -> datetime-local
    expect(first.link_ticket).toBe("https://t.example/1");
    expect(second.thoi_diem_ghi_nhan).toBe("2026-10-08T14:05"); // yyyy-mm-dd hh:mm
  });

  it("rejects an incident import missing the 'Tên sự cố' column, or without team/period", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2041, 4);
    const teamId = await makeTeam(app, "CSKH import invalid team", periodId);

    const buf = await xlsxBuffer(["Tạo bởi", "Hiện tượng"], [["QA", "x"]]);
    const res = await request(app)
      .post(`/api/incidents/import?period_id=${periodId}&team_id=${teamId}`)
      .set("Content-Type", "application/octet-stream")
      .send(buf);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Tên sự cố");

    const noTeam = await request(app)
      .post(`/api/incidents/import?period_id=${periodId}&team_id=999999`)
      .set("Content-Type", "application/octet-stream")
      .send(buf);
    expect(noTeam.status).toBe(400);

    const badFile = await request(app)
      .post(`/api/incidents/import?period_id=${periodId}&team_id=${teamId}`)
      .set("Content-Type", "application/octet-stream")
      .send("khong phai excel");
    expect(badFile.status).toBe(400);
  });
});

describe("CSKH: Nhân sự liên quan sự cố", () => {
  async function makeIncident(app: ReturnType<typeof createApp>, periodId: number, teamId: number, ten: string) {
    const res = await request(app).post("/api/incidents").send({ team_id: teamId, period_id: periodId, ten_su_co: ten });
    return res.body.id as number;
  }
  async function makeMember(app: ReturnType<typeof createApp>, periodId: number, teamId: number, name: string) {
    const res = await request(app).post("/api/members").send({ name, period_id: periodId, team_id: teamId });
    return res.body.id as number;
  }

  it("adds a related member, lists with member info, blocks duplicates, and removes", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2042, 1);
    const teamId = await makeTeam(app, "IM team", periodId);
    const incidentId = await makeIncident(app, periodId, teamId, "Su co IM 1");
    const memberName = uniqueName("Nguyen Van IM");
    const memberId = await makeMember(app, periodId, teamId, memberName);

    const created = await request(app)
      .post(`/api/incidents/${incidentId}/members`)
      .send({ member_id: memberId, noi_dung_cong_viec: "Vận hành hệ thống", nguyen_nhan: "Sơ suất vận hành" });
    expect(created.status).toBe(201);
    expect(created.body.member_name).toBe(memberName);
    expect(created.body.noi_dung_cong_viec).toBe("Vận hành hệ thống");

    const dup = await request(app)
      .post(`/api/incidents/${incidentId}/members`)
      .send({ member_id: memberId });
    expect(dup.status).toBe(400);
    expect(dup.body.error).toContain("đã có");

    const badMember = await request(app)
      .post(`/api/incidents/${incidentId}/members`)
      .send({ member_id: 999999 });
    expect(badMember.status).toBe(400);

    const list = await request(app).get(`/api/incidents/${incidentId}/members`);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].member_name).toBe(memberName);

    const del = await request(app).delete(`/api/incident-members/${created.body.id}`);
    expect(del.status).toBe(204);
    const listAfter = await request(app).get(`/api/incidents/${incidentId}/members`);
    expect(listAfter.body).toHaveLength(0);
  });

  it("Hạ KI records the auto reason, Tăng KI flips the flags, Trừ điểm records 50 and blocks a second time", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2042, 2);
    const teamId = await makeTeam(app, "IM action team", periodId);
    const incidentId = await makeIncident(app, periodId, teamId, "Su co han ki");
    const memberId = await makeMember(app, periodId, teamId, "Tran Thi IM");
    const row = await request(app)
      .post(`/api/incidents/${incidentId}/members`)
      .send({ member_id: memberId });
    const rowId = row.body.id;

    // Hạ KI — lý do tự sinh theo tên sự cố
    const haKi = await request(app).post(`/api/incident-members/${rowId}/ha-ki`);
    expect(haKi.status).toBe(200);
    expect(haKi.body.member_ha_ki).toBe(true);
    expect(haKi.body.member_tang_ki).toBe(false);
    const memberAfterHaKi = (await request(app).get(`/api/members?period_id=${periodId}`)).body
      .find((m: { id: number }) => m.id === memberId);
    expect(memberAfterHaKi.ha_ki).toBe(true);
    expect(memberAfterHaKi.ki_ly_do).toBe('Hạ KI do gây ra sự cố "Su co han ki"');

    // Tăng KI — bật cờ tang_ki, tự tắt hạ_ki
    const tangKi = await request(app).post(`/api/incident-members/${rowId}/tang-ki`);
    expect(tangKi.status).toBe(200);
    expect(tangKi.body.member_tang_ki).toBe(true);
    expect(tangKi.body.member_ha_ki).toBe(false);
    const memberAfterTangKi = (await request(app).get(`/api/members?period_id=${periodId}`)).body
      .find((m: { id: number }) => m.id === memberId);
    expect(memberAfterTangKi.tang_ki).toBe(true);
    expect(memberAfterTangKi.ha_ki).toBe(false);
    expect(memberAfterTangKi.ki_ly_do).toBe('Tăng KI do xử lý sự cố "Su co han ki"');

    // Trừ điểm cá nhân — 50 điểm, mỗi dòng 1 lần
    const truDiem = await request(app).post(`/api/incident-members/${rowId}/tru-diem`);
    expect(truDiem.status).toBe(200);
    expect(truDiem.body.tru_diem_so_diem).toBe(50);
    expect(truDiem.body.tru_diem_luc).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(truDiem.body.tru_diem_ly_do).toBe('Trừ điểm cá nhân do sự cố "Su co han ki"');
    const again = await request(app).post(`/api/incident-members/${rowId}/tru-diem`);
    expect(again.status).toBe(400);
    expect(again.body.error).toContain("chỉ trừ được 1 lần");
  });

  it('"Trừ điểm cá nhân" từ Sự cố kéo "Điểm cá nhân (Tính theo task)" <= 0 -> tự động Hạ KI (dùng chung logic autoHaKiNeuDiemNhoHonBang0 với Nhân sự tham gia task)', async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2042, 5);
    const teamId = await makeTeam(app, "IM auto ha ki team", periodId);
    const memberId = await makeMember(app, periodId, teamId, "Bui Van AutoHaKi");

    // Điểm task: 40 (thẳng % Đánh giá, không nhân tỷ lệ — xem listKpiTheoTask).
    const task = await request(app)
      .post(`/api/periods/${periodId}/tasks`)
      .send({ team: "IM auto ha ki team", nhiem_vu: "Task cho auto ha KI" });
    await request(app).put(`/api/tasks/${task.body.id}`).send({ cpo_danh_gia: 40 });
    await request(app).post(`/api/tasks/${task.body.id}/members`).send({ member_id: memberId, ty_le_dong_gop: 100 });

    const before = (await request(app).get(`/api/members?period_id=${periodId}`)).body.find(
      (m: { id: number }) => m.id === memberId,
    );
    expect(before.ha_ki).toBe(false);

    const incidentId = await makeIncident(app, periodId, teamId, "Su co keo diem am");
    const im = await request(app).post(`/api/incidents/${incidentId}/members`).send({ member_id: memberId });
    // Trừ lần 1: 40 - 50 = -10 -> đã <= 0, phải tự Hạ KI ngay (không cần đợi dòng trừ thứ 2).
    const truDiem = await request(app).post(`/api/incident-members/${im.body.id}/tru-diem`);
    expect(truDiem.body.member_ha_ki).toBe(true);

    const after = (await request(app).get(`/api/members?period_id=${periodId}`)).body.find(
      (m: { id: number }) => m.id === memberId,
    );
    expect(after.ha_ki).toBe(true);
    expect(after.tang_ki).toBe(false);
    expect(after.ki_ly_do).toBe("Tự động trừ KI do điểm cá nhân <= 0");

    const kpi = await request(app).get(`/api/kpi-theo-task?period_id=${periodId}`);
    const row = kpi.body.find((r: { member_id: number }) => r.member_id === memberId);
    expect(row.tong_diem).toBe(-10);
  });

  it("rejects actions for a missing incident-member row", async () => {
    const app = createApp();
    for (const path of ["/api/incident-members/999999/ha-ki", "/api/incident-members/999999/tang-ki", "/api/incident-members/999999/tru-diem"]) {
      const res = await request(app).post(path);
      expect(res.status).toBe(404);
    }
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
