import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

describe("Tính năng theo hệ thống", () => {
  it("duyệt yêu cầu -> vào đúng hệ thống (khớp tên không phân biệt hoa/dấu); hệ thống lạ -> chưa phân loại, gán được", async () => {
    const app = createApp();
    const dept = await request(app).post("/api/departments").send({ name: "SF phòng A" });
    const sys = await request(app).post("/api/systems").send({ ma_he_thong: "HT-F1", ten_he_thong: "Cổng Tính Năng F1", don_vi_quan_ly_id: dept.body.id });
    const mk = async (he_thong: string, tieu_de: string) => {
      const c = await request(app).post("/api/feature-requests").send({ he_thong, tieu_de, target_department_id: dept.body.id, department_id: dept.body.id, nguoi_de_xuat: "An" });
      expect(c.status).toBe(201);
      const a = await request(app).post(`/api/feature-requests/${c.body.id}/approve`).send({});
      expect(a.status).toBe(200);
      return c.body.id as number;
    };
    // Yêu cầu CHỜ DUYỆT cũng đã có mặt (trạng thái Chờ duyệt) — tất cả yêu cầu đều được quản lý ở đây.
    const pend = await request(app).post("/api/feature-requests").send({ he_thong: "Cổng Tính Năng F1", tieu_de: "SF yêu cầu chờ duyệt", target_department_id: dept.body.id, department_id: dept.body.id, nguoi_de_xuat: "An" });
    const l0 = await request(app).get(`/api/systems/${sys.body.id}/features?department_id=${dept.body.id}`);
    expect(l0.body.find((f: any) => f.ten === "SF yêu cầu chờ duyệt").trang_thai_hien_thi).toBe("cho_duyet");
    const rej = await request(app).post(`/api/feature-requests/${pend.body.id}/reject`).send({ ghi_chu_xu_ly: "không phù hợp" });
    expect(rej.status).toBe(200);
    expect((await request(app).get(`/api/systems/${sys.body.id}/features?department_id=${dept.body.id}`)).body.find((f: any) => f.ten === "SF yêu cầu chờ duyệt").trang_thai_hien_thi).toBe("tu_choi");
    await request(app).delete(`/api/feature-requests/${pend.body.id}`);
    expect((await request(app).get(`/api/systems/${sys.body.id}/features?department_id=${dept.body.id}`)).body.some((f: any) => f.ten === "SF yêu cầu chờ duyệt")).toBe(false); // xoá yêu cầu -> biến mất
    await mk("cong tinh nang f1", "SF yêu cầu một");
    const lst = await request(app).get(`/api/systems/${sys.body.id}/features?department_id=${dept.body.id}`);
    expect(lst.body.length).toBe(1);
    expect(lst.body[0].ten).toBe("SF yêu cầu một");
    expect(lst.body[0].trang_thai).toBe("chua_bat_dau");
    expect(lst.body[0].don_vi_yeu_cau_id).toBe(dept.body.id);
    expect(lst.body[0].thieu_tai_lieu).toBe(true);

    // Hệ thống chưa có trong danh mục -> tự tạo hệ thống mới, tính năng nằm trong đó (không bị bỏ sót).
    await mk("Hệ thống chưa quản lý XYZ", "SF yêu cầu lạ");
    const all = await request(app).get(`/api/systems?department_id=${dept.body.id}`);
    const xyz = all.body.find((s: any) => s.ten_he_thong === "Hệ thống chưa quản lý XYZ");
    expect(xyz).toBeTruthy();
    expect(xyz.so_tinh_nang).toBe(1);
    expect((await request(app).get(`/api/system-features/unassigned?department_id=${dept.body.id}`)).body.some((f: any) => f.ten === "SF yêu cầu lạ")).toBe(false);
    // Gõ tên khác hoa/dấu của hệ thống đã có -> dùng chung, không tạo trùng.
    await mk("HỆ THỐNG CHƯA QUẢN LÝ xyz", "SF yêu cầu lạ hai");
    expect((await request(app).get(`/api/systems?department_id=${dept.body.id}`)).body.filter((s: any) => /chua quan ly xyz/i.test(s.ten_he_thong.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))).length).toBe(1);
    // Gán lại (gộp) sang hệ thống khác vẫn dùng được.
    const odd = (await request(app).get(`/api/systems/${xyz.id}/features?department_id=${dept.body.id}`)).body[0];
    const as = await request(app).post(`/api/system-features/${odd.id}/assign`).send({ system_id: sys.body.id });
    expect(as.status).toBe(200);
    expect((await request(app).get(`/api/systems/${sys.body.id}/features?department_id=${dept.body.id}`)).body.length).toBe(2);
  });

  it("nhập tay: kiểm tra dữ liệu, trạng thái suy ra, tài liệu", async () => {
    const app = createApp();
    const dept = await request(app).post("/api/departments").send({ name: "SF phòng B" });
    const sys = await request(app).post("/api/systems").send({ ma_he_thong: "HT-F2", ten_he_thong: "Hệ thống F2", don_vi_quan_ly_id: dept.body.id });
    const base = { system_id: sys.body.id, ten: "Tra cứu hồ sơ", don_vi_yeu_cau_id: dept.body.id, ngay_bat_dau: "2026-01-01", han_hoan_thanh: "2026-02-01" };
    expect((await request(app).post("/api/system-features").send({ ...base, ten: "" })).status).toBe(400);
    expect((await request(app).post("/api/system-features").send({ ...base, han_hoan_thanh: "2025-12-01" })).status).toBe(400);
    expect((await request(app).post("/api/system-features").send({ ...base, don_vi_yeu_cau_id: undefined })).status).toBe(400);
    const ok = await request(app).post("/api/system-features").send(base);
    expect(ok.status).toBe(201);
    expect(ok.body.trang_thai_hien_thi).toBe("qua_han"); // hạn 2026-02-01 đã qua
    expect((await request(app).post("/api/system-features").send({ ...base, ma_tinh_nang: ok.body.ma_tinh_nang })).status).toBe(400); // trùng mã

    const done = await request(app).put(`/api/system-features/${ok.body.id}`).send({ ...base, ngay_hoan_thanh_thuc_te: "2026-02-10" });
    expect(done.body.trang_thai).toBe("hoan_thanh");
    expect(done.body.tre_ngay).toBe(9);

    const up = await request(app).post(`/api/system-features/${ok.body.id}/docs/dac_ta?filename=${encodeURIComponent("dac-ta.png")}`).set("Content-Type", "application/octet-stream").send(PNG);
    expect(up.status).toBe(200);
    expect(up.body.docs.length).toBe(1);
    expect(up.body.required_docs.find((d: any) => d.key === "dac_ta").has).toBe(true);
    const bin = await request(app).get(`/api/system-features/docs/${up.body.docs[0].id}`);
    expect(bin.status).toBe(200);
    expect(bin.headers["content-type"]).toMatch(/image\/png/);
    const evil = await request(app).post(`/api/system-features/${ok.body.id}/docs/dac_ta?filename=x.exe`).set("Content-Type", "application/octet-stream").send(Buffer.from("MZ"));
    expect(evil.status).toBe(400);
  });

  it("chi tiết tính năng: tiến độ, tài liệu có phiên bản, lịch sử hoạt động", async () => {
    const app = createApp();
    const dept = await request(app).post("/api/departments").send({ name: "SF phòng D" });
    const sys = await request(app).post("/api/systems").send({ ma_he_thong: "HT-F4", ten_he_thong: "Hệ thống F4", don_vi_quan_ly_id: dept.body.id });
    const f = await request(app).post("/api/system-features").send({ system_id: sys.body.id, ten: "Chi tiết A", don_vi_yeu_cau_id: dept.body.id, ngay_bat_dau: "2026-01-01", han_hoan_thanh: "2099-01-01", nguoi_phu_trach_name: "Bình" });
    expect(f.body.tien_do).toBe(0);
    expect((await request(app).post(`/api/system-features/${f.body.id}/progress`).send({ tien_do: 150 })).status).toBe(400);
    const p = await request(app).post(`/api/system-features/${f.body.id}/progress`).send({ tien_do: 70, ghi_chu: "xong phần tra cứu" });
    expect(p.status).toBe(200);
    expect(p.body.tien_do).toBe(70);
    expect(p.body.trang_thai).toBe("dang_thuc_hien"); // tiến độ > 0 -> tự chuyển Đang thực hiện
    const full = await request(app).post(`/api/system-features/${f.body.id}/progress`).send({ tien_do: 100 });
    expect(full.body.trang_thai).toBe("hoan_thanh");
    expect(full.body.ngay_hoan_thanh_thuc_te).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const PNG1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
    const up = await request(app).post(`/api/system-features/${f.body.id}/docs/khac?filename=a.png&version=1.2&release_date=2026-11-19&note=${encodeURIComponent("bản đầu")}`).set("Content-Type", "application/octet-stream").send(PNG1);
    expect(up.status).toBe(200);
    expect(up.body.docs[0]).toMatchObject({ doc_key: "khac", version: "1.2", release_date: "2026-11-19", change_note: "bản đầu" });
    expect((await request(app).post(`/api/system-features/${f.body.id}/docs/khong_co?filename=a.png`).set("Content-Type", "application/octet-stream").send(PNG1)).status).toBe(400);
    const inline = await request(app).get(`/api/system-features/docs/${up.body.docs[0].id}?inline=1`);
    expect(inline.headers["content-disposition"]).toMatch(/^inline/);

    const ev = await request(app).get(`/api/system-features/${f.body.id}/events`);
    expect(ev.body.map((e: any) => e.kind)).toEqual(expect.arrayContaining(["create", "progress", "doc"]));
    expect(ev.body.some((e: any) => /70%/.test(e.text))).toBe(true);
  });

  it("phạm vi phòng ban: A yêu cầu 5 tính năng cho B thực hiện -> cả A và B thấy đủ 5, phòng C không thấy", async () => {
    const app = createApp();
    const a = await request(app).post("/api/departments").send({ name: "Phạm vi A" });
    const b = await request(app).post("/api/departments").send({ name: "Phạm vi B" });
    const c = await request(app).post("/api/departments").send({ name: "Phạm vi C" });
    const sys = await request(app).post("/api/systems").send({ ma_he_thong: "HT-F5", ten_he_thong: "Hệ thống F5", don_vi_quan_ly_id: b.body.id });
    for (let i = 1; i <= 5; i++) {
      const fr = await request(app).post("/api/feature-requests").send({ he_thong: "Hệ thống F5", tieu_de: `Phạm vi yêu cầu ${i}`, target_department_id: b.body.id, department_id: a.body.id, nguoi_de_xuat: "An" });
      expect(fr.status).toBe(201);
    }
    const list = (d: number) => request(app).get(`/api/systems/${sys.body.id}/features?department_id=${d}`);
    expect((await list(b.body.id)).body.length).toBe(5); // đơn vị thực hiện
    expect((await list(a.body.id)).body.length).toBe(5); // đơn vị yêu cầu
    expect((await list(c.body.id)).body.length).toBe(0); // phòng không liên quan
    // Chưa chọn phòng -> không có dữ liệu (giống Yêu cầu tính năng).
    expect((await request(app).get(`/api/systems/${sys.body.id}/features`)).body.length).toBe(0);
    // Số liệu thẻ hệ thống cũng theo phòng đang xem.
    const count = async (d: number) => (await request(app).get(`/api/systems?department_id=${d}`)).body.find((s: any) => s.id === sys.body.id).so_tinh_nang;
    expect(await count(b.body.id)).toBe(5);
    expect(await count(c.body.id)).toBe(0);
    // Tính năng nhập tay của hệ thống do B quản lý: B thấy, A (không liên quan) không thấy.
    const mine = await request(app).post("/api/system-features").send({ system_id: sys.body.id, ten: "Nhập tay của B", don_vi_yeu_cau_id: b.body.id, ngay_bat_dau: "2026-01-01", han_hoan_thanh: "2026-02-01" });
    expect(mine.status).toBe(201);
    expect((await list(b.body.id)).body.length).toBe(6);
    expect((await list(a.body.id)).body.length).toBe(5);
  });
});
