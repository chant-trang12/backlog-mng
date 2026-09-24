# Mock SSO — môi trường test OIDC cục bộ

Dựng 1 mock OIDC Provider (đóng vai Keycloak/Entra ID/Okta thật) + Caddy làm
TLS reverse proxy trước nó, để test luồng SSO của app mà không cần IdP thật.

## Chạy

```bash
cd mock-sso
docker compose up -d
```

Kiểm tra discovery hoạt động:

```bash
curl -sk https://localhost:8443/.well-known/openid-configuration | head -c 200
```

Phải thấy `"issuer":"https://localhost:8443"` — nếu ra `http://` thay vì
`https://` thì `ASPNETCORE_FORWARDEDHEADERS_ENABLED` chưa nhận, hoặc Caddy
chưa terminate TLS đúng cách.

## Cấu hình `.env` của app khi test với mock IdP này

```bash
SSO_ENABLED=true
OIDC_ISSUER=https://localhost:8443
OIDC_CLIENT_ID=backlog-manager
OIDC_CLIENT_SECRET=mock-secret
NODE_TLS_REJECT_UNAUTHORIZED=0   # bỏ qua việc verify cert tự ký của Caddy
COOKIE_SECURE=false              # QUAN TRỌNG — xem "Lưu ý" bên dưới
```

## Tài khoản test (mật khẩu đều `123456`)

| Username   | Role (gán tay trong DB sau lần đăng nhập đầu) | Phòng ban |
|------------|------------------------------------------------|-----------|
| `hieunv`   | admin (tự động — người đăng nhập đầu tiên)      | —         |
| `viewer1`  | viewer (gán tay)                                | tuỳ chọn  |
| `editor1`  | editor (gán tay)                                | tuỳ chọn  |

Người đăng nhập **đầu tiên** trên 1 DB trống sẽ tự động thành `admin`
(bootstrap — xem tài liệu nghiệp vụ phân quyền, mục 4). Muốn đổi role/phòng
ban cho các tài khoản còn lại, sửa trực tiếp bảng `users` sau khi họ đăng
nhập lần đầu (record chỉ được tạo lúc đó).

## Lưu ý quan trọng

- **`COOKIE_SECURE` của app phải để `false`**, kể cả khi SSO bật. Chỉ
  **mock IdP** cần chạy sau Caddy (HTTPS) — vì cookie `idsrv`/`idsrv.session`
  của nó dùng `SameSite=None`, bắt buộc `Secure`. App tự nó vẫn chạy plain
  HTTP ở `localhost:3001`; nếu để `COOKIE_SECURE=true` thì Express sẽ không
  bao giờ set được session cookie của chính app qua kết nối không mã hoá,
  gây lỗi `Invalid SSO state or session expired` ngay ở `/auth/callback`.
- Session (state/PKCE code_verifier) lưu **trong bộ nhớ** (MemoryStore mặc
  định của `express-session`) — nếu server app restart/crash giữa lúc
  `/auth/login` và `/auth/callback`, state bị mất và sẽ gặp lỗi tương tự.
  Đây là hạn chế đã biết của môi trường dev, không phải bug.
- `/auth/callback` chỉ dùng được **đúng 1 lần** ngay sau khi IdP redirect về
  kèm `code`/`state` khớp. Không bao giờ trỏ 1 link tĩnh (menu, dashboard
  khác...) thẳng vào `/auth/callback` — luôn trỏ về `/` hoặc `/auth/login`.
- Trên Apple Silicon, `mock-idp` bắt buộc `platform: linux/amd64` (image chỉ
  build sẵn cho amd64) — đã cấu hình sẵn trong `docker-compose.yml`.

## Dọn dẹp

```bash
docker compose down
```
