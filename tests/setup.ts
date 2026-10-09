import http from "node:http";

// Flake root cause (macOS): VS Code / CoDev CLI / Chrome giữ nhiều port
// 127.0.0.1 trong dãy ephemeral (49152-65535) suốt thời gian máy chạy.
// supertest mở ~1 server listen(0) cho MỖI request (hàng nghìn server mỗi
// run); thỉnh thoảng kernel trao cho listen(0) một port mà app hệ thống
// khác cũng chiếm -> request của test đi lạc vào server ngoại lai -> nhận
// 401/404/JSON lạ -> fail ngẫu nhiên ("list.body.map is not a function",
// "expected 404 to be 200", "expected undefined to be -5", ...).
// Ép mọi server test listen trong dãy riêng tư 41000-48799 (ngoài dãy
// ephemeral của macOS) để không bao giờ trùng với app hệ thống.
const TEST_PORT_BASE = 41000;
const TEST_PORT_SPAN = 7800; // 41000..48799
// Mỗi process worker (mỗi file test) chọn điểm bắt đầu khác nhau để tránh
// đụng chéo khi process file trước chưa kịp giải phóng port.
let nextPort =
  TEST_PORT_BASE +
  (process.pid * 7 + (Date.now() % 500)) % TEST_PORT_SPAN;

const serverProto = http.Server.prototype as unknown as Record<string, any>;
if (!serverProto.__testPortPatched) {
  const origListen = serverProto.listen as (...args: unknown[]) => unknown;
  serverProto.listen = function (...args: unknown[]) {
    const first = args[0];
    if (first === 0 || first === undefined || first === null) {
      // Chỉ đụng tới listen(0) (port ngẫu nhiên do kernel cấp) — dạng của
      // supertest. listen(port/host/handle) cụ thể giữ nguyên hành vi.
      if (nextPort >= TEST_PORT_BASE + TEST_PORT_SPAN) {
        nextPort = TEST_PORT_BASE;
      }
      args[0] = nextPort++;
    }
    return origListen.apply(this, args);
  };
  serverProto.__testPortPatched = true;
}
