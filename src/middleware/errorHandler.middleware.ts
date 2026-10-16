import type { Request, Response, NextFunction } from "express";
import { randomBytes } from "node:crypto";
import { ScopeForbiddenError } from "../services/scope.util.js";
import { sendHtmlError, wantsHtmlPage } from "../utils/errorPage.js";

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
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Mã tham chiếu để đối chiếu log server với lỗi người dùng báo (không lộ chi tiết).
  const errorId = randomBytes(4).toString("hex");
  console.error(`[ERROR] id=${errorId}`, err);
  const e = err as any;
  const rawMessage = e instanceof Error ? e.message : "Internal server error";
  const friendly = friendlyDbError(rawMessage);
  const statusCode =
    friendly?.status ??
    (err instanceof ScopeForbiddenError ? 403 : res.statusCode && res.statusCode >= 400 ? res.statusCode : 500);

  // ATTT (Improper Error Handling / Information Exposure, WSTG-ERRH): lỗi hệ
  // thống (5xx) KHÔNG trả nguyên message/cause của lỗi nội bộ (SQL, đường dẫn,
  // địa chỉ IdP, gợi ý debug...) ra màn hình người dùng ở production — chỉ
  // một thông báo chung + mã tham chiếu. Lỗi 4xx (validate/quyền) vẫn trả
  // message vì đó là câu chữ chủ đích cho người dùng.
  const hideDetails = statusCode >= 500 && process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test";
  const message = hideDetails
    ? `Đã xảy ra lỗi hệ thống. Vui lòng thử lại hoặc liên hệ quản trị viên (mã lỗi: ${errorId}).`
    : (friendly?.message ?? rawMessage);

  if (wantsHtmlPage(req)) {
    sendHtmlError(res, statusCode, message);
    return;
  }

  const payload: Record<string, unknown> = { error: message };
  if (hideDetails) payload.errorId = errorId;

  // Chỉ khi chạy development mới đính kèm nguyên nhân gốc để dễ debug.
  if (process.env.NODE_ENV === "development" && e?.cause) {
    const cause = e.cause;
    if (cause instanceof Response) {
      const ct = cause.headers.get("content-type") ?? "(none)";
      payload.cause = `HTTP ${cause.status} ${cause.statusText} (content-type=${ct})`;
    } else {
      payload.cause = cause instanceof Error ? cause.message : String(cause);
    }
  }

  res.status(statusCode).json(payload);
}
