import { describe, expect, it } from "vitest";
import {
  assertDepartmentInScope,
  computeScope,
  isDepartmentInScope,
  resolveListDepartmentId,
  ScopeForbiddenError,
  SCOPE_EMPTY,
  type DataScope,
} from "../src/services/scope.util.js";
import { createDepartment, updateDepartment } from "../src/services/department.service.js";
import { createPeriod } from "../src/services/period.service.js";
import { createTeam } from "../src/services/team.service.js";
import { createTask, listTasks, updateTask, deleteTask, deleteTasks } from "../src/services/task.service.js";
import { createMember, listMembers, updateMember } from "../src/services/member.service.js";
import { createComplianceRecord } from "../src/services/compliance.service.js";
import type { AppUser } from "../src/types/user.js";

// Scope "không giới hạn" — dùng để dựng fixture (tạo team/task/member ở
// nhiều phòng ban khác nhau) mà không bị chính cơ chế đang test chặn lại.
const UNRESTRICTED: DataScope = { all: true, departmentId: null };

let counter = 0;
function uniqueName(prefix: string): string {
  counter += 1;
  return `${prefix} ${Date.now()}-${counter}`;
}

function fakeUser(overrides: Partial<AppUser>): AppUser {
  return {
    id: -999,
    sso_sub: "scope-test",
    username: "scope-test",
    name: "Scope Test",
    email: null,
    role: "editor",
    active: true,
    department_id: null,
    last_login_at: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

async function makeFixtures() {
  const deptA = await createDepartment({ name: uniqueName("Scope Dept A") });
  const deptB = await createDepartment({ name: uniqueName("Scope Dept B") });
  const period = await createPeriod({ year: 2077, month: (counter % 12) + 1 });
  const teamA = await createTeam(uniqueName("Scope Team A"), period.id, deptA.id, UNRESTRICTED);
  const teamB = await createTeam(uniqueName("Scope Team B"), period.id, deptB.id, UNRESTRICTED);
  return { deptA, deptB, period, teamA, teamB };
}

describe("Quy tắc 9.2 — scope theo phòng ban", () => {
  describe("resolveListDepartmentId (GET danh sách)", () => {
    it("scope.all=true tôn trọng lựa chọn của client (kể cả null = không lọc)", () => {
      const scope: DataScope = { all: true, departmentId: null };
      expect(resolveListDepartmentId(scope, 5)).toBe(5);
      expect(resolveListDepartmentId(scope, null)).toBeNull();
    });

    it("scope giới hạn 1 phòng: ép về đúng phòng đó dù client không lọc gì", () => {
      const scope: DataScope = { all: false, departmentId: 3 };
      expect(resolveListDepartmentId(scope, null)).toBe(3);
      expect(resolveListDepartmentId(scope, 3)).toBe(3);
    });

    it("scope giới hạn 1 phòng: client xin đúng phòng KHÁC -> rỗng, không lộ dữ liệu", () => {
      const scope: DataScope = { all: false, departmentId: 3 };
      expect(resolveListDepartmentId(scope, 7)).toBe(SCOPE_EMPTY);
    });

    it("scope NONE (chưa gán phòng ban) -> luôn rỗng bất kể client yêu cầu gì", () => {
      const scope: DataScope = { all: false, departmentId: null };
      expect(resolveListDepartmentId(scope, null)).toBe(SCOPE_EMPTY);
      expect(resolveListDepartmentId(scope, 1)).toBe(SCOPE_EMPTY);
    });
  });

  describe("isDepartmentInScope / assertDepartmentInScope (ghi)", () => {
    it("scope.all=true cho ghi mọi phòng ban, kể cả bản ghi chưa gán (null)", () => {
      const scope: DataScope = { all: true, departmentId: null };
      expect(isDepartmentInScope(scope, 1)).toBe(true);
      expect(isDepartmentInScope(scope, null)).toBe(true);
    });

    it("scope giới hạn 1 phòng: chỉ đúng phòng đó mới true", () => {
      const scope: DataScope = { all: false, departmentId: 3 };
      expect(isDepartmentInScope(scope, 3)).toBe(true);
      expect(isDepartmentInScope(scope, 5)).toBe(false);
    });

    it("scope giới hạn 1 phòng: bản ghi mồ côi (department_id=null) KHÔNG được coi là trong phạm vi", () => {
      const scope: DataScope = { all: false, departmentId: 3 };
      expect(isDepartmentInScope(scope, null)).toBe(false);
    });

    it("scope NONE: mọi department_id đều false", () => {
      const scope: DataScope = { all: false, departmentId: null };
      expect(isDepartmentInScope(scope, 1)).toBe(false);
      expect(isDepartmentInScope(scope, null)).toBe(false);
    });

    it("assertDepartmentInScope ném ScopeForbiddenError khi ngoài phạm vi, im lặng khi hợp lệ", () => {
      const scope: DataScope = { all: false, departmentId: 3 };
      expect(() => assertDepartmentInScope(scope, 5)).toThrow(ScopeForbiddenError);
      expect(() => assertDepartmentInScope(scope, 3)).not.toThrow();
    });
  });

  describe("computeScope", () => {
    it("không có appUser (SSO tắt) -> không giới hạn", async () => {
      const scope = await computeScope(undefined);
      expect(scope).toEqual({ all: true, departmentId: null });
    });

    it("role admin -> không giới hạn, bất kể department_id", async () => {
      const scope = await computeScope(fakeUser({ role: "admin", department_id: null }));
      expect(scope.all).toBe(true);
    });

    it("role bị giới hạn (editor/viewer), chưa gán phòng ban -> scope NONE", async () => {
      const scope = await computeScope(fakeUser({ role: "editor", department_id: null }));
      expect(scope).toEqual({ all: false, departmentId: null });
    });

    it("role bị giới hạn, phòng ban thường (is_full_access=false) -> chỉ đúng phòng đó", async () => {
      const { deptA } = await makeFixtures();
      const scope = await computeScope(fakeUser({ role: "editor", department_id: deptA.id }));
      expect(scope).toEqual({ all: false, departmentId: deptA.id });
    });

    it("role bị giới hạn, phòng ban is_full_access=true -> không giới hạn", async () => {
      const { deptA } = await makeFixtures();
      await updateDepartment(deptA.id, { is_full_access: true });
      const scope = await computeScope(fakeUser({ role: "viewer", department_id: deptA.id }));
      expect(scope.all).toBe(true);
      expect(scope.departmentId).toBe(deptA.id);
    });
  });

  describe("Áp dụng thực tế lên tasks (department_id có sẵn)", () => {
    it("editor bị giới hạn phòng A tạo task cho phòng A -> thành công", async () => {
      const { deptA, period, teamA } = await makeFixtures();
      const scope: DataScope = { all: false, departmentId: deptA.id };
      const task = await createTask(period.id, { team: teamA.name, nhiem_vu: "Việc A", department_id: deptA.id }, scope);
      expect(task.department_id).toBe(deptA.id);
    });

    it("editor bị giới hạn phòng A tạo task cho phòng B -> ScopeForbiddenError", async () => {
      const { deptA, deptB, period, teamB } = await makeFixtures();
      const scope: DataScope = { all: false, departmentId: deptA.id };
      await expect(
        createTask(period.id, { team: teamB.name, nhiem_vu: "Việc B", department_id: deptB.id }, scope),
      ).rejects.toThrow(ScopeForbiddenError);
    });

    it("editor bị giới hạn phòng A không sửa được task thuộc phòng B", async () => {
      const { deptA, deptB, period, teamB } = await makeFixtures();
      const taskB = await createTask(
        period.id,
        { team: teamB.name, nhiem_vu: "Việc B", department_id: deptB.id },
        UNRESTRICTED,
      );
      const scope: DataScope = { all: false, departmentId: deptA.id };
      await expect(updateTask(taskB.id, { tien_do: "đang làm" }, scope)).rejects.toThrow(ScopeForbiddenError);
    });

    it("editor bị giới hạn phòng A không xóa được task thuộc phòng B", async () => {
      const { deptA, deptB, period, teamB } = await makeFixtures();
      const taskB = await createTask(
        period.id,
        { team: teamB.name, nhiem_vu: "Việc B", department_id: deptB.id },
        UNRESTRICTED,
      );
      const scope: DataScope = { all: false, departmentId: deptA.id };
      await expect(deleteTask(taskB.id, scope)).rejects.toThrow(ScopeForbiddenError);
    });

    it("xóa hàng loạt (deleteTasks) chỉ xóa những task trong phạm vi, bỏ qua id ngoài phạm vi thay vì lỗi", async () => {
      const { deptA, deptB, period, teamA, teamB } = await makeFixtures();
      const taskA = await createTask(
        period.id,
        { team: teamA.name, nhiem_vu: "Việc A", department_id: deptA.id },
        UNRESTRICTED,
      );
      const taskB = await createTask(
        period.id,
        { team: teamB.name, nhiem_vu: "Việc B", department_id: deptB.id },
        UNRESTRICTED,
      );
      const scope: DataScope = { all: false, departmentId: deptA.id };
      const deleted = await deleteTasks([taskA.id, taskB.id], scope);
      expect(deleted).toBe(1); // chỉ taskA bị xóa

      const remainingB = await listTasks({ period_id: period.id, department_id: deptB.id });
      expect(remainingB.some((t) => t.id === taskB.id)).toBe(true); // taskB vẫn còn nguyên
    });

    it("listTasks lọc đúng theo department_id được truyền vào (mô phỏng resolveListDepartmentId đã ép về đúng phòng)", async () => {
      const { deptA, deptB, period, teamA, teamB } = await makeFixtures();
      await createTask(period.id, { team: teamA.name, nhiem_vu: "Việc A", department_id: deptA.id }, UNRESTRICTED);
      await createTask(period.id, { team: teamB.name, nhiem_vu: "Việc B", department_id: deptB.id }, UNRESTRICTED);

      const onlyA = await listTasks({ period_id: period.id, department_id: deptA.id });
      expect(onlyA.every((t) => t.department_id === deptA.id)).toBe(true);
      expect(onlyA.some((t) => t.nhiem_vu === "Việc A")).toBe(true);
      expect(onlyA.some((t) => t.nhiem_vu === "Việc B")).toBe(false);
    });
  });

  describe("Áp dụng lên members (department_id suy từ team, đóng băng lúc tạo)", () => {
    it("editor bị giới hạn phòng A tạo nhân sự ở team thuộc phòng B -> ScopeForbiddenError", async () => {
      const { deptA, period, teamB } = await makeFixtures();
      const scope: DataScope = { all: false, departmentId: deptA.id };
      await expect(
        createMember({ period_id: period.id, team_id: teamB.id, name: "Nguyễn Văn X" }, scope),
      ).rejects.toThrow(ScopeForbiddenError);
    });

    it("nhân sự tạo ở team phòng A được gán department_id đúng bằng phòng A", async () => {
      const { deptA, period, teamA } = await makeFixtures();
      const member = await createMember(
        { period_id: period.id, team_id: teamA.id, name: "Nguyễn Văn A" },
        UNRESTRICTED,
      );
      expect((member as any).department_id).toBe(deptA.id);
    });

    it("chuyển team sang phòng khác KHÔNG hồi tố department_id đã lưu (đóng băng lúc tạo)", async () => {
      const { deptA, period, teamA, teamB } = await makeFixtures();
      const member = await createMember(
        { period_id: period.id, team_id: teamA.id, name: "Nguyễn Văn B" },
        UNRESTRICTED,
      );
      expect((member as any).department_id).toBe(deptA.id);

      const updated = await updateMember(member.id, { team_id: teamB.id }, UNRESTRICTED);
      expect(updated?.team_id).toBe(teamB.id); // team đã đổi
      expect((updated as any).department_id).toBe(deptA.id); // nhưng department_id vẫn giữ nguyên phòng cũ
    });

    it("listMembers lọc đúng theo department_id (join qua team)", async () => {
      const { deptA, deptB, period, teamA, teamB } = await makeFixtures();
      await createMember({ period_id: period.id, team_id: teamA.id, name: "A1" }, UNRESTRICTED);
      await createMember({ period_id: period.id, team_id: teamB.id, name: "B1" }, UNRESTRICTED);

      const onlyA = await listMembers(period.id, deptA.id);
      expect(onlyA.some((m) => m.name === "A1")).toBe(true);
      expect(onlyA.some((m) => m.name === "B1")).toBe(false);
    });
  });

  describe("Áp dụng lên bảng suy theo member_id (compliance_records)", () => {
    it("editor bị giới hạn phòng A không tạo được bản ghi Tuân thủ cho nhân sự phòng B", async () => {
      const { deptA, period, teamB } = await makeFixtures();
      const memberB = await createMember({ period_id: period.id, team_id: teamB.id, name: "Nhân sự B" }, UNRESTRICTED);
      const scope: DataScope = { all: false, departmentId: deptA.id };
      await expect(
        createComplianceRecord({ period_id: period.id, member_id: memberB.id, vi_pham: 1 }, scope),
      ).rejects.toThrow(ScopeForbiddenError);
    });

    it("bản ghi Tuân thủ kế thừa đúng department_id của nhân sự (qua team) tại thời điểm tạo", async () => {
      const { deptA, period, teamA } = await makeFixtures();
      const memberA = await createMember({ period_id: period.id, team_id: teamA.id, name: "Nhân sự A" }, UNRESTRICTED);
      const record = await createComplianceRecord(
        { period_id: period.id, member_id: memberA.id, vi_pham: 2 },
        UNRESTRICTED,
      );
      expect((record as any).department_id).toBe(deptA.id);
    });
  });

  describe("Rule 5.1 phương án A — admin và phòng full-access không bị chặn ghi", () => {
    it("scope.all=true (admin, hoặc phòng is_full_access) tạo/sửa/xóa được ở mọi phòng ban", async () => {
      const { deptA, deptB, period, teamA, teamB } = await makeFixtures();
      const taskA = await createTask(period.id, { team: teamA.name, nhiem_vu: "X", department_id: deptA.id }, UNRESTRICTED);
      const taskB = await createTask(period.id, { team: teamB.name, nhiem_vu: "Y", department_id: deptB.id }, UNRESTRICTED);

      await expect(updateTask(taskA.id, { tien_do: "ok" }, UNRESTRICTED)).resolves.toBeDefined();
      await expect(updateTask(taskB.id, { tien_do: "ok" }, UNRESTRICTED)).resolves.toBeDefined();
      await expect(deleteTask(taskA.id, UNRESTRICTED)).resolves.toBe(true);
      await expect(deleteTask(taskB.id, UNRESTRICTED)).resolves.toBe(true);
    });
  });
});
