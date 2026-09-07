-- ==========================================================
-- SCRIPT TẠO DATABASE VÀ SCHEMA CHO MICROSOFT SQL SERVER
-- Tương thích: SQL Server 2016, 2017, 2019, 2022, Azure SQL
-- ==========================================================

-- Tạo Database nếu chưa có
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'backlog_mng')
BEGIN
    CREATE DATABASE backlog_mng;
END
GO

USE backlog_mng;
GO

-- 1. Bảng periods (Tháng backlog)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'periods')
BEGIN
    CREATE TABLE periods (
        id INT IDENTITY(1,1) PRIMARY KEY,
        [year] INT NOT NULL,
        [month] INT NOT NULL,
        label NVARCHAR(255) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UQ_periods_year_month UNIQUE ([year], [month])
    );
END
GO

-- 2. Bảng teams (Danh sách team gắn theo tháng)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'teams')
BEGIN
    CREATE TABLE teams (
        id INT IDENTITY(1,1) PRIMARY KEY,
        period_id INT NOT NULL CONSTRAINT FK_teams_periods REFERENCES periods(id) ON DELETE CASCADE,
        name NVARCHAR(255) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UQ_teams_period_name UNIQUE (period_id, name)
    );
END
GO

-- 3. Bảng members (Nhân sự gắn theo team và tháng)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'members')
BEGIN
    CREATE TABLE members (
        id INT IDENTITY(1,1) PRIMARY KEY,
        period_id INT NOT NULL CONSTRAINT FK_members_periods REFERENCES periods(id) ON DELETE CASCADE,
        team_id INT NOT NULL CONSTRAINT FK_members_teams REFERENCES teams(id),
        name NVARCHAR(255) NOT NULL,
        chuc_vu NVARCHAR(255),
        tuan_thu NVARCHAR(255),
        noi_quy NVARCHAR(255),
        dao_tao NVARCHAR(255),
        ho_tro NVARCHAR(255),
        danh_gia NVARCHAR(255),
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UQ_members_period_team_name UNIQUE (period_id, team_id, name)
    );
END
GO

-- 4. Bảng tasks (Nhiệm vụ backlog)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'tasks')
BEGIN
    CREATE TABLE tasks (
        id INT IDENTITY(1,1) PRIMARY KEY,
        period_id INT NOT NULL CONSTRAINT FK_tasks_periods REFERENCES periods(id) ON DELETE CASCADE,
        stt INT NOT NULL,
        tinh_chat NVARCHAR(MAX),
        khong_tinh_diem NVARCHAR(MAX),
        tag NVARCHAR(MAX),
        team NVARCHAR(255) NOT NULL,
        nhiem_vu NVARCHAR(MAX) NOT NULL,
        dod NVARCHAR(MAX),
        ngay_thuc_hien NVARCHAR(50),
        deadline NVARCHAR(50),
        nvtt NVARCHAR(255),
        phan_tram_hoan_thanh INT NOT NULL DEFAULT 0,
        trang_thai NVARCHAR(50) NOT NULL DEFAULT N'Chưa thực hiện',
        tien_do NVARCHAR(MAX),
        cpo_danh_gia INT,
        cpo_comment NVARCHAR(MAX),
        da_chuyen_thang INT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );
    CREATE INDEX idx_tasks_period ON tasks(period_id);
    CREATE INDEX idx_tasks_team ON tasks(team);
END
GO

-- 5. Bảng incidents (Sự cố CSKH)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'incidents')
BEGIN
    CREATE TABLE incidents (
        id INT IDENTITY(1,1) PRIMARY KEY,
        period_id INT NOT NULL CONSTRAINT FK_incidents_periods REFERENCES periods(id) ON DELETE CASCADE,
        team_id INT NOT NULL CONSTRAINT FK_incidents_teams REFERENCES teams(id),
        su_co NVARCHAR(MAX) NOT NULL,
        tinh_chat NVARCHAR(255),
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );
END
GO

-- 6. Bảng tickets (Số liệu ticket CSKH)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'tickets')
BEGIN
    CREATE TABLE tickets (
        id INT IDENTITY(1,1) PRIMARY KEY,
        period_id INT NOT NULL CONSTRAINT FK_tickets_periods REFERENCES periods(id) ON DELETE CASCADE,
        team_id INT NOT NULL CONSTRAINT FK_tickets_teams REFERENCES teams(id),
        tong_ticket INT NOT NULL DEFAULT 0,
        ticket_vuot INT NOT NULL DEFAULT 0,
        dung_han INT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );
END
GO

-- 7. Bảng creation_rates (Tỷ lệ khởi tạo dịch vụ)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'creation_rates')
BEGIN
    CREATE TABLE creation_rates (
        id INT IDENTITY(1,1) PRIMARY KEY,
        period_id INT NOT NULL CONSTRAINT FK_creation_rates_periods REFERENCES periods(id) ON DELETE CASCADE,
        team_id INT NOT NULL CONSTRAINT FK_creation_rates_teams REFERENCES teams(id),
        so_luong_thanh_cong INT NOT NULL DEFAULT 0,
        so_luong_that_bai INT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );
END
GO

-- 8. Bảng compliance_records (Vi phạm quy trình / tuân thủ)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'compliance_records')
BEGIN
    CREATE TABLE compliance_records (
        id INT IDENTITY(1,1) PRIMARY KEY,
        period_id INT NOT NULL CONSTRAINT FK_compliance_periods REFERENCES periods(id) ON DELETE CASCADE,
        member_id INT NOT NULL CONSTRAINT FK_compliance_members REFERENCES members(id),
        vi_pham INT NOT NULL DEFAULT 0,
        noi_dung NVARCHAR(MAX),
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );
END
GO

-- 9. Bảng training_records (Đào tạo / Chứng chỉ)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'training_records')
BEGIN
    CREATE TABLE training_records (
        id INT IDENTITY(1,1) PRIMARY KEY,
        period_id INT NOT NULL CONSTRAINT FK_training_periods REFERENCES periods(id) ON DELETE CASCADE,
        member_id INT NOT NULL CONSTRAINT FK_training_members REFERENCES members(id),
        loai NVARCHAR(255),
        ngay_thuc_hien NVARCHAR(50),
        nguoi_xac_nhan NVARCHAR(255),
        noi_dung NVARCHAR(MAX),
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );
END
GO

-- 10. Bảng attendance_records (Dữ liệu chấm công theo tháng)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'attendance_records')
BEGIN
    CREATE TABLE attendance_records (
        id INT IDENTITY(1,1) PRIMARY KEY,
        period_id INT NOT NULL CONSTRAINT FK_attendance_periods REFERENCES periods(id) ON DELETE CASCADE,
        row_index INT NOT NULL,
        row_data NVARCHAR(MAX) NOT NULL,
        excluded_from_late INT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );
END
GO

-- 11. Bảng noiquy_overrides (Ghi đè miễn tính đi muộn)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'noiquy_overrides')
BEGIN
    CREATE TABLE noiquy_overrides (
        id INT IDENTITY(1,1) PRIMARY KEY,
        period_id INT NOT NULL CONSTRAINT FK_noiquy_periods REFERENCES periods(id) ON DELETE CASCADE,
        member_name NVARCHAR(255) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UQ_noiquy_period_name UNIQUE (period_id, member_name)
    );
END
GO

-- 12. Bảng support_records (Hỗ trợ chéo giữa các team)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'support_records')
BEGIN
    CREATE TABLE support_records (
        id INT IDENTITY(1,1) PRIMARY KEY,
        period_id INT NOT NULL CONSTRAINT FK_support_periods REFERENCES periods(id) ON DELETE CASCADE,
        member_id INT NOT NULL CONSTRAINT FK_support_members REFERENCES members(id),
        team_nhan_ho_tro_id INT NOT NULL CONSTRAINT FK_support_teams REFERENCES teams(id),
        noi_dung NVARCHAR(MAX),
        ngay_ho_tro NVARCHAR(50),
        nguoi_xac_nhan NVARCHAR(255),
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );
END
GO

-- 13. Bảng danh_gia_records (Đánh giá / Xếp thứ tự trong team)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'danh_gia_records')
BEGIN
    CREATE TABLE danh_gia_records (
        id INT IDENTITY(1,1) PRIMARY KEY,
        period_id INT NOT NULL CONSTRAINT FK_danhgia_periods REFERENCES periods(id) ON DELETE CASCADE,
        member_id INT NOT NULL CONSTRAINT FK_danhgia_members REFERENCES members(id),
        so_thu_tu INT,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UQ_danhgia_period_member UNIQUE (period_id, member_id)
    );
END
GO

-- 14. Bảng tieu_chi_configs (Cấu hình tiêu chí tính điểm - dùng chung mọi tháng)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'tieu_chi_configs')
BEGIN
    CREATE TABLE tieu_chi_configs (
        id INT IDENTITY(1,1) PRIMARY KEY,
        nhom NVARCHAR(255) NOT NULL,
        ten_tieu_chi NVARCHAR(255) NOT NULL,
        cach_tinh_diem NVARCHAR(MAX),
        co_chi_tieu INT NOT NULL DEFAULT 0,
        thu_tu INT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );
END
GO

-- 15. Bảng tieu_chi_diem_chuan (Điểm chuẩn / chỉ tiêu theo từng team)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'tieu_chi_diem_chuan')
BEGIN
    CREATE TABLE tieu_chi_diem_chuan (
        id INT IDENTITY(1,1) PRIMARY KEY,
        tieu_chi_id INT NOT NULL CONSTRAINT FK_diemchuan_tieuchi REFERENCES tieu_chi_configs(id) ON DELETE CASCADE,
        team_name NVARCHAR(255) NOT NULL,
        diem_chuan NVARCHAR(255),
        chi_tieu NVARCHAR(255),
        CONSTRAINT UQ_diemchuan_tieuchi_team UNIQUE (tieu_chi_id, team_name)
    );
END
GO

-- 16. Bảng ranking_rows (Hàng vị trí bảng ranking)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ranking_rows')
BEGIN
    CREATE TABLE ranking_rows (
        vi_tri INT PRIMARY KEY,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );
END
GO

-- 17. Bảng ranking_columns (Cột bảng ranking)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ranking_columns')
BEGIN
    CREATE TABLE ranking_columns (
        id INT IDENTITY(1,1) PRIMARY KEY,
        ten_cot NVARCHAR(255) NOT NULL CONSTRAINT UQ_ranking_columns_name UNIQUE,
        thu_tu INT NOT NULL DEFAULT 0
    );
END
GO

-- 18. Bảng ranking_cells (Giá trị ô bảng ranking)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ranking_cells')
BEGIN
    CREATE TABLE ranking_cells (
        id INT IDENTITY(1,1) PRIMARY KEY,
        vi_tri INT NOT NULL CONSTRAINT FK_cells_rows REFERENCES ranking_rows(vi_tri) ON DELETE CASCADE,
        column_id INT NOT NULL CONSTRAINT FK_cells_columns REFERENCES ranking_columns(id) ON DELETE CASCADE,
        gia_tri NVARCHAR(255),
        CONSTRAINT UQ_cells_row_column UNIQUE (vi_tri, column_id)
    );
END
GO

-- 19. Bảng tags (Danh mục Tag dùng chung)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'tags')
BEGIN
    CREATE TABLE tags (
        id INT IDENTITY(1,1) PRIMARY KEY,
        ten_tag NVARCHAR(255) NOT NULL CONSTRAINT UQ_tags_ten UNIQUE,
        thu_tu INT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );
END
GO

-- 20. Bảng phan_loai_options (Danh mục Phân loại dùng chung)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'phan_loai_options')
BEGIN
    CREATE TABLE phan_loai_options (
        id INT IDENTITY(1,1) PRIMARY KEY,
        ten_phan_loai NVARCHAR(255) NOT NULL CONSTRAINT UQ_phan_loai_ten UNIQUE,
        thu_tu INT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );
END
GO

-- 21. Bảng nhom_options (Danh mục Nhóm dùng chung)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'nhom_options')
BEGIN
    CREATE TABLE nhom_options (
        id INT IDENTITY(1,1) PRIMARY KEY,
        ten_nhom NVARCHAR(255) NOT NULL CONSTRAINT UQ_nhom_ten UNIQUE,
        thu_tu INT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );
END
GO

-- 22. Bảng chuc_vu_options (Danh mục Chức vụ dùng chung)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'chuc_vu_options')
BEGIN
    CREATE TABLE chuc_vu_options (
        id INT IDENTITY(1,1) PRIMARY KEY,
        ten_chuc_vu NVARCHAR(255) NOT NULL CONSTRAINT UQ_chuc_vu_ten UNIQUE,
        thu_tu INT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );
END
GO

