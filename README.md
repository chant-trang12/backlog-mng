# backlog-manager

Quản lý backlog công việc theo team, theo tháng — CRUD, cập nhật tiến độ, xuất Excel theo mẫu.

## Yêu cầu
- Node.js (cài qua nvm: `nvm use`)

## Lệnh
- `npm install` — cài dependencies
- `npm run dev` — chạy dev server (tsx watch), mặc định cổng 3001
- `npm run build` — build ra `dist/`
- `npm start` — chạy bản đã build
- `npm test` — chạy test (vitest)

## Cấu trúc
```
src/
  routes/
  controllers/
  middleware/
  services/       # period (tháng backlog), task (CRUD + cập nhật tiến độ), export Excel
  db/              # SQLite (better-sqlite3), file tại data/backlog.db
  types/
  app.ts
  index.ts
public/            # UI web đơn giản (vanilla JS)
tests/
data/              # DB (không commit, xem .gitignore)
```

## Luồng sử dụng

### 1. Tạo backlog theo tháng
```
POST /api/periods
Body: { "year": 2026, "month": 8, "label"? }
```
Mỗi (năm, tháng) chỉ có một period — tạo lại với cùng năm/tháng sẽ trả về period đã có.
```
GET  /api/periods
GET  /api/periods/:id
DELETE /api/periods/:id
```

### 2. Khai báo team & nhân sự (dùng chung cho mọi tháng)
```
POST   /api/teams                Body: { "name": "CRM" }
GET    /api/teams
DELETE /api/teams/:id

POST   /api/teams/:teamId/members   Body: { "name": "Nguyễn Văn A" }
GET    /api/teams/:teamId/members
DELETE /api/members/:id
```
Team và nhân sự không gắn theo tháng — khai báo một lần, dùng lại cho mọi
period. `POST /api/teams` idempotent theo tên.

### 3. Nhập task theo team trong tháng đó
```
POST /api/periods/:periodId/tasks
Body: {
  "team": "CRM",
  "nhiem_vu": "Xây dựng quy trình CI/CD",
  "tinh_chat"?, "dod"?, "ngay_thuc_hien"?, "deadline"?, "nvtt"?,
  "phan_tram_hoan_thanh"?, "trang_thai"?, "tien_do"?, "cpo_danh_gia"?, "cpo_comment"?
}
```
`stt` tự tăng theo thứ tự nhập trong từng tháng. `trang_thai` mặc định `"Chưa thực hiện"`.

```
GET /api/periods/:periodId/tasks           # ?team= để lọc theo team
GET /api/tasks/:id
```

### 4. Cập nhật tiến độ / nội dung task
```
PUT /api/tasks/:id
Body: bất kỳ trường nào ở trên (partial update) — dùng để cập nhật
      % hoàn thành, trạng thái, tiến độ, đánh giá CPO định kỳ.
```
```
DELETE /api/tasks/:id
```

### 5. Xuất Excel
```
GET /api/periods/:periodId/tasks/export     # ?team= để xuất riêng 1 team
```
Trả file `.xlsx` với các cột: STT, Tính chất, Team, Nhiệm vụ, DoD, Ngày thực
hiện, Deadline, NVTT, % Hoàn thành, Trạng thái, Tiến độ, CPO đánh giá, CPO
Comment — tô màu theo trạng thái, tương tự mẫu backlog theo team.

## UI
Mở `http://localhost:3001` sau khi chạy `npm run dev`: chọn/tạo tháng backlog,
lọc theo team, nhập/sửa/xóa task, và xuất Excel.
