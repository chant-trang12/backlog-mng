import type { NextFunction, Request, Response } from "express";
import { sanitizeDeepInPlace } from "../utils/sanitize.util.js";
import { isPlainContainer } from "../utils/sanitize.util.js";

// ATTT (Stored XSS): làm sạch TOÀN BỘ request ghi trên /api — mỗi chức năng
// thêm mới/sửa/chấm điểm đều đi qua đây, không cần vá từng handler. Mount
// SAU authRoutes (đăng nhập: username/password không bị đụng vào) và TRƯỚC
// requireAuth. GET không đụng vào (tham số tìm kiếm không được lưu xuống DB).
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function sanitizeWriteInput(req: Request, res: Response, next: NextFunction) {
  if (WRITE_METHODS.has(req.method)) {
    if (isPlainContainer(req.body)) sanitizeDeepInPlace(req.body);
    if (isPlainContainer(req.query)) sanitizeDeepInPlace(req.query);
  }
  next();
}
