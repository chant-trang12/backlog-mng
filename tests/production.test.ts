import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("Production Readiness Features", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  describe("Security Headers (Helmet)", () => {
    it("sets security headers such as X-Content-Type-Options and X-Frame-Options", async () => {
      const res = await request(app).get("/health");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    });
  });

  describe("Route Param Validation (parsePositiveInt)", () => {
    it("returns 400 Bad Request when period ID is not a positive integer", async () => {
      const res = await request(app).get("/api/periods/not-a-number");
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/hợp lệ/i);
    });

    it("returns 400 Bad Request when period ID is negative or zero", async () => {
      const res = await request(app).get("/api/periods/0");
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/hợp lệ/i);
    });

    it("returns 400 Bad Request when member ID is invalid", async () => {
      const res = await request(app).put("/api/members/invalid").send({ ten_nv: "Test" });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/hợp lệ/i);
    });

    it("returns 400 Bad Request when task ID is invalid", async () => {
      const res = await request(app).get("/api/tasks/abc");
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/hợp lệ/i);
    });
  });

  describe("Global Error Handling", () => {
    it("returns 404 with standard message for undefined routes", async () => {
      const res = await request(app).get("/api/non-existent-route");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Not found" });
    });
  });
});
