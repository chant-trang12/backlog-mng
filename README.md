# backlog-manager

Quản lý backlog công việc theo team, theo tháng — nhập/theo dõi nhiệm vụ, chấm
điểm, dữ liệu CSKH, hồ sơ nhân sự, và bảng tổng hợp/ranking điểm theo tháng.
Backend Node.js/Express/TypeScript + SQLite, frontend vanilla JS/HTML/CSS
(không framework, không build step).

## Yêu cầu
- Node.js >= 22 (cài qua nvm: `nvm use` hoặc tải Node 22 LTS)

## Cấu hình Database (SQLite / SQL Server)

Dự án hỗ trợ linh hoạt 2 môi trường lưu trữ qua Knex:
- **Dev / Local**: Mặc định dùng **SQLite** (file lưu tại `data/backlog.db`), không cần cài đặt database server.
- **Production (Win Server / MSSQL)**: Kết nối trực tiếp đến **Microsoft SQL Server**.

Tạo file `.env` từ `.env.example`:
```bash
cp .env.example .env
```

### 1. Dùng SQLite (Mặc định cho Dev)
```env
DB_CLIENT=sqlite
SQLITE_FILENAME=./data/backlog.db
```

### 2. Dùng SQL Server (Cho Production / Win Server)
```env
DB_CLIENT=mssql
MSSQL_SERVER=127.0.0.1
MSSQL_PORT=1433
MSSQL_USER=sa
MSSQL_PASSWORD=YourStrongPassword!
MSSQL_DATABASE=backlog_mng
MSSQL_ENCRYPT=false
MSSQL_TRUST_SERVER_CERTIFICATE=true
```
*Ghi chú cho DBA*: Có thể dùng script SQL tạo bảng thủ công tại `scripts/schema-sqlserver.sql`, hoặc để app tự động khởi tạo bảng (auto-migration) khi khởi động.

## Lệnh
- `npm install` — cài dependencies
- `npm run dev` — chạy dev server (tsx watch), mặc định cổng 3001
- `npm run build` — build ra `dist/`
- `npm start` — chạy bản đã build
- `npm test` — chạy test (vitest, dùng test DB riêng biệt)

Sau khi chạy `npm run dev`, mở `http://localhost:3001`.

## Cấu trúc
```
src/
  routes/         # 1 file route theo từng nhóm chức năng
  controllers/     # xử lý request/response
  services/        # nghiệp vụ + truy vấn Knex đa CSDL
  middleware/
  db/              # cấu hình Knex và auto-migration (SQLite / SQL Server)
  types/
  app.ts           # gắn toàn bộ route vào Express app
  index.ts         # entrypoint, start server
public/            # UI (vanilla JS/HTML/CSS, không build step)
tests/             # vitest + supertest, gọi thẳng qua createApp()
data/              # DB SQLite local (không commit, xem .gitignore)
scripts/           # Script DDL SQL Server (scripts/schema-sqlserver.sql)
```

## Các trang trong ứng dụng

**🏠 Home** — dashboard theo tháng: tổng hợp điểm theo team (Sprint Goal, Sự
cố, tỷ lệ xử lý ticket, tỷ lệ khởi tạo, các khoản trừ/cộng), tỉ lệ hoàn thành
nhiệm vụ, và Ranking (leaderboard team + tra cứu KI từng thành viên theo bảng
Ranking team ở Cấu hình).

**📋 Backlog** — quản lý tháng backlog (period) và nhiệm vụ (task) theo team:
CRUD, cập nhật tiến độ/trạng thái, chấm điểm CPO, chuyển task sang tháng sau
(tự đánh dấu "Nhiệm vụ tồn" nếu Deadline sớm hơn tháng đích; mỗi task chỉ
chuyển được 1 lần), xuất Excel, và banner cảnh báo (task chưa chấm điểm / đã
quá deadline / sắp đến hạn trong 5 ngày).

**👥 Team & Nhân sự** — team và nhân sự gắn theo từng tháng (thêm/xóa ở tháng
nào chỉ ảnh hưởng tháng đó; tháng mới kế thừa danh sách từ tháng gần nhất);
các tab Tuân thủ, Nội quy (kèm "Không tính công"), Đào tạo, Hỗ trợ, Đánh giá,
Chấm công (import Excel).

**🎧 CSKH** — số liệu theo team/tháng: Sự cố, Ticket (tổng/vượt hạn/đúng hạn),
Tỉ lệ khởi tạo dịch vụ thành công.

**⚙️ Cấu hình** — Tiêu chí tính điểm (nhóm/cách tính/điểm chuẩn/chỉ tiêu theo
team, dùng chung mọi tháng) và Ranking team (bảng vị trí xếp hạng × kịch bản
xếp hạng, dùng để tra KI thành viên ở Home).

## API

Toàn bộ endpoint nằm dưới `/api`, phần lớn lọc theo `period_id` (tháng
backlog). Xem chi tiết ở từng file `src/routes/*.routes.ts` — tên file khớp
với nhóm chức năng tương ứng (`period`, `task`, `team`, `member`, `cskh`,
`compliance`, `training`, `attendance`, `noiquy`, `support`, `danhgia`,
`tieuchi`, `ranking`). `GET /health` để kiểm tra server sống.

## Test

`npm test` chạy vitest + supertest, gọi thẳng qua `createApp()` — **dùng
chung file SQLite với dev server** (`data/backlog.db`), không có DB test
riêng biệt. Chạy test nhiều lần liên tiếp có thể để lại dữ liệu thừa (period,
tieu_chi_configs, ranking_columns...); các bảng cấu hình toàn cục
(`tieu_chi_configs`, `ranking_rows/columns/cells`) không gắn `period_id` nên
cần các test tự dọn dẹp dữ liệu đã tạo (xem `tests/tieuchi.test.ts`,
`tests/ranking.test.ts` làm mẫu).
