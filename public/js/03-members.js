// ---- Members (bảng CRUD: STT / Họ và Tên / Chức vụ / Team) ----

async function loadMembers() {
  if (!state.currentPeriodId) {
    state.members = [];
    state.memberKpiTheoTask = [];
    renderMemberTeamFilter();
    renderMemberTable();
    syncHomeFromCurrentIfNeeded();
    return;
  }
  const [members, kpiTheoTask] = await Promise.all([
    api(`/api/members?period_id=${state.currentPeriodId}${deptParam()}`),
    api(`/api/kpi-theo-task?period_id=${state.currentPeriodId}${deptParam()}`).catch(() => []),
  ]);
  state.members = members;
  state.memberKpiTheoTask = kpiTheoTask;
  const memberIds = new Set(state.members.map((m) => m.id));
  state.selectedMemberIds.forEach((id) => {
    if (!memberIds.has(id)) state.selectedMemberIds.delete(id);
  });
  renderMemberTeamFilter();
  renderMemberTable();
  syncHomeFromCurrentIfNeeded();
}

// Lọc bảng Nhân sự theo team — dùng dropdown "Team" trong khung Bộ lọc.
function renderMemberTeamFilter() {
  el.teamFilterTeam.innerHTML = [`<option value="">Tất cả</option>`]
    .concat(state.teams.map((t) => `<option value="${t.name}">${t.name}</option>`))
    .join("");
  el.teamFilterTeam.value = state.memberFilterTeam;
}

el.teamFilterTeam.addEventListener("change", () => {
  state.memberFilterTeam = el.teamFilterTeam.value;
  memberPagination.reset();
  compliancePagination.reset();
  trainingPagination.reset();
  supportPagination.reset();
  evaluationPagination.reset();
  renderMemberTeamFilter();
  renderMemberTable();
  renderComplianceRecords();
  renderTrainingRecords();
  renderSupportRecords();
  renderEvaluationRecords();
});

function filteredMembers() {
  let list = state.memberFilterTeam ? state.members.filter((m) => m.team_name === state.memberFilterTeam) : state.members;
  const term = state.memberSearch.trim().toLowerCase();
  if (term) {
    list = list.filter(
      (m) =>
        (m.name ?? "").toLowerCase().includes(term) ||
        (m.chuc_vu ?? "").toLowerCase().includes(term) ||
        (m.team_name ?? "").toLowerCase().includes(term),
    );
  }
  return list;
}

// Dùng chung dropdown "Team" trong khung Bộ lọc để lọc luôn bảng Tuân thủ và
// Đào tạo (không chỉ bảng Nhân sự), vì cả 2 bảng này đều có sẵn team_name.
function filteredComplianceRecords() {
  if (!state.memberFilterTeam) return state.complianceRecords;
  return state.complianceRecords.filter((c) => c.team_name === state.memberFilterTeam);
}

function filteredTrainingRecords() {
  if (!state.memberFilterTeam) return state.trainingRecords;
  return state.trainingRecords.filter((t) => t.team_name === state.memberFilterTeam);
}

function updateMemberSelectionUI() {
  const visible = filteredMembers();
  const visibleSelectedCount = visible.filter((m) => state.selectedMemberIds.has(m.id)).length;
  el.deleteSelectedMembersBtn.hidden = state.selectedMemberIds.size === 0;
  el.selectedMemberCount.textContent = String(state.selectedMemberIds.size);
  el.memberSelectAll.checked = visible.length > 0 && visibleSelectedCount === visible.length;
  el.memberSelectAll.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visible.length;
}

// Dòng KPI-theo-task (GET /api/kpi-theo-task) của 1 nhân sự — có tasks[] kèm
// điểm từng task (đã tính sẵn ở backend, đúng công thức ở popup "Nhân sự
// tham gia": diem_ca_nhan ghi đè, không thì tự tính = % Đánh giá x Tỷ lệ
// đóng góp).
function memberKpiTheoTaskRow(memberId) {
  return state.memberKpiTheoTask.find((r) => r.member_id === memberId);
}

// "Điểm cá nhân (Tính theo task)" = ĐIỂM TRUNG BÌNH (không phải tổng) của
// các task ĐÃ CÓ điểm. null nếu chưa có task nào có điểm.
// Chỉ lấy TRUNG BÌNH các task "Thực hiện chính" (hoặc chưa phân loại) —
// task "Hỗ trợ" KHÔNG tính vào trung bình mà CỘNG THẲNG điểm thêm vào sau
// (điểm cộng, không chia lại theo số lượng). VD 3 việc thực hiện chính + 1
// việc hỗ trợ -> trung bình 3 việc chính + điểm việc hỗ trợ cộng thêm.
//
// t.diem tính khác nhau theo phân loại (xem
// taskMember.service.ts#listKpiTheoTask): task "Thực hiện chính" (hoặc chưa
// phân loại) = thẳng % Đánh giá, KHÔNG nhân Tỷ lệ đóng góp — tránh task
// nhiều người chia sẻ (tỷ lệ thấp) bị kéo điểm xuống so với task 1 người
// làm trọn (100%) dù % Đánh giá như nhau, không phản ánh đúng nỗ lực; task
// "Hỗ trợ" = Tỷ lệ đóng góp × % Đánh giá (VẪN nhân tỷ lệ — hỗ trợ càng
// nhiều mới cộng càng nhiều).
function memberAvgDiemTheoTask(memberId) {
  const row = memberKpiTheoTaskRow(memberId);
  if (!row) return null;
  const scored = row.tasks.filter((t) => t.diem !== null);
  const mainTasks = scored.filter((t) => t.phan_loai !== HO_TRO_LABEL);
  const bonusTasks = scored.filter((t) => t.phan_loai === HO_TRO_LABEL);
  if (mainTasks.length === 0 && bonusTasks.length === 0) return null;
  const mainAvg = mainTasks.length > 0 ? mainTasks.reduce((sum, t) => sum + t.diem, 0) / mainTasks.length : 0;
  const bonus = bonusTasks.reduce((sum, t) => sum + t.diem, 0);
  return Math.round((mainAvg + bonus) * 100) / 100;
}

function openMemberTaskDetailDialog(member) {
  const row = memberKpiTheoTaskRow(member.id);
  const tasks = row?.tasks ?? [];
  document.getElementById("member-task-detail-name").textContent = member.name;
  const tbody = document.getElementById("member-task-detail-tbody");
  const empty = document.getElementById("member-task-detail-empty");
  empty.hidden = tasks.length > 0;

  // Phòng ban tính KPI theo task (không chia team) — cột Team ở bảng chi
  // tiết này không có ý nghĩa (mọi task đều cùng 1 team hoặc không chia
  // team), ẩn đi cho gọn. Phòng theo_team vẫn hiện như cũ.
  const hideTeamColumn = homeCachTinhKpiTheoTask();
  const teamTh = document.getElementById("member-task-detail-team-th");
  if (teamTh) teamTh.hidden = hideTeamColumn;

  tbody.innerHTML = tasks
    .map(
      (t) => `
    <tr>
      <td>${t.nhiem_vu}</td>
      <td ${hideTeamColumn ? "hidden" : ""}><span class="status-badge ${teamColorClass(t.team)}">${t.team}</span></td>
      <td>${t.phan_loai ?? ""}</td>
      <td>${t.ty_le_dong_gop ?? "-"}</td>
      <td>${t.cpo_danh_gia ?? "-"}</td>
      <td>${t.diem ?? "-"}</td>
    </tr>`,
    )
    .join("");
  document.getElementById("member-task-detail-dialog").showModal();
}
document.getElementById("member-task-detail-close-btn").addEventListener("click", () => {
  document.getElementById("member-task-detail-dialog").close();
});

function renderMemberTable() {
  const visible = filteredMembers();
  el.memberEmpty.hidden = visible.length > 0;
  const pageItems = memberPagination.slice(visible);
  const pageStart = (memberPagination.page - 1) * memberPagination.pageSize;
  // Cột "Nội quy" tổng hợp từ cột Total của tab Nội quy (map theo tên nhân
  // sự), không còn nhập tay — hiển thị "-N" khi Total > 0, ngược lại để trống.
  const workRuleByName = new Map(computeWorkRuleRows().map((r) => [r.name, r.total]));
  // Phòng ban tính KPI theo task (không chia team) — ẩn cột Team.
  const hideTeamColumn = homeCachTinhKpiTheoTask();
  el.memberTbody.innerHTML = pageItems
    .map((m, i) => {
      const workRuleTotal = workRuleByName.get(m.name) ?? 0;
      const avgDiem = memberAvgDiemTheoTask(m.id);
      return `
    <tr data-id="${m.id}" class="member-row-clickable" title="Bấm để xem chi tiết công việc tham gia">
      <td><input type="checkbox" class="member-row-checkbox" ${state.selectedMemberIds.has(m.id) ? "checked" : ""} /></td>
      <td>${pageStart + i + 1}</td>
      <td><div class="name-with-ha-ki">${m.name}${m.ha_ki ? `<span class="status-badge status-huy ha-ki-badge" title="Đã hạ 1 KI — xem Home &gt; Ranking &gt; Ranking thành viên team">Hạ KI</span>` : ""}</div></td>
      <td>${m.chuc_vu ?? ""}</td>
      <td ${hideTeamColumn ? "hidden" : ""}><span class="status-badge ${teamColorClass(m.team_name)}">${m.team_name}</span></td>
      <td>${m.tuan_thu ?? ""}</td>
      <td>${workRuleTotal > 0 ? `-${workRuleTotal}` : ""}</td>
      <td>${m.dao_tao ?? ""}</td>
      <td>${m.ho_tro ?? ""}</td>
      <td>${m.danh_gia ?? ""}</td>
      <td>${avgDiem ?? "-"}</td>
      <td><div class="actions-cell">
        <button class="small ${m.ha_ki ? "btn-delete" : "btn-exclude"} toggle-ha-ki-btn" data-ha-ki="${m.ha_ki}" title="Hạ 1 KI của nhân sự này (xem ở Home &gt; Ranking &gt; Ranking thành viên team)">${m.ha_ki ? "Bỏ hạ KI" : "Hạ KI"}</button>
        <button class="small btn-edit edit-member-btn">Sửa</button>
        <button class="small btn-delete delete-member-btn">Xóa</button>
      </div></td>
    </tr>`;
    })
    .join("");

  // Bấm vào dòng (trừ ô checkbox/nút Sửa/Xóa) -> xem chi tiết công việc đã
  // tham gia (thêm ở Backlog / popup "Nhân sự tham gia").
  el.memberTbody.querySelectorAll("tr.member-row-clickable").forEach((tr) => {
    tr.addEventListener("click", (e) => {
      if (e.target.closest("input, button, .actions-cell")) return;
      const id = Number(tr.dataset.id);
      const member = state.members.find((m) => m.id === id);
      if (member) openMemberTaskDetailDialog(member);
    });
  });

  el.memberTbody.querySelectorAll(".member-row-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (e.target.checked) {
        state.selectedMemberIds.add(id);
      } else {
        state.selectedMemberIds.delete(id);
      }
      updateMemberSelectionUI();
    });
  });
  el.memberTbody.querySelectorAll(".toggle-ha-ki-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      const nextHaKi = btn.dataset.haKi !== "true";
      try {
        await api(`/api/members/${id}`, { method: "PUT", body: JSON.stringify({ ha_ki: nextHaKi }) });
        await loadMembers();
        syncHomeFromCurrentIfNeeded();
        showToast(nextHaKi ? "Đã hạ 1 KI." : "Đã bỏ hạ KI.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
  el.memberTbody.querySelectorAll(".edit-member-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openMemberDialog(state.members.find((m) => m.id === id));
    });
  });
  el.memberTbody.querySelectorAll(".delete-member-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (!await confirmDialog("Xóa nhân sự này?")) return;
      try {
        await api(`/api/members/${id}`, { method: "DELETE" });
        state.selectedMemberIds.delete(id);
        await loadMembers();
        showToast("Đã xóa nhân sự.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  updateMemberSelectionUI();
  syncMemberStickyOffsets();
}

// 3 cột đầu (checkbox/STT/Họ và Tên) của #member-table cố định khi cuộn
// ngang (xem CSS "left: var(--member-col2-left...)") — đo ĐÚNG width thật
// đã render của 2 cột đầu (table-layout: auto nên width khai ở HTML chỉ là
// gợi ý, trình duyệt có thể co giãn khác đi) thay vì hard-code px, tránh hở
// khoảng trắng/đè chồng giữa các cột cố định khi width thực tế lệch.
function syncMemberStickyOffsets() {
  const table = document.getElementById("member-table");
  const th1 = table?.querySelector("thead th:nth-child(1)");
  const th2 = table?.querySelector("thead th:nth-child(2)");
  if (!table || !th1 || !th2) return;
  const col2Left = th1.getBoundingClientRect().width;
  const col3Left = col2Left + th2.getBoundingClientRect().width;
  table.style.setProperty("--member-col2-left", `${col2Left}px`);
  table.style.setProperty("--member-col3-left", `${col3Left}px`);
}
window.addEventListener("resize", () => syncMemberStickyOffsets());

el.memberSearch.addEventListener("input", () => {
  state.memberSearch = el.memberSearch.value;
  memberPagination.reset();
  renderMemberTable();
});

el.memberSelectAll.addEventListener("change", (e) => {
  const visible = filteredMembers();
  if (e.target.checked) {
    visible.forEach((m) => state.selectedMemberIds.add(m.id));
  } else {
    visible.forEach((m) => state.selectedMemberIds.delete(m.id));
  }
  renderMemberTable();
});

el.deleteSelectedMembersBtn.addEventListener("click", async () => {
  const ids = [...state.selectedMemberIds];
  if (ids.length === 0) return;
  if (!await confirmDialog(`Xóa ${ids.length} nhân sự đã chọn?`)) return;
  try {
    await api("/api/members/delete-selected", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    state.selectedMemberIds.clear();
    await loadMembers();
    showToast(`Đã xóa ${ids.length} nhân sự.`, "success");
  } catch (err) {
    showToast(err.message);
  }
});

function openMemberDialog(member) {
  el.memberForm.reset();
  document.getElementById("m-id").value = member?.id ?? "";
  el.memberDialogTitle.textContent = member ? "Sửa nhân sự" : "Thêm nhân sự";

  const teamSelectEl = document.getElementById("m-team");
  teamSelectEl.innerHTML = state.teams
    .map((t) => `<option value="${t.id}">${t.name}</option>`)
    .join("");
  teamSelectEl.value = String(member?.team_id ?? state.currentTeamId ?? state.teams[0]?.id ?? "");

  document.getElementById("m-name").value = member?.name ?? "";
  const positionSelect = document.getElementById("m-chuc-vu");
  positionSelect.innerHTML =
    `<option value="">-- Chọn chức vụ --</option>` +
    state.positionOptions.map((c) => `<option value="${c.ten_chuc_vu}">${c.ten_chuc_vu}</option>`).join("");
  positionSelect.value = member?.chuc_vu ?? "";
  el.memberDialog.showModal();
}

el.addMemberBtn.addEventListener("click", () => {
  if (state.teams.length === 0) {
    showToast("Hãy khai báo ít nhất một team trước khi thêm nhân sự.");
    return;
  }
  if (!state.currentPeriodId) {
    showToast("Hãy tạo ít nhất một tháng backlog trước khi thêm nhân sự.");
    return;
  }
  openMemberDialog(null);
});

el.memberCancelBtn.addEventListener("click", () => el.memberDialog.close());

el.downloadMemberTemplateBtn.addEventListener("click", () => {
  if (!state.currentPeriodId) {
    showToast("Hãy chọn một tháng backlog trước.");
    return;
  }
  window.location.href = `/api/members/import-template?period_id=${state.currentPeriodId}${deptParam()}`;
});

el.importMembersBtn.addEventListener("click", () => {
  if (!state.currentPeriodId) {
    showToast("Hãy chọn một tháng backlog trước.");
    return;
  }
  el.memberFileInput.click();
});

el.memberFileInput.addEventListener("change", async () => {
  const file = el.memberFileInput.files[0];
  el.memberFileInput.value = "";
  if (!file) return;
  try {
    const buffer = await file.arrayBuffer();
    const res = await fetch(`/api/members/import?period_id=${state.currentPeriodId}${deptParam()}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: buffer,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Lỗi ${res.status}`);
    }
    const result = await res.json();
    await loadTeams();
    await loadMembers();

    let msg = `Đã nhập ${result.imported} nhân sự.`;
    if (result.teamsCreated?.length) {
      msg += ` Tạo mới ${result.teamsCreated.length} team: ${result.teamsCreated.join(", ")}.`;
    }
    if (result.skipped?.length) {
      const detail = result.skipped
        .slice(0, 5)
        .map((s) => `dòng ${s.row}${s.name ? ` (${s.name})` : ""}: ${s.reason}`)
        .join("; ");
      const more = result.skipped.length > 5 ? `; +${result.skipped.length - 5} dòng khác` : "";
      showToast(`${msg} Bỏ qua ${result.skipped.length} dòng — ${detail}${more}`, "error");
    } else {
      showToast(msg, "success");
    }
  } catch (err) {
    showToast(err.message);
  }
});

el.memberForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("m-id").value;
  const payload = {
    name: document.getElementById("m-name").value.trim(),
    chuc_vu: document.getElementById("m-chuc-vu").value.trim() || undefined,
    team_id: Number(document.getElementById("m-team").value),
    period_id: state.currentPeriodId,
  };

  try {
    if (id) {
      await api(`/api/members/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      el.memberDialog.close();
      await loadMembers();
      showToast("Đã cập nhật nhân sự.", "success");
    } else {
      await api("/api/members", { method: "POST", body: JSON.stringify(payload) });
      el.memberDialog.close();
      await loadMembers();
      showToast("Đã thêm nhân sự.", "success");
    }
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Import Excel dùng chung (Nhân sự / Nhiệm vụ / Roadmap) ----

async function runExcelImport({ url, file, unit }) {
  const buffer = await file.arrayBuffer();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: buffer,
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(b.error || `Lỗi ${res.status}`);
  }
  const result = await res.json();
  let msg = `Đã nhập ${result.imported} ${unit}.`;
  if (result.teamsCreated?.length) {
    msg += ` Tạo mới ${result.teamsCreated.length} team: ${result.teamsCreated.join(", ")}.`;
  }
  if (result.skipped?.length) {
    const detail = result.skipped
      .slice(0, 5)
      .map((s) => {
        const name = s.nhiem_vu || s.name;
        return `dòng ${s.row}${name ? ` (${name})` : ""}: ${s.reason}`;
      })
      .join("; ");
    const more = result.skipped.length > 5 ? `; +${result.skipped.length - 5} dòng khác` : "";
    showToast(`${msg} Bỏ qua ${result.skipped.length} dòng — ${detail}${more}`, "error");
  } else {
    showToast(msg, "success");
  }
}

// ---- Import Excel: Nhiệm vụ (Backlog) ----

el.downloadTaskTemplateBtn.addEventListener("click", () => {
  if (!state.currentPeriodId) {
    showToast("Hãy chọn một tháng backlog trước.");
    return;
  }
  window.location.href = `/api/periods/${state.currentPeriodId}/tasks/import-template${deptParam("?")}`;
});
el.importTasksBtn.addEventListener("click", () => {
  if (!state.currentPeriodId) {
    showToast("Hãy chọn một tháng backlog trước.");
    return;
  }
  el.taskFileInput.click();
});
el.taskFileInput.addEventListener("change", async () => {
  const file = el.taskFileInput.files[0];
  el.taskFileInput.value = "";
  if (!file) return;
  try {
    await runExcelImport({
      url: `/api/periods/${state.currentPeriodId}/tasks/import${deptParam("?")}`,
      file,
      unit: "nhiệm vụ",
    });
    await loadTeams();
    await loadTasks();
  } catch (err) {
    showToast(err.message);
  }
});

