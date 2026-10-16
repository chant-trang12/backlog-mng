import { afterEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errorHandler.middleware.js";
import { notFound } from "../src/middleware/notFound.middleware.js";

// ATTT (WSTG-ERRH): lỗi hệ thống không lộ message/cause nội bộ cho người dùng.
function fakeRes(statusCode = 200) {
  const out: { status?: number; json?: any; html?: string; type?: string } = {};
  const res: any = {
    statusCode,
    status(c: number) {
      out.status = c;
      return res;
    },
    json(b: unknown) {
      out.json = b;
      return res;
    },
    type(t: string) {
      out.type = t;
      return res;
    },
    send(b: string) {
      out.html = b;
      return res;
    },
  };
  return { out, res };
}

describe("errorHandler — ẩn chi tiết lỗi nội bộ ở production", () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
    vi.restoreAllMocks();
  });

  it("production: 500 chỉ trả thông báo chung + mã lỗi, không lộ SQL/đường dẫn/cause", () => {
    process.env.NODE_ENV = "production";
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err: any = new Error("SELECT * FROM users failed at D:\\AppCore\\secret.js");
    err.cause = new Error("connect ECONNREFUSED 172.16.55.7:8411");
    const { out, res } = fakeRes();
    errorHandler(err, { headers: {}, originalUrl: "/api/x" } as any, res, (() => {}) as any);

    expect(out.status).toBe(500);
    expect(JSON.stringify(out.json)).not.toMatch(/SELECT|AppCore|ECONNREFUSED|172\.16/);
    expect(out.json.error).toMatch(/mã lỗi/);
    expect(out.json.errorId).toMatch(/^[0-9a-f]{8}$/);
    expect(out.json.cause).toBeUndefined();
  });

  it("lỗi 4xx (validate) vẫn trả message cho người dùng", () => {
    process.env.NODE_ENV = "production";
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { out, res } = fakeRes(400);
    errorHandler(new Error("Trường 'name' là bắt buộc"), { headers: {}, originalUrl: "/api/x" } as any, res, (() => {}) as any);
    expect(out.status).toBe(400);
    expect(out.json.error).toBe("Trường 'name' là bắt buộc");
  });

  it("trình duyệt điều hướng (Accept HTML, không phải /api): trả trang HTML thân thiện, không JSON thô", () => {
    process.env.NODE_ENV = "production";
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { out, res } = fakeRes();
    errorHandler(new Error("boom <script>"), { headers: { accept: "text/html" }, originalUrl: "/auth/callback" } as any, res, (() => {}) as any);
    expect(out.type).toBe("html");
    expect(out.html).toContain("Về trang chủ");
    expect(out.html).not.toContain("boom");
  });

  it("404 trên trình duyệt là trang HTML; 404 API vẫn là JSON", () => {
    const a = fakeRes();
    notFound({ headers: { accept: "text/html" }, originalUrl: "/khong-co" } as any, a.res);
    expect(a.out.status).toBe(404);
    expect(a.out.html).toContain("Không tìm thấy trang");

    const b = fakeRes();
    notFound({ headers: { accept: "application/json" }, originalUrl: "/api/khong-co" } as any, b.res);
    expect(b.out.json).toEqual({ error: "Not found" });
  });
});
