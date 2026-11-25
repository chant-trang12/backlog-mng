import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

// Lịch thực hiện: đơn vị thực hiện xác nhận lịch khác thời gian mong muốn của đơn vị đề xuất.
describe("Yêu cầu tính năng: lịch thực hiện (mong muốn vs dự kiến)", () => {
  it("lệch lịch bắt buộc lý do, ghi nhật ký, đồng bộ hạn sang Hệ thống & Tính năng", async () => {
    const app = createApp();
    const a = await request(app).post("/api/departments").send({ name: "Lịch đơn vị A" });
    const b = await request(app).post("/api/departments").send({ name: "Lịch đơn vị B" });
    const sys = await request(app).post("/api/systems").send({ ma_he_thong: "HT-L1", ten_he_thong: "Lịch hệ thống", don_vi_quan_ly_id: b.body.id });
    const fr = await request(app).post("/api/feature-requests").send({ he_thong: "Lịch hệ thống", tieu_de: "Lịch yêu cầu 1", target_department_id: b.body.id, department_id: a.body.id, nguoi_de_xuat: "An", thoi_gian_mong_muon: "2027-01-15" });
    expect(fr.status).toBe(201);

    // Duyệt kèm lịch lệch nhưng thiếu lý do -> 400, CHƯA duyệt.
    const noReason = await request(app).post(`/api/feature-requests/${fr.body.id}/approve`).send({ thoi_gian_du_kien: "2027-06-15" });
    expect(noReason.status).toBe(400);
    expect(noReason.body.error).toMatch(/lý do/i);
    expect((await request(app).get(`/api/feature-requests?department_id=${b.body.id}`)).body.find((r: any) => r.id === fr.body.id).trang_thai).toBe("Chờ duyệt");

    const ok = await request(app).post(`/api/feature-requests/${fr.body.id}/approve`).send({ thoi_gian_du_kien: "2027-06-15", ly_do: "Thiếu nguồn lực quý I" });
    expect(ok.status).toBe(200);
    expect(ok.body.trang_thai).toBe("Đã duyệt");
    expect(ok.body.thoi_gian_du_kien).toBe("2027-06-15");
    expect(ok.body.thoi_gian_mong_muon).toBe("2027-01-15");

    // Điều chỉnh lần 2: định dạng sai -> 400; đúng -> ghi thêm nhật ký.
    expect((await request(app).post(`/api/feature-requests/${fr.body.id}/schedule`).send({ thoi_gian_du_kien: "sai", ly_do: "x" })).status).toBe(400);
    expect((await request(app).post(`/api/feature-requests/${fr.body.id}/schedule`).send({ thoi_gian_du_kien: "2027-04-01", ly_do: "Có thêm nhân sự" })).status).toBe(200);
    const log = await request(app).get(`/api/feature-requests/${fr.body.id}/schedule-log`);
    expect(log.body.length).toBe(2);
    expect(log.body[0]).toMatchObject({ tu_ngay: "2027-06-15", den_ngay: "2027-04-01", ly_do: "Có thêm nhân sự" });
    expect(log.body[1]).toMatchObject({ tu_ngay: "2027-01-15", den_ngay: "2027-06-15" });

    // Hạn ở Hệ thống & Tính năng theo lịch dự kiến, kèm lịch mong muốn để so sánh.
    const feats = await request(app).get(`/api/systems/${sys.body.id}/features?department_id=${b.body.id}`);
    const f = feats.body.find((x: any) => x.ten === "Lịch yêu cầu 1");
    expect(f.han_hoan_thanh).toBe("2027-04-01");
    expect(f.han_mong_muon).toBe("2027-01-15");

    // Đúng lịch mong muốn thì không cần lý do.
    const fr2 = await request(app).post("/api/feature-requests").send({ he_thong: "Lịch hệ thống", tieu_de: "Lịch yêu cầu 2", target_department_id: b.body.id, department_id: a.body.id, nguoi_de_xuat: "An", thoi_gian_mong_muon: "2027-02-01" });
    expect((await request(app).post(`/api/feature-requests/${fr2.body.id}/approve`).send({ thoi_gian_du_kien: "2027-02-01" })).status).toBe(200);
  });
});
