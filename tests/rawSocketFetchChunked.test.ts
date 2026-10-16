import { describe, expect, it } from "vitest";
import { decodeChunkedBody } from "../src/utils/rawSocketFetch.js";

describe("decodeChunkedBody — Transfer-Encoding: chunked", () => {
  it("ghép các chunk thành body gốc", () => {
    const raw = Buffer.from('7\r\n{"a":1,\r\n6\r\n"b":2}\r\n0\r\n\r\n', "latin1");
    expect(decodeChunkedBody(raw).toString()).toBe('{"a":1,"b":2}');
  });

  it("chunk-size dạng hex chữ hoa/thường và có chunk-extension", () => {
    const body = "x".repeat(26);
    const raw = Buffer.from(`1A;ext=1\r\n${body}\r\n0\r\n\r\n`, "latin1");
    expect(decodeChunkedBody(raw).toString()).toBe(body);
  });

  it("body UTF-8 nhiều byte không bị cắt nhầm (kích thước tính theo byte)", () => {
    const text = JSON.stringify({ name: "Nguyễn Văn Hiếu" });
    const bytes = Buffer.from(text, "utf8");
    const raw = Buffer.concat([Buffer.from(`${bytes.length.toString(16)}\r\n`), bytes, Buffer.from("\r\n0\r\n\r\n")]);
    expect(JSON.parse(decodeChunkedBody(raw).toString("utf8")).name).toBe("Nguyễn Văn Hiếu");
  });
});
