import type { Request, Response } from "express";

// Trình duyệt điều hướng thẳng tới 1 URL (không phải gọi API/fetch) và chấp
// nhận HTML -> hiện trang lỗi thân thiện thay vì JSON thô như {"error":"..."}.
export function wantsHtmlPage(req: Request): boolean {
  const accept = req.headers.accept ?? "";
  return accept.includes("text/html") && !req.originalUrl.startsWith("/api");
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export function sendHtmlError(res: Response, status: number, message: string): void {
  const title = status === 404 ? "Không tìm thấy trang" : status === 403 ? "Không có quyền truy cập" : "Có lỗi xảy ra";
  res
    .status(status)
    .type("html")
    .send(
      `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<title>${escapeHtml(title)}</title><style>body{font-family:system-ui,sans-serif;background:#f4f5f7;color:#222;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}` +
        `.box{background:#fff;padding:32px 40px;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,.08);max-width:460px}h1{font-size:20px;margin:0 0 12px}p{margin:0 0 20px;line-height:1.5}` +
        `a{display:inline-block;padding:8px 16px;background:#e60028;color:#fff;border-radius:6px;text-decoration:none}</style></head>` +
        `<body><div class="box"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a href="/">Về trang chủ</a></div></body></html>`,
    );
}
