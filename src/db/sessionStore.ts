import session from "express-session";
import type { SessionData } from "express-session";
import type { Knex } from "knex";

type Callback = (err?: unknown) => void;

const PRUNE_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Store express-session lưu vào bảng `sessions` qua Knex — chạy được trên cả
 * SQLite (dev) và SQL Server (production), không cần thêm thư viện.
 * Phiên hết hạn bị bỏ qua khi đọc và được dọn định kỳ (tối đa 1 lần / 10 phút,
 * kích hoạt khi ghi phiên — không dùng timer chạy nền).
 */
export class KnexSessionStore extends session.Store {
  private lastPrune = 0;

  constructor(
    private readonly db: Knex,
    private readonly ready: () => Promise<void>,
    private readonly fallbackTtlMs: number,
  ) {
    super();
  }

  private expiresAt(sess: SessionData): number {
    const expires = sess.cookie?.expires;
    const ms = expires ? new Date(expires).getTime() : NaN;
    return Number.isFinite(ms) ? ms : Date.now() + this.fallbackTtlMs;
  }

  private async pruneIfDue(): Promise<void> {
    const now = Date.now();
    if (now - this.lastPrune < PRUNE_INTERVAL_MS) return;
    this.lastPrune = now;
    await this.db("sessions").where("expires_at", "<=", now).delete();
  }

  override get(sid: string, callback: (err: unknown, session?: SessionData | null) => void): void {
    (async () => {
      await this.ready();
      const row = await this.db("sessions").where({ sid }).first("sess", "expires_at");
      if (!row) return null;
      if (Number(row.expires_at) <= Date.now()) {
        await this.db("sessions").where({ sid }).delete();
        return null;
      }
      return JSON.parse(row.sess) as SessionData;
    })().then(
      (sess) => callback(null, sess),
      (err) => callback(err),
    );
  }

  override set(sid: string, sess: SessionData, callback?: Callback): void {
    (async () => {
      await this.ready();
      const data = { sess: JSON.stringify(sess), expires_at: this.expiresAt(sess) };
      const updated = await this.db("sessions").where({ sid }).update(data);
      if (!updated) {
        try {
          await this.db("sessions").insert({ sid, ...data });
        } catch (err) {
          // 2 request cùng tạo 1 phiên mới (đua nhau) — dòng đã có, ghi đè.
          const again = await this.db("sessions").where({ sid }).update(data);
          if (!again) throw err;
        }
      }
      await this.pruneIfDue();
    })().then(
      () => callback?.(),
      (err) => callback?.(err),
    );
  }

  override touch(sid: string, sess: SessionData, callback?: Callback): void {
    (async () => {
      await this.ready();
      await this.db("sessions").where({ sid }).update({ expires_at: this.expiresAt(sess) });
    })().then(
      () => callback?.(),
      (err) => callback?.(err),
    );
  }

  override destroy(sid: string, callback?: Callback): void {
    (async () => {
      await this.ready();
      await this.db("sessions").where({ sid }).delete();
    })().then(
      () => callback?.(),
      (err) => callback?.(err),
    );
  }

  override clear(callback?: Callback): void {
    (async () => {
      await this.ready();
      await this.db("sessions").delete();
    })().then(
      () => callback?.(),
      (err) => callback?.(err),
    );
  }
}
