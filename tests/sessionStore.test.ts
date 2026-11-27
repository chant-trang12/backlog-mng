import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import session from "express-session";
import type { SessionData } from "express-session";
import request from "supertest";
import { db, initDatabase } from "../src/db/database.js";
import { KnexSessionStore } from "../src/db/sessionStore.js";
import { buildSessionOptions, resolveSessionSecret, sessionIdleMs } from "../src/session.config.js";

function call<T>(fn: (cb: (err?: unknown, v?: T) => void) => void): Promise<T | undefined> {
  return new Promise((resolve, reject) => fn((err, v) => (err ? reject(err) : resolve(v))));
}

function fakeSession(expiresInMs: number, extra: Record<string, unknown> = {}): SessionData {
  return {
    cookie: { expires: new Date(Date.now() + expiresInMs), originalMaxAge: expiresInMs },
    ...extra,
  } as unknown as SessionData;
}

describe("KnexSessionStore — phiên lưu trong DB", () => {
  let store: KnexSessionStore;

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(async () => {
    await db("sessions").delete();
    store = new KnexSessionStore(db, initDatabase, 45 * 60 * 1000);
  });

  it("set rồi get trả lại đúng dữ liệu phiên", async () => {
    await call<void>((cb) => store.set("sid-1", fakeSession(60_000, { loginAt: 123 }), cb));
    const sess = (await call<SessionData | null>((cb) => store.get("sid-1", cb))) as any;
    expect(sess.loginAt).toBe(123);
  });

  it("store mới (giả lập restart dịch vụ) vẫn đọc được phiên cũ", async () => {
    await call<void>((cb) => store.set("sid-restart", fakeSession(60_000, { loginAt: 1 }), cb));
    const afterRestart = new KnexSessionStore(db, initDatabase, 45 * 60 * 1000);
    const sess = (await call<SessionData | null>((cb) => afterRestart.get("sid-restart", cb))) as any;
    expect(sess?.loginAt).toBe(1);
  });

  it("set 2 lần cùng sid thì ghi đè, không lỗi trùng khoá", async () => {
    await call<void>((cb) => store.set("sid-2", fakeSession(60_000, { v: 1 }), cb));
    await call<void>((cb) => store.set("sid-2", fakeSession(60_000, { v: 2 }), cb));
    const sess = (await call<SessionData | null>((cb) => store.get("sid-2", cb))) as any;
    expect(sess.v).toBe(2);
    expect((await db("sessions").where({ sid: "sid-2" })).length).toBe(1);
  });

  it("phiên đã hết hạn: get trả null và xoá dòng", async () => {
    await call<void>((cb) => store.set("sid-old", fakeSession(-1000), cb));
    expect(await call<SessionData | null>((cb) => store.get("sid-old", cb))).toBeNull();
    expect(await db("sessions").where({ sid: "sid-old" }).first()).toBeUndefined();
  });

  it("touch gia hạn expires_at", async () => {
    await call<void>((cb) => store.set("sid-t", fakeSession(1_000), cb));
    const before = Number((await db("sessions").where({ sid: "sid-t" }).first()).expires_at);
    await call<void>((cb) => store.touch("sid-t", fakeSession(600_000), cb));
    const after = Number((await db("sessions").where({ sid: "sid-t" }).first()).expires_at);
    expect(after).toBeGreaterThan(before);
  });

  it("destroy xoá phiên", async () => {
    await call<void>((cb) => store.set("sid-d", fakeSession(60_000), cb));
    await call<void>((cb) => store.destroy("sid-d", cb));
    expect(await call<SessionData | null>((cb) => store.get("sid-d", cb))).toBeNull();
  });
});

describe("KnexSessionStore + express-session — phiên sống qua restart", () => {
  function buildApp() {
    const app = express();
    app.use(
      session({
        ...buildSessionOptions(),
        secret: "test-secret-for-session-store-0123456789",
        store: new KnexSessionStore(db, initDatabase, sessionIdleMs()),
      }),
    );
    app.post("/login", (req, res) => {
      (req.session as any).user = { username: "kiennv" };
      res.json({ ok: true });
    });
    app.get("/me", (req, res) => res.json({ user: (req.session as any).user ?? null }));
    return app;
  }

  it("cookie phiên từ app cũ vẫn dùng được ở app mới (giả lập restart)", async () => {
    const login = await request(buildApp()).post("/login");
    const cookie = login.headers["set-cookie"];
    expect(cookie).toBeDefined();

    const me = await request(buildApp()).get("/me").set("Cookie", cookie);
    expect(me.body.user).toEqual({ username: "kiennv" });
  });
});

describe("resolveSessionSecret", () => {
  const original = { NODE_ENV: process.env.NODE_ENV, SESSION_SECRET: process.env.SESSION_SECRET };

  afterEach(() => {
    process.env.NODE_ENV = original.NODE_ENV;
    if (original.SESSION_SECRET === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = original.SESSION_SECRET;
  });

  it("dev/test: thiếu SESSION_SECRET thì dùng chuỗi mặc định", () => {
    process.env.NODE_ENV = "test";
    delete process.env.SESSION_SECRET;
    expect(resolveSessionSecret().length).toBeGreaterThanOrEqual(32);
  });

  it("production: thiếu SESSION_SECRET thì từ chối khởi động", () => {
    process.env.NODE_ENV = "production";
    delete process.env.SESSION_SECRET;
    expect(() => resolveSessionSecret()).toThrow(/SESSION_SECRET/);
  });

  it("production: còn giá trị mẫu của .env.example thì từ chối", () => {
    process.env.NODE_ENV = "production";
    process.env.SESSION_SECRET = "change-me-to-a-random-32-char-secret-string";
    expect(() => resolveSessionSecret()).toThrow(/example/);
  });

  it("production: ngắn hơn 32 ký tự thì từ chối", () => {
    process.env.NODE_ENV = "production";
    process.env.SESSION_SECRET = "short-secret";
    expect(() => resolveSessionSecret()).toThrow(/32/);
  });

  it("production: chuỗi hợp lệ được dùng nguyên văn", () => {
    process.env.NODE_ENV = "production";
    process.env.SESSION_SECRET = "a".repeat(64);
    expect(resolveSessionSecret()).toBe("a".repeat(64));
  });
});
