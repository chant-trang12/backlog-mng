import type { Request, Response, NextFunction } from "express";

// Dịch lỗi ràng buộc DB thô (SQLite/MSSQL) thành thông báo tiếng Việt gọn —
// áp dụng chung cho MỌI bảng thay vì phải bắt lỗi thủ công ở từng service.
function friendlyDbError(message: string): { message: string; status: number } | null {
  if (/UNIQUE constraint failed/i.test(message) || /violation of unique/i.test(message)) {
    return { message: "Giá trị này đã tồn tại — vui lòng dùng tên khác.", status: 409 };
  }
  if (/FOREIGN KEY constraint failed/i.test(message) || /conflicted with the (REFERENCE|FOREIGN KEY)/i.test(message)) {
    return {
      message: "Không thể thực hiện vì dữ liệu đang được dùng ở nơi khác.",
      status: 409,
    };
  }
  return null;
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error("[ERROR]", err);
  const e = err as any;
  const rawMessage = e instanceof Error ? e.message : "Internal server error";
  const friendly = friendlyDbError(rawMessage);
  const message = friendly?.message ?? rawMessage;
  const statusCode = friendly?.status ?? (res.statusCode && res.statusCode >= 400 ? res.statusCode : 500);

  const payload: Record<string, unknown> = { error: message };

  // Surface the underlying cause so the client can see WHY the request failed.
  if (process.env.NODE_ENV !== "test" && e?.cause) {
    const cause = e.cause;
    if (cause instanceof Response) {
      // openid-client attaches the failed Response as cause
      const ct = cause.headers.get("content-type") ?? "(none)";
      payload.cause = `HTTP ${cause.status} ${cause.statusText} (content-type=${ct})`;
      // Include a short body preview when it's an error (helps debug "unexpected content-type")
      if (!cause.ok) {
        cause.text().then((body) => {
          // We can't change statusCode here (response already sent), but log for debugging
          console.error(`[ERROR] Failed response body (${cause.status}, ct=${ct}):`, body.substring(0, 500));
        }).catch(() => {});
      }
    } else {
      payload.cause = cause instanceof Error ? cause.message : String(cause);
    }
  }

  res.status(statusCode).json(payload);
}
