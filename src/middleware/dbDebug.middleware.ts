import type { Request, Response, NextFunction } from "express";
import { db } from "../db/database.js";
import { isMssql } from "../db/connection.js";

// CHẨN ĐOÁN (bật bằng DB_DEBUG=1, mặc định TẮT): với mỗi request tới /api trên SQL
// Server, in ra máy chủ/phiên (SPID)/CSDL thực tế mà truy vấn đang chạy và ghi nhận
// thời điểm — để phát hiện "ghi xong đọc lại chưa thấy" do ứng dụng nối tới NHIỀU máy
// SQL Server/bản sao khác nhau (AlwaysOn secondary đọc được, DNS nhiều IP, replica...).
// trancount>0 = kết nối đang kẹt trong 1 transaction CHƯA COMMIT (ghi chưa hiển thị cho kết nối khác);
// rcsi=1 = đọc không bị chặn mà trả bản đã commit trước đó; iso: 1=READ UNCOMMITTED, 2=READ COMMITTED,
// 3=REPEATABLE READ, 4=SERIALIZABLE, 5=SNAPSHOT. Không in dữ liệu nghiệp vụ, không in chuỗi kết nối.
export function dbDebug(req: Request, res: Response, next: NextFunction): void {
  if (process.env.DB_DEBUG !== "1" || !isMssql) return next();
  const t0 = Date.now();
  db.raw(
    "SELECT @@SERVERNAME AS server, @@SPID AS spid, DB_NAME() AS dbname, SYSDATETIME() AS now_db, " +
      "@@TRANCOUNT AS trancount, " +
      "(SELECT is_read_committed_snapshot_on FROM sys.databases WHERE name = DB_NAME()) AS rcsi, " +
      "(SELECT transaction_isolation_level FROM sys.dm_exec_sessions WHERE session_id = @@SPID) AS iso",
  )
    .then((rows: any) => {
      const r = (rows as any[])[0] ?? {};
      console.log(
        `[DB-DEBUG] ${req.method} ${req.originalUrl.split("?")[0]} server=${r.server} spid=${r.spid} db=${r.dbname} ` +
          `trancount=${r.trancount} rcsi=${r.rcsi} iso=${r.iso} ` +
          `db_now=${r.now_db instanceof Date ? r.now_db.toISOString() : r.now_db} +${Date.now() - t0}ms`,
      );
    })
    .catch((err: unknown) => console.warn("[DB-DEBUG] lỗi truy vấn chẩn đoán:", (err as Error)?.message))
    .finally(next);
}
