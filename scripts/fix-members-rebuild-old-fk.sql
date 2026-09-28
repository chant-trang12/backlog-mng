-- Sua loi FK con so't: compliance_records/training_records/danh_gia_records
-- dang tro member_id vao bang "members__rebuild_old" (khong con ton tai, rac
-- sot lai tu 1 lan SQLite tu rebuild bang members o qua khu - khien xoa BAT
-- KY thang backlog nao (co du lieu Tuan thu/Dao tao/Danh gia) deu loi
-- "no such table: main.members__rebuild_old"). Ban sao lai dung tung bang
-- voi FK tro dung ve "members", giu nguyen toan bo du lieu.
--
-- Da chay 1 lan cho data/backlog.db cuc bo ngay 2026-09-28 (backup truoc khi
-- chay o /tmp/backlog_before_fk_repair_*.db.bak). Neu can chay lai o moi
-- truong khac (VD DB production cung ke thua tu ban backup cu bi loi nay):
--   1) Kiem tra truoc: sqlite3 <file.db> ".schema compliance_records" - neu
--      thay "members__rebuild_old" thi moi can chay script nay.
--   2) BACKUP file DB truoc khi chay (cp <file.db> <file.db>.bak).
--   3) sqlite3 <file.db> ".read scripts/fix-members-rebuild-old-fk.sql"
-- An toan chay lai nhieu lan (khong dieu kien hasTable vi day la sua 1 lan,
-- khong phai migration tu dong moi lan khoi dong app).
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;

ALTER TABLE compliance_records RENAME TO compliance_records__broken;
CREATE TABLE "compliance_records" (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `period_id` integer NOT NULL, `member_id` integer NOT NULL, `vi_pham` integer NOT NULL DEFAULT '0', `noi_dung` text, `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, `department_id` integer, FOREIGN KEY (`period_id`) REFERENCES `periods` (`id`) ON DELETE CASCADE, FOREIGN KEY (`member_id`) REFERENCES `members` (`id`) ON DELETE NO ACTION, FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE NO ACTION);
INSERT INTO compliance_records SELECT * FROM compliance_records__broken;
-- DROP TABLE truoc de giai phong ten index cu (con-gan voi bang __broken)
-- truoc khi tao index moi cung ten tren bang moi.
DROP TABLE compliance_records__broken;
DROP INDEX IF EXISTS `compliance_records_department_id_index`;
CREATE INDEX `compliance_records_department_id_index` on `compliance_records` (`department_id`);

ALTER TABLE training_records RENAME TO training_records__broken;
CREATE TABLE "training_records" (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `period_id` integer NOT NULL, `member_id` integer NOT NULL, `loai` varchar(255), `ngay_thuc_hien` varchar(50), `nguoi_xac_nhan` varchar(255), `noi_dung` text, `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, `department_id` integer, FOREIGN KEY (`period_id`) REFERENCES `periods` (`id`) ON DELETE CASCADE, FOREIGN KEY (`member_id`) REFERENCES `members` (`id`) ON DELETE NO ACTION, FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE NO ACTION);
INSERT INTO training_records SELECT * FROM training_records__broken;
DROP TABLE training_records__broken;
DROP INDEX IF EXISTS `training_records_department_id_index`;
CREATE INDEX `training_records_department_id_index` on `training_records` (`department_id`);

ALTER TABLE danh_gia_records RENAME TO danh_gia_records__broken;
CREATE TABLE "danh_gia_records" (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `period_id` integer NOT NULL, `member_id` integer NOT NULL, `so_thu_tu` integer, `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, `department_id` integer, FOREIGN KEY (`period_id`) REFERENCES `periods` (`id`) ON DELETE CASCADE, FOREIGN KEY (`member_id`) REFERENCES `members` (`id`) ON DELETE NO ACTION, FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE NO ACTION, UNIQUE (`period_id`, `member_id`));
INSERT INTO danh_gia_records SELECT * FROM danh_gia_records__broken;
DROP TABLE danh_gia_records__broken;
DROP INDEX IF EXISTS `danh_gia_records_department_id_index`;
CREATE INDEX `danh_gia_records_department_id_index` on `danh_gia_records` (`department_id`);

COMMIT;
PRAGMA foreign_key_check;
