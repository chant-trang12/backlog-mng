import type { Request, Response } from "express";
import { sendHtmlError, wantsHtmlPage } from "../utils/errorPage.js";

export function notFound(req: Request, res: Response) {
  if (wantsHtmlPage(req)) {
    sendHtmlError(res, 404, "Trang bạn tìm không tồn tại hoặc đã bị di chuyển.");
    return;
  }
  res.status(404).json({ error: "Not found" });
}
