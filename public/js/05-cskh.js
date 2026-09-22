// ---- CSKH: Sự cố / Hỗ trợ ticket / Tỉ lệ khởi tạo (CRUD theo team) ----

function teamOptionsHtml() {
  return state.teams.map((t) => `<option value="${t.id}">${t.name}</option>`).join("");
}

function periodOptionsHtml() {
  return state.periods.map((p) => `<option value="${p.id}">${p.label}</option>`).join("");
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

document.querySelectorAll("#cskh-subnav .pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll("#cskh-subnav .pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    ["incidents", "tickets", "creation-rates"].forEach((tab) => {
      document.getElementById(`cskh-tab-${tab}`).hidden = tab !== pill.dataset.tab;
    });
  });
});

document.querySelectorAll("#config-subnav .pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll("#config-subnav .pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    ["tieuchi", "ranking", "tagphanloai", "phongban", "users"].forEach((tab) => {
      document.getElementById(`config-tab-${tab}`).hidden = tab !== pill.dataset.tab;
    });
    if (pill.dataset.tab === "phongban") loadDepartmentConfig().catch((err) => showToast(err.message));
    if (pill.dataset.tab === "users") loadUsersConfig().catch((err) => showToast(err.message));
  });
});

document.querySelectorAll("#team-subnav .pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll("#team-subnav .pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    ["nhansu", "tuanthu", "noiquy", "daotao", "hotro", "danhgia", "chamcong"].forEach((tab) => {
      document.getElementById(`team-tab-${tab}`).hidden = tab !== pill.dataset.tab;
    });
  });
});

document.querySelectorAll("#home-subnav .pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll("#home-subnav .pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    ["ranking", "tonghop", "tyle-hoanthanh", "kpi-theo-task"].forEach((tab) => {
      document.getElementById(`home-tab-${tab}`).hidden = tab !== pill.dataset.tab;
    });
  });
});

// -- Sự cố --

async function loadIncidents() {
  state.incidents = await api("/api/incidents");
  renderIncidents();
}

function renderIncidents() {
  el.incidentEmpty.hidden = state.incidents.length > 0;
  const pageItems = incidentPagination.slice(state.incidents);
  el.incidentTbody.innerHTML = pageItems
    .map(
      (i) => `
    <tr data-id="${i.id}">
      <td>${i.period_label}</td>
      <td>${i.team_name}</td>
      <td>${(i.su_co ?? "").replace(/\n/g, "<br/>")}</td>
      <td>${i.tinh_chat ?? ""}</td>
      <td><div class="actions-cell">
        <button class="small btn-edit write-action edit-incident-btn">Sửa</button>
        <button class="small btn-delete delete-incident-btn">Xóa</button>
      </div></td>
    </tr>`,
    )
    .join("");

  el.incidentTbody.querySelectorAll(".edit-incident-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openIncidentDialog(state.incidents.find((i) => i.id === id));
    });
  });
  el.incidentTbody.querySelectorAll(".delete-incident-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (!await confirmDialog("Xóa sự cố này?")) return;
      try {
        await api(`/api/incidents/${id}`, { method: "DELETE" });
        await loadIncidents();
        showToast("Đã xóa sự cố.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

function openIncidentDialog(incident) {
  el.incidentForm.reset();
  document.getElementById("inc-id").value = incident?.id ?? "";
  el.incidentDialogTitle.textContent = incident ? "Sửa sự cố" : "Thêm sự cố";
  const periodSelectEl = document.getElementById("inc-period");
  periodSelectEl.innerHTML = periodOptionsHtml();
  periodSelectEl.value = String(incident?.period_id ?? state.currentPeriodId ?? state.periods[0]?.id ?? "");
  const teamSelectEl = document.getElementById("inc-team");
  teamSelectEl.innerHTML = teamOptionsHtml();
  teamSelectEl.value = String(incident?.team_id ?? state.currentTeamId ?? state.teams[0]?.id ?? "");
  document.getElementById("inc-su-co").value = incident?.su_co ?? "";
  document.getElementById("inc-tinh-chat").value = incident?.tinh_chat ?? "";
  el.incidentDialog.showModal();
}

el.addIncidentBtn.addEventListener("click", () => {
  if (state.teams.length === 0) {
    showToast("Hãy khai báo ít nhất một team trước.");
    return;
  }
  if (state.periods.length === 0) {
    showToast("Hãy tạo ít nhất một tháng backlog trước.");
    return;
  }
  openIncidentDialog(null);
});
el.incidentCancelBtn.addEventListener("click", () => el.incidentDialog.close());
el.incidentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("inc-id").value;
  const payload = {
    period_id: Number(document.getElementById("inc-period").value),
    team_id: Number(document.getElementById("inc-team").value),
    su_co: document.getElementById("inc-su-co").value.trim(),
    tinh_chat: document.getElementById("inc-tinh-chat").value.trim() || undefined,
  };
  try {
    if (id) {
      await api(`/api/incidents/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      el.incidentDialog.close();
      await loadIncidents();
      showToast("Đã cập nhật sự cố.", "success");
    } else {
      await api("/api/incidents", { method: "POST", body: JSON.stringify(payload) });
      el.incidentDialog.close();
      await loadIncidents();
      showToast("Đã thêm sự cố.", "success");
    }
  } catch (err) {
    showToast(err.message);
  }
});

// -- Tuân thủ (trang Team & Nhân sự) --

async function loadComplianceRecords() {
  if (!state.currentPeriodId) {
    state.complianceRecords = [];
    renderComplianceRecords();
    syncHomeFromCurrentIfNeeded();
    return;
  }
  state.complianceRecords = await api(`/api/compliance-records?period_id=${state.currentPeriodId}`);
  renderComplianceRecords();
  syncHomeFromCurrentIfNeeded();
}

function renderComplianceRecords() {
  const visible = filteredComplianceRecords();
  el.complianceEmpty.hidden = visible.length > 0;
  const pageItems = compliancePagination.slice(visible);
  el.complianceTbody.innerHTML = pageItems
    .map(
      (c) => `
    <tr data-id="${c.id}">
      <td>${c.period_label}</td>
      <td><span class="status-badge ${teamColorClass(c.team_name)}">${c.team_name}</span></td>
      <td>${c.member_name}</td>
      <td>${c.vi_pham}</td>
      <td>${(c.noi_dung ?? "").replace(/\n/g, "<br/>")}</td>
      <td><div class="actions-cell">
        <button class="small btn-edit write-action edit-compliance-btn">Sửa</button>
        <button class="small btn-delete delete-compliance-btn">Xóa</button>
      </div></td>
    </tr>`,
    )
    .join("");

  el.complianceTbody.querySelectorAll(".edit-compliance-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openComplianceDialog(state.complianceRecords.find((c) => c.id === id));
    });
  });
  el.complianceTbody.querySelectorAll(".delete-compliance-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (!await confirmDialog("Xóa dữ liệu tuân thủ này?")) return;
      try {
        await api(`/api/compliance-records/${id}`, { method: "DELETE" });
        await loadComplianceRecords();
        await loadMembers();
        showToast("Đã xóa dữ liệu tuân thủ.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

// Chọn Team nào thì lọc dropdown Nhân sự theo team đó. Khi sửa, dùng đúng
// danh sách nhân sự của Tháng theo dõi bản ghi (có thể khác tháng đang lọc ở
// Bộ lọc phía trên).
async function openComplianceDialog(record) {
  el.complianceForm.reset();
  document.getElementById("cp-id").value = record?.id ?? "";
  el.complianceDialogTitle.textContent = record ? "Sửa dữ liệu tuân thủ" : "Thêm mới";

  const teamSelectEl = document.getElementById("cp-team");
  const memberSelectEl = document.getElementById("cp-member");
  teamSelectEl.innerHTML = teamOptionsHtml();

  const membersForDialog = record
    ? await api(`/api/members?period_id=${record.period_id}${deptParam()}`)
    : state.members;

  function refreshMemberOptions() {
    const teamId = Number(teamSelectEl.value);
    memberSelectEl.innerHTML = membersForDialog
      .filter((m) => m.team_id === teamId)
      .map((m) => `<option value="${m.id}">${m.name}</option>`)
      .join("");
  }

  teamSelectEl.value = String(record?.team_id ?? state.currentTeamId ?? state.teams[0]?.id ?? "");
  refreshMemberOptions();
  if (record) memberSelectEl.value = String(record.member_id);
  teamSelectEl.onchange = refreshMemberOptions;

  document.getElementById("cp-vi-pham").value = record?.vi_pham ?? 0;
  document.getElementById("cp-noi-dung").value = record?.noi_dung ?? "";
  el.complianceDialog.showModal();
}

el.addComplianceBtn.addEventListener("click", () => {
  if (state.teams.length === 0) {
    showToast("Hãy khai báo ít nhất một team trước.");
    return;
  }
  if (!state.currentPeriodId) {
    showToast("Hãy chọn một tháng backlog trước.");
    return;
  }
  if (state.members.length === 0) {
    showToast("Chưa có nhân sự nào trong tháng đang chọn — hãy thêm nhân sự trước.");
    return;
  }
  openComplianceDialog(null);
});
el.complianceCancelBtn.addEventListener("click", () => el.complianceDialog.close());
el.complianceForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("cp-id").value;
  const payload = {
    member_id: Number(document.getElementById("cp-member").value),
    vi_pham: Number(document.getElementById("cp-vi-pham").value) || 0,
    noi_dung: document.getElementById("cp-noi-dung").value.trim() || undefined,
  };
  try {
    if (id) {
      await api(`/api/compliance-records/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      el.complianceDialog.close();
      await loadComplianceRecords();
      await loadMembers();
      showToast("Đã cập nhật dữ liệu tuân thủ.", "success");
    } else {
      payload.period_id = state.currentPeriodId;
      await api("/api/compliance-records", { method: "POST", body: JSON.stringify(payload) });
      el.complianceDialog.close();
      await loadComplianceRecords();
      await loadMembers();
      showToast("Đã thêm dữ liệu tuân thủ.", "success");
    }
  } catch (err) {
    showToast(err.message);
  }
});

// -- Đào tạo nội bộ và Chứng chỉ quốc tế (trang Team & Nhân sự) --

async function loadTrainingRecords() {
  if (!state.currentPeriodId) {
    state.trainingRecords = [];
    renderTrainingRecords();
    syncHomeFromCurrentIfNeeded();
    return;
  }
  state.trainingRecords = await api(`/api/training-records?period_id=${state.currentPeriodId}`);
  renderTrainingRecords();
  syncHomeFromCurrentIfNeeded();
}

function renderTrainingRecords() {
  const visible = filteredTrainingRecords();
  el.trainingEmpty.hidden = visible.length > 0;
  const pageItems = trainingPagination.slice(visible);
  el.trainingTbody.innerHTML = pageItems
    .map(
      (t) => `
    <tr data-id="${t.id}">
      <td>${t.period_label}</td>
      <td><span class="status-badge ${teamColorClass(t.team_name)}">${t.team_name}</span></td>
      <td>${t.member_name}</td>
      <td>${t.loai ? `<span class="status-badge ${typeColorClass(t.loai)}">${t.loai}</span>` : ""}</td>
      <td>${formatDateDisplay(t.ngay_thuc_hien)}</td>
      <td>${t.nguoi_xac_nhan ?? ""}</td>
      <td>${(t.noi_dung ?? "").replace(/\n/g, "<br/>")}</td>
      <td><div class="actions-cell">
        <button class="small btn-edit write-action edit-training-btn">Sửa</button>
        <button class="small btn-delete delete-training-btn">Xóa</button>
      </div></td>
    </tr>`,
    )
    .join("");

  el.trainingTbody.querySelectorAll(".edit-training-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openTrainingDialog(state.trainingRecords.find((t) => t.id === id));
    });
  });
  el.trainingTbody.querySelectorAll(".delete-training-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (!await confirmDialog("Xóa dữ liệu đào tạo này?")) return;
      try {
        await api(`/api/training-records/${id}`, { method: "DELETE" });
        await loadTrainingRecords();
        await loadMembers();
        showToast("Đã xóa dữ liệu đào tạo.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

// Chọn Team nào thì lọc dropdown Nhân sự theo team đó. Khi sửa, dùng đúng
// danh sách nhân sự của Tháng theo dõi bản ghi (có thể khác tháng đang lọc ở
// Bộ lọc phía trên).
async function openTrainingDialog(record) {
  el.trainingForm.reset();
  document.getElementById("tr-id").value = record?.id ?? "";
  el.trainingDialogTitle.textContent = record ? "Sửa dữ liệu đào tạo" : "Thêm mới";

  const teamSelectEl = document.getElementById("tr-team");
  const memberSelectEl = document.getElementById("tr-member");
  teamSelectEl.innerHTML = teamOptionsHtml();

  const membersForDialog = record
    ? await api(`/api/members?period_id=${record.period_id}${deptParam()}`)
    : state.members;

  function refreshMemberOptions() {
    const teamId = Number(teamSelectEl.value);
    memberSelectEl.innerHTML = membersForDialog
      .filter((m) => m.team_id === teamId)
      .map((m) => `<option value="${m.id}">${m.name}</option>`)
      .join("");
  }

  teamSelectEl.value = String(record?.team_id ?? state.currentTeamId ?? state.teams[0]?.id ?? "");
  refreshMemberOptions();
  if (record) memberSelectEl.value = String(record.member_id);
  teamSelectEl.onchange = refreshMemberOptions;

  document.getElementById("tr-loai").value = record?.loai ?? "";
  document.getElementById("tr-ngay-thuc-hien").value = formatDateInput(record?.ngay_thuc_hien);
  document.getElementById("tr-nguoi-xac-nhan").value = record?.nguoi_xac_nhan ?? "";
  document.getElementById("tr-noi-dung").value = record?.noi_dung ?? "";
  el.trainingDialog.showModal();
}

el.addTrainingBtn.addEventListener("click", () => {
  if (state.teams.length === 0) {
    showToast("Hãy khai báo ít nhất một team trước.");
    return;
  }
  if (!state.currentPeriodId) {
    showToast("Hãy chọn một tháng backlog trước.");
    return;
  }
  if (state.members.length === 0) {
    showToast("Chưa có nhân sự nào trong tháng đang chọn — hãy thêm nhân sự trước.");
    return;
  }
  openTrainingDialog(null);
});
el.trainingCancelBtn.addEventListener("click", () => el.trainingDialog.close());
el.trainingForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("tr-id").value;
  const payload = {
    member_id: Number(document.getElementById("tr-member").value),
    loai: document.getElementById("tr-loai").value,
    ngay_thuc_hien: document.getElementById("tr-ngay-thuc-hien").value || undefined,
    nguoi_xac_nhan: document.getElementById("tr-nguoi-xac-nhan").value.trim() || undefined,
    noi_dung: document.getElementById("tr-noi-dung").value.trim() || undefined,
  };
  try {
    if (id) {
      await api(`/api/training-records/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      el.trainingDialog.close();
      await loadTrainingRecords();
      await loadMembers();
      showToast("Đã cập nhật dữ liệu đào tạo.", "success");
    } else {
      payload.period_id = state.currentPeriodId;
      await api("/api/training-records", { method: "POST", body: JSON.stringify(payload) });
      el.trainingDialog.close();
      await loadTrainingRecords();
      await loadMembers();
      showToast("Đã thêm dữ liệu đào tạo.", "success");
    }
  } catch (err) {
    showToast(err.message);
  }
});

// -- Hỗ trợ (trang Team & Nhân sự) — nhân sự (kèm team của nhân sự = "Team
// thực hiện hỗ trợ") hỗ trợ cho 1 team khác ("Team nhận hỗ trợ"). --

async function loadSupportRecords() {
  if (!state.currentPeriodId) {
    state.supportRecords = [];
    renderSupportRecords();
    syncHomeFromCurrentIfNeeded();
    return;
  }
  state.supportRecords = await api(`/api/support-records?period_id=${state.currentPeriodId}`);
  renderSupportRecords();
  syncHomeFromCurrentIfNeeded();
}

// Dùng chung dropdown "Team" trong khung Bộ lọc — lọc theo Team thực hiện
// hỗ trợ (team_name), giống Tuân thủ/Đào tạo.
function filteredSupportRecords() {
  if (!state.memberFilterTeam) return state.supportRecords;
  return state.supportRecords.filter((s) => s.team_name === state.memberFilterTeam);
}

function renderSupportRecords() {
  const visible = filteredSupportRecords();
  el.supportEmpty.hidden = visible.length > 0;
  const pageItems = supportPagination.slice(visible);
  el.supportTbody.innerHTML = pageItems
    .map(
      (s) => `
    <tr data-id="${s.id}">
      <td>${s.period_label}</td>
      <td><span class="status-badge ${teamColorClass(s.team_name)}">${s.team_name}</span></td>
      <td>${s.member_name}</td>
      <td><span class="status-badge ${teamColorClass(s.team_nhan_ho_tro_name)}">${s.team_nhan_ho_tro_name}</span></td>
      <td>${(s.noi_dung ?? "").replace(/\n/g, "<br/>")}</td>
      <td>${formatDateDisplay(s.ngay_ho_tro)}</td>
      <td>${s.nguoi_xac_nhan ?? ""}</td>
      <td><div class="actions-cell">
        <button class="small btn-edit write-action edit-support-btn">Sửa</button>
        <button class="small btn-delete delete-support-btn">Xóa</button>
      </div></td>
    </tr>`,
    )
    .join("");

  el.supportTbody.querySelectorAll(".edit-support-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openSupportDialog(state.supportRecords.find((s) => s.id === id));
    });
  });
  el.supportTbody.querySelectorAll(".delete-support-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (!await confirmDialog("Xóa dữ liệu hỗ trợ này?")) return;
      try {
        await api(`/api/support-records/${id}`, { method: "DELETE" });
        await loadSupportRecords();
        showToast("Đã xóa dữ liệu hỗ trợ.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

// Chọn Team (thực hiện hỗ trợ) nào thì lọc dropdown Nhân sự theo team đó,
// giống Đào tạo/Tuân thủ. Team nhận hỗ trợ là dropdown độc lập, chọn bất kỳ
// team nào (kể cả trùng Team thực hiện hỗ trợ).
async function openSupportDialog(record) {
  el.supportForm.reset();
  document.getElementById("sp-id").value = record?.id ?? "";
  el.supportDialogTitle.textContent = record ? "Sửa dữ liệu hỗ trợ" : "Thêm mới";

  const teamSelectEl = document.getElementById("sp-team");
  const memberSelectEl = document.getElementById("sp-member");
  const teamNhanSelectEl = document.getElementById("sp-team-nhan");
  teamSelectEl.innerHTML = teamOptionsHtml();
  teamNhanSelectEl.innerHTML = teamOptionsHtml();

  const membersForDialog = record
    ? await api(`/api/members?period_id=${record.period_id}${deptParam()}`)
    : state.members;

  function refreshMemberOptions() {
    const teamId = Number(teamSelectEl.value);
    memberSelectEl.innerHTML = membersForDialog
      .filter((m) => m.team_id === teamId)
      .map((m) => `<option value="${m.id}">${m.name}</option>`)
      .join("");
  }

  teamSelectEl.value = String(record?.team_id ?? state.currentTeamId ?? state.teams[0]?.id ?? "");
  refreshMemberOptions();
  if (record) memberSelectEl.value = String(record.member_id);
  teamSelectEl.onchange = refreshMemberOptions;

  teamNhanSelectEl.value = String(record?.team_nhan_ho_tro_id ?? state.teams[0]?.id ?? "");
  document.getElementById("sp-ngay-ho-tro").value = formatDateInput(record?.ngay_ho_tro);
  document.getElementById("sp-nguoi-xac-nhan").value = record?.nguoi_xac_nhan ?? "";
  document.getElementById("sp-noi-dung").value = record?.noi_dung ?? "";
  el.supportDialog.showModal();
}

el.addSupportBtn.addEventListener("click", () => {
  if (state.teams.length === 0) {
    showToast("Hãy khai báo ít nhất một team trước.");
    return;
  }
  if (!state.currentPeriodId) {
    showToast("Hãy chọn một tháng backlog trước.");
    return;
  }
  if (state.members.length === 0) {
    showToast("Chưa có nhân sự nào trong tháng đang chọn — hãy thêm nhân sự trước.");
    return;
  }
  openSupportDialog(null);
});
el.supportCancelBtn.addEventListener("click", () => el.supportDialog.close());
el.supportForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("sp-id").value;
  const payload = {
    member_id: Number(document.getElementById("sp-member").value),
    team_nhan_ho_tro_id: Number(document.getElementById("sp-team-nhan").value),
    ngay_ho_tro: document.getElementById("sp-ngay-ho-tro").value || undefined,
    nguoi_xac_nhan: document.getElementById("sp-nguoi-xac-nhan").value.trim() || undefined,
    noi_dung: document.getElementById("sp-noi-dung").value.trim() || undefined,
  };
  try {
    if (id) {
      await api(`/api/support-records/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      el.supportDialog.close();
      await loadSupportRecords();
      showToast("Đã cập nhật dữ liệu hỗ trợ.", "success");
    } else {
      payload.period_id = state.currentPeriodId;
      await api("/api/support-records", { method: "POST", body: JSON.stringify(payload) });
      el.supportDialog.close();
      await loadSupportRecords();
      showToast("Đã thêm dữ liệu hỗ trợ.", "success");
    }
  } catch (err) {
    showToast(err.message);
  }
});

// -- Đánh giá (trang Team & Nhân sự) — "+ Thêm Đánh giá" chọn 1 team, nhập
// Số thứ tự cho tất cả nhân sự trong team đó cùng lúc (upsert theo
// period_id + member_id, 1 nhân sự chỉ có đúng 1 dòng/tháng theo dõi).
// Sửa/Xóa từng dòng thực hiện ngoài bảng. --

async function loadEvaluationRecords() {
  if (!state.currentPeriodId) {
    state.evaluationRecords = [];
    renderEvaluationRecords();
    syncHomeFromCurrentIfNeeded();
    return;
  }
  state.evaluationRecords = await api(`/api/danh-gia-records?period_id=${state.currentPeriodId}`);
  renderEvaluationRecords();
  syncHomeFromCurrentIfNeeded();
}

function filteredEvaluationRecords() {
  if (!state.memberFilterTeam) return state.evaluationRecords;
  return state.evaluationRecords.filter((d) => d.team_name === state.memberFilterTeam);
}

function renderEvaluationRecords() {
  const visible = filteredEvaluationRecords();
  el.evaluationEmpty.hidden = visible.length > 0;
  const pageItems = evaluationPagination.slice(visible);
  el.evaluationTbody.innerHTML = pageItems
    .map(
      (d) => `
    <tr data-id="${d.id}">
      <td>${d.period_label}</td>
      <td><span class="status-badge ${teamColorClass(d.team_name)}">${d.team_name}</span></td>
      <td>${d.member_name}</td>
      <td>${d.so_thu_tu ?? ""}</td>
      <td><div class="actions-cell">
        <button class="small btn-edit write-action edit-danhgia-btn">Sửa</button>
        <button class="small btn-delete delete-danhgia-btn">Xóa</button>
      </div></td>
    </tr>`,
    )
    .join("");

  el.evaluationTbody.querySelectorAll(".edit-danhgia-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      const record = state.evaluationRecords.find((d) => d.id === id);
      openEvaluationDialog(record.team_id, "Sửa dữ liệu đánh giá");
    });
  });
  el.evaluationTbody.querySelectorAll(".delete-danhgia-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (!await confirmDialog("Xóa dữ liệu đánh giá này?")) return;
      try {
        await api(`/api/danh-gia-records/${id}`, { method: "DELETE" });
        await loadEvaluationRecords();
        showToast("Đã xóa dữ liệu đánh giá.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

// Chọn Team đánh giá thì hiển thị TẤT CẢ nhân sự của team đó kèm ô nhập Số
// thứ tự (pre-fill giá trị đã có, nếu có), cho phép nhập/sửa nhiều nhân sự
// cùng lúc rồi lưu 1 lần (upsert).
async function openEvaluationDialog(initialTeamId, title = "Thêm Đánh giá") {
  el.evaluationForm.reset();
  el.evaluationDialogTitle.textContent = title;

  const teamSelectEl = document.getElementById("dg-team");
  teamSelectEl.innerHTML = teamOptionsHtml();
  teamSelectEl.value = String(initialTeamId ?? state.currentTeamId ?? state.teams[0]?.id ?? "");

  function refreshMemberInputs() {
    const teamId = Number(teamSelectEl.value);
    const membersOfTeam = state.members.filter((m) => m.team_id === teamId);
    const inputTbody = document.getElementById("danhgia-member-input-tbody");
    const emptyEl = document.getElementById("danhgia-member-input-empty");
    emptyEl.hidden = membersOfTeam.length > 0;
    inputTbody.innerHTML = membersOfTeam
      .map((m) => {
        const existing = state.evaluationRecords.find((d) => d.member_id === m.id);
        return `
      <tr data-member-id="${m.id}">
        <td>${m.name}</td>
        <td><input type="number" step="1" class="dg-so-thu-tu-input" value="${existing?.so_thu_tu ?? ""}" /></td>
      </tr>`;
      })
      .join("");
  }

  teamSelectEl.onchange = refreshMemberInputs;
  refreshMemberInputs();
  el.evaluationDialog.showModal();
}

el.addEvaluationBtn.addEventListener("click", () => {
  if (state.teams.length === 0) {
    showToast("Hãy khai báo ít nhất một team trước.");
    return;
  }
  if (!state.currentPeriodId) {
    showToast("Hãy chọn một tháng backlog trước.");
    return;
  }
  if (state.members.length === 0) {
    showToast("Chưa có nhân sự nào trong tháng đang chọn — hãy thêm nhân sự trước.");
    return;
  }
  openEvaluationDialog(null);
});
el.evaluationCancelBtn.addEventListener("click", () => el.evaluationDialog.close());
el.evaluationForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const teamId = Number(document.getElementById("dg-team").value);
  const entries = Array.from(document.querySelectorAll("#danhgia-member-input-tbody tr"))
    .map((tr) => ({
      member_id: Number(tr.dataset.memberId),
      so_thu_tu: tr.querySelector(".dg-so-thu-tu-input").value,
    }))
    .filter((entry) => entry.so_thu_tu !== "")
    .map((entry) => ({ member_id: entry.member_id, so_thu_tu: Number(entry.so_thu_tu) }));

  if (entries.length === 0) {
    showToast("Hãy nhập ít nhất 1 Ranking.");
    return;
  }

  try {
    await api("/api/danh-gia-records/bulk", {
      method: "POST",
      body: JSON.stringify({ period_id: state.currentPeriodId, team_id: teamId, entries }),
    });
    el.evaluationDialog.close();
    await loadEvaluationRecords();
    showToast("Đã lưu dữ liệu đánh giá.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

// -- Chấm công (trang Team & Nhân sự) — import file Excel, cột động theo
// đúng các trường có trong file, không cố định trước. --

async function loadAttendanceRecords() {
  if (!state.currentPeriodId) {
    state.attendanceHeaders = [];
    state.attendanceRecords = [];
    state.workRuleOverrideNames = new Set();
    renderAttendanceThead();
    renderAttendanceTable();
    renderWorkRuleTable();
    syncHomeFromCurrentIfNeeded();
    return;
  }
  const [data] = await Promise.all([
    api(`/api/attendance-records?period_id=${state.currentPeriodId}`),
    loadWorkRuleOverrides(),
  ]);
  state.attendanceHeaders = data.headers;
  state.attendanceRecords = data.rows;
  const recordIds = new Set(state.attendanceRecords.map((r) => r.id));
  state.selectedAttendanceIds.forEach((id) => {
    if (!recordIds.has(id)) state.selectedAttendanceIds.delete(id);
  });
  renderAttendanceThead();
  renderAttendanceTable();
  renderWorkRuleTable();
  syncHomeFromCurrentIfNeeded();
}

async function loadWorkRuleOverrides() {
  if (!state.currentPeriodId) {
    state.workRuleOverrideNames = new Set();
    return;
  }
  const overrides = await api(`/api/noiquy-overrides?period_id=${state.currentPeriodId}`);
  state.workRuleOverrideNames = new Set(overrides.map((o) => o.member_name));
}

// Cột "Day of the Week" (import Chấm công) = Saturday/Sunday -> không tính
// vào Lượt đi muộn ở tab Nội quy — cuối tuần không phải ngày làm việc bắt
// buộc, đi trễ/không chấm công 2 ngày này không phản ánh vi phạm nội quy.
// Dùng chung cho cả computeWorkRuleRows() (tab Nội quy) và
// computeHomeWorkRuleRows() (Home, 08-home.js).
function isAttendanceWeekend(rowData) {
  const day = String(rowData["Day of the Week"] ?? "").trim();
  return day === "Saturday" || day === "Sunday";
}

// Tổng hợp Nội quy từ dữ liệu Chấm công đã nhập của tháng đang chọn — không
// lưu riêng, tính lại mỗi khi dữ liệu Chấm công thay đổi. Dòng Chấm công đã
// "Không tính đi muộn" (excluded_from_late) bị bỏ qua khi đếm; nhân sự đã
// "Không tính đi muộn" ở chính tab Nội quy (workRuleOverrideNames) bị ép về 0.
function computeWorkRuleRows() {
  if (state.attendanceRecords.length === 0) return [];

  const lateCountByName = new Map();
  state.attendanceRecords.forEach((r) => {
    const name = String(r.row_data["Name"] ?? "").trim();
    if (!name) return;
    if (isAttendanceWeekend(r.row_data)) return;
    if (r.excluded_from_late) {
      if (!lateCountByName.has(name)) lateCountByName.set(name, 0);
      return;
    }
    // "không chấm công sáng/chiều" là ghi chú vắng chấm công, không phải đi
    // muộn/về sớm — không tính vào Lượt đi muộn.
    const checkIn = String(r.row_data["Check In"] ?? "").trim();
    const checkOut = String(r.row_data["Check Out"] ?? "").trim();
    const isLateNote = (text) => text !== "" && !text.includes("không chấm công");
    if (isLateNote(checkIn) || isLateNote(checkOut)) {
      lateCountByName.set(name, (lateCountByName.get(name) ?? 0) + 1);
    } else if (!lateCountByName.has(name)) {
      lateCountByName.set(name, 0);
    }
  });

  return Array.from(lateCountByName.entries())
    .map(([name, late]) => {
      const member = state.members.find((m) => m.name === name);
      const excluded = state.workRuleOverrideNames.has(name);
      return {
        name,
        team: member?.team_name ?? "-",
        late: excluded ? 0 : late,
        total: excluded ? 0 : Math.max(0, late - 3),
        excluded,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function filteredWorkRuleRows() {
  const term = state.workRuleSearch.trim().toLowerCase();
  const rows = computeWorkRuleRows();
  if (!term) return rows;
  return rows.filter((r) => r.name.toLowerCase().includes(term) || r.team.toLowerCase().includes(term));
}

function updateWorkRuleSelectionUI() {
  const visible = filteredWorkRuleRows();
  const visibleSelectedCount = visible.filter((r) => state.selectedWorkRuleNames.has(r.name)).length;
  el.markExcludedWorkRuleBtn.hidden = state.selectedWorkRuleNames.size === 0;
  el.unmarkExcludedWorkRuleBtn.hidden = state.selectedWorkRuleNames.size === 0;
  const selectAllEl = document.getElementById("noiquy-select-all");
  if (selectAllEl) {
    selectAllEl.checked = visible.length > 0 && visibleSelectedCount === visible.length;
    selectAllEl.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visible.length;
  }
}

function renderWorkRuleTable() {
  const rows = filteredWorkRuleRows();
  el.workRuleEmpty.hidden = rows.length > 0;
  const period = state.periods.find((p) => p.id === state.currentPeriodId);
  const periodLabel = period?.label ?? "";
  const pageItems = workRulePagination.slice(rows);
  el.workRuleTbody.innerHTML = pageItems
    .map(
      (r) => `
    <tr>
      <td><input type="checkbox" class="noiquy-row-checkbox" data-name="${r.name}" ${state.selectedWorkRuleNames.has(r.name) ? "checked" : ""} /></td>
      <td>${periodLabel}</td>
      <td>${r.team === "-" ? "-" : `<span class="status-badge ${teamColorClass(r.team)}">${r.team}</span>`}</td>
      <td>${r.name}${r.excluded ? ' <span class="muted" style="font-size:0.8em">(Không tính đi muộn)</span>' : ""}</td>
      <td>${r.late}</td>
      <td${r.total > 0 ? ' class="noiquy-total-highlight"' : ""}>${r.total}</td>
    </tr>`,
    )
    .join("");

  el.workRuleTbody.querySelectorAll(".noiquy-row-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const name = e.target.dataset.name;
      if (e.target.checked) {
        state.selectedWorkRuleNames.add(name);
      } else {
        state.selectedWorkRuleNames.delete(name);
      }
      updateWorkRuleSelectionUI();
    });
  });

  updateWorkRuleSelectionUI();
  // Cột "Nội quy" ở bảng Nhân sự tổng hợp từ chính dữ liệu này (cột Total) —
  // render lại mỗi khi Nội quy thay đổi để luôn đồng bộ.
  renderMemberTable();
}

document.getElementById("noiquy-select-all").addEventListener("change", (e) => {
  const visible = filteredWorkRuleRows();
  if (e.target.checked) {
    visible.forEach((r) => state.selectedWorkRuleNames.add(r.name));
  } else {
    visible.forEach((r) => state.selectedWorkRuleNames.delete(r.name));
  }
  renderWorkRuleTable();
});

el.workRuleSearch.addEventListener("input", () => {
  state.workRuleSearch = el.workRuleSearch.value;
  workRulePagination.reset();
  renderWorkRuleTable();
});

el.markExcludedWorkRuleBtn.addEventListener("click", async () => {
  const names = [...state.selectedWorkRuleNames];
  if (names.length === 0) return;
  if (!await confirmDialog(`Đánh dấu "Không tính đi muộn" cho ${names.length} nhân sự đã chọn? Lượt đi muộn và Total sẽ về 0.`, { danger: false })) return;
  try {
    await api("/api/noiquy-overrides", {
      method: "POST",
      body: JSON.stringify({ period_id: state.currentPeriodId, names }),
    });
    state.selectedWorkRuleNames.clear();
    await loadWorkRuleOverrides();
    renderWorkRuleTable();
    showToast("Đã đánh dấu Không tính đi muộn.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

el.unmarkExcludedWorkRuleBtn.addEventListener("click", async () => {
  const names = [...state.selectedWorkRuleNames];
  if (names.length === 0) return;
  if (!await confirmDialog(`Bỏ "Không tính đi muộn" cho ${names.length} nhân sự đã chọn? Lượt đi muộn và Total sẽ tính lại như bình thường.`, { danger: false })) return;
  try {
    await api("/api/noiquy-overrides", {
      method: "DELETE",
      body: JSON.stringify({ period_id: state.currentPeriodId, names }),
    });
    state.selectedWorkRuleNames.clear();
    await loadWorkRuleOverrides();
    renderWorkRuleTable();
    showToast("Đã bỏ Không tính đi muộn.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

function renderAttendanceThead() {
  const headerCells = state.attendanceHeaders
    .map((h) => (h.trim() === "Team" ? `<th style="width:120px">${h}</th>` : `<th>${h}</th>`))
    .join("");
  el.attendanceThead.innerHTML = `
    <tr>
      <th style="width:36px"><input type="checkbox" id="attendance-select-all" /></th>
      ${headerCells}
      <th style="min-width:100px"></th>
    </tr>`;
  document.getElementById("attendance-select-all").addEventListener("change", (e) => {
    const visible = filteredAttendanceRecords();
    if (e.target.checked) {
      visible.forEach((r) => state.selectedAttendanceIds.add(r.id));
    } else {
      visible.forEach((r) => state.selectedAttendanceIds.delete(r.id));
    }
    renderAttendanceTable();
  });
}

function filteredAttendanceRecords() {
  const term = state.attendanceSearch.trim().toLowerCase();
  if (!term) return state.attendanceRecords;
  return state.attendanceRecords.filter((r) =>
    Object.values(r.row_data).some((v) => String(v ?? "").toLowerCase().includes(term)),
  );
}

function updateAttendanceSelectionUI() {
  const visible = filteredAttendanceRecords();
  const visibleSelectedCount = visible.filter((r) => state.selectedAttendanceIds.has(r.id)).length;
  el.deleteSelectedAttendanceBtn.hidden = state.selectedAttendanceIds.size === 0;
  el.markExcludedAttendanceBtn.hidden = state.selectedAttendanceIds.size === 0;
  el.unmarkExcludedAttendanceBtn.hidden = state.selectedAttendanceIds.size === 0;
  el.selectedAttendanceCount.textContent = String(state.selectedAttendanceIds.size);
  const selectAllEl = document.getElementById("attendance-select-all");
  if (selectAllEl) {
    selectAllEl.checked = visible.length > 0 && visibleSelectedCount === visible.length;
    selectAllEl.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visible.length;
  }
}

function renderAttendanceTable() {
  const visible = filteredAttendanceRecords();
  el.attendanceEmpty.hidden = visible.length > 0;
  const pageItems = attendancePagination.slice(visible);
  el.attendanceTbody.innerHTML = pageItems
    .map((r) => {
      const dataCells = state.attendanceHeaders.map((h) => `<td>${r.row_data[h] ?? ""}</td>`).join("");
      return `
    <tr data-id="${r.id}"${r.excluded_from_late ? ' class="attendance-row-excluded"' : ""}>
      <td><input type="checkbox" class="attendance-row-checkbox" ${state.selectedAttendanceIds.has(r.id) ? "checked" : ""} /></td>
      ${dataCells}
      <td><div class="actions-cell">
        <button class="small btn-delete delete-attendance-btn">Xóa</button>
      </div></td>
    </tr>`;
    })
    .join("");

  el.attendanceTbody.querySelectorAll(".attendance-row-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (e.target.checked) {
        state.selectedAttendanceIds.add(id);
      } else {
        state.selectedAttendanceIds.delete(id);
      }
      updateAttendanceSelectionUI();
    });
  });
  el.attendanceTbody.querySelectorAll(".delete-attendance-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (!await confirmDialog("Xóa dòng dữ liệu Chấm công này?")) return;
      try {
        await api(`/api/attendance-records/${id}`, { method: "DELETE" });
        state.selectedAttendanceIds.delete(id);
        await loadAttendanceRecords();
        showToast("Đã xóa dữ liệu Chấm công.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  updateAttendanceSelectionUI();
}

el.attendanceSearch.addEventListener("input", () => {
  state.attendanceSearch = el.attendanceSearch.value;
  attendancePagination.reset();
  renderAttendanceTable();
});

el.importAttendanceBtn.addEventListener("click", () => {
  if (!state.currentPeriodId) {
    showToast("Hãy chọn một tháng backlog trước.");
    return;
  }
  el.attendanceFileInput.click();
});

el.attendanceFileInput.addEventListener("change", async () => {
  const file = el.attendanceFileInput.files[0];
  el.attendanceFileInput.value = "";
  if (!file) return;
  try {
    const buffer = await file.arrayBuffer();
    const res = await fetch(`/api/attendance-records/import?period_id=${state.currentPeriodId}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: buffer,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Lỗi ${res.status}`);
    }
    const data = await res.json();
    state.attendanceHeaders = data.headers;
    state.attendanceRecords = data.rows;
    state.selectedAttendanceIds.clear();
    attendancePagination.reset();
    renderAttendanceThead();
    renderAttendanceTable();
    renderWorkRuleTable();
    showToast(`Đã nhập ${data.rows.length} dòng dữ liệu Chấm công.`, "success");
  } catch (err) {
    showToast(err.message);
  }
});

el.deleteSelectedAttendanceBtn.addEventListener("click", async () => {
  const ids = [...state.selectedAttendanceIds];
  if (ids.length === 0) return;
  if (!await confirmDialog(`Xóa ${ids.length} dòng dữ liệu Chấm công đã chọn?`)) return;
  try {
    await api("/api/attendance-records/delete-selected", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    state.selectedAttendanceIds.clear();
    await loadAttendanceRecords();
    showToast(`Đã xóa ${ids.length} dòng dữ liệu Chấm công.`, "success");
  } catch (err) {
    showToast(err.message);
  }
});

el.markExcludedAttendanceBtn.addEventListener("click", async () => {
  const ids = [...state.selectedAttendanceIds];
  if (ids.length === 0) return;
  if (!await confirmDialog(`Đánh dấu "Không tính đi muộn" cho ${ids.length} dòng đã chọn? Các dòng này sẽ không được tính vào Lượt đi muộn ở tab Nội quy.`, { danger: false })) return;
  try {
    await api("/api/attendance-records/mark-excluded", {
      method: "POST",
      body: JSON.stringify({ ids, excluded: true }),
    });
    state.selectedAttendanceIds.clear();
    await loadAttendanceRecords();
    showToast(`Đã đánh dấu Không tính đi muộn cho ${ids.length} dòng.`, "success");
  } catch (err) {
    showToast(err.message);
  }
});

el.unmarkExcludedAttendanceBtn.addEventListener("click", async () => {
  const ids = [...state.selectedAttendanceIds];
  if (ids.length === 0) return;
  if (!await confirmDialog(`Bỏ "Không tính đi muộn" cho ${ids.length} dòng đã chọn? Các dòng này sẽ tính lại vào Lượt đi muộn ở tab Nội quy.`, { danger: false })) return;
  try {
    await api("/api/attendance-records/mark-excluded", {
      method: "POST",
      body: JSON.stringify({ ids, excluded: false }),
    });
    state.selectedAttendanceIds.clear();
    await loadAttendanceRecords();
    showToast(`Đã bỏ Không tính đi muộn cho ${ids.length} dòng.`, "success");
  } catch (err) {
    showToast(err.message);
  }
});

// -- Hỗ trợ ticket --

async function loadTickets() {
  state.tickets = await api("/api/tickets");
  renderTickets();
}

function renderTickets() {
  el.ticketEmpty.hidden = state.tickets.length > 0;
  const pageItems = ticketPagination.slice(state.tickets);
  el.ticketTbody.innerHTML = pageItems
    .map(
      (t) => `
    <tr data-id="${t.id}">
      <td>${t.period_label}</td>
      <td>${t.team_name}</td>
      <td>${t.tong_ticket}</td>
      <td>${t.ticket_vuot}</td>
      <td>${t.dung_han}</td>
      <td>${formatPercent(t.ty_le)}</td>
      <td><div class="actions-cell">
        <button class="small btn-edit write-action edit-ticket-btn">Sửa</button>
        <button class="small btn-delete delete-ticket-btn">Xóa</button>
      </div></td>
    </tr>`,
    )
    .join("");

  el.ticketTbody.querySelectorAll(".edit-ticket-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openTicketDialog(state.tickets.find((t) => t.id === id));
    });
  });
  el.ticketTbody.querySelectorAll(".delete-ticket-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (!await confirmDialog("Xóa dữ liệu ticket này?")) return;
      try {
        await api(`/api/tickets/${id}`, { method: "DELETE" });
        await loadTickets();
        showToast("Đã xóa dữ liệu ticket.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

function openTicketDialog(ticket) {
  el.ticketForm.reset();
  document.getElementById("tk-id").value = ticket?.id ?? "";
  el.ticketDialogTitle.textContent = ticket ? "Sửa dữ liệu ticket" : "Thêm dữ liệu ticket";
  const periodSelectEl = document.getElementById("tk-period");
  periodSelectEl.innerHTML = periodOptionsHtml();
  periodSelectEl.value = String(ticket?.period_id ?? state.currentPeriodId ?? state.periods[0]?.id ?? "");
  const teamSelectEl = document.getElementById("tk-team");
  teamSelectEl.innerHTML = teamOptionsHtml();
  teamSelectEl.value = String(ticket?.team_id ?? state.currentTeamId ?? state.teams[0]?.id ?? "");
  document.getElementById("tk-tong").value = ticket?.tong_ticket ?? 0;
  document.getElementById("tk-vuot").value = ticket?.ticket_vuot ?? 0;
  document.getElementById("tk-dung-han").value = ticket?.dung_han ?? 0;
  el.ticketDialog.showModal();
}

el.addTicketBtn.addEventListener("click", () => {
  if (state.teams.length === 0) {
    showToast("Hãy khai báo ít nhất một team trước.");
    return;
  }
  if (state.periods.length === 0) {
    showToast("Hãy tạo ít nhất một tháng backlog trước.");
    return;
  }
  openTicketDialog(null);
});
el.ticketCancelBtn.addEventListener("click", () => el.ticketDialog.close());
el.ticketForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("tk-id").value;
  const payload = {
    period_id: Number(document.getElementById("tk-period").value),
    team_id: Number(document.getElementById("tk-team").value),
    tong_ticket: Number(document.getElementById("tk-tong").value) || 0,
    ticket_vuot: Number(document.getElementById("tk-vuot").value) || 0,
    dung_han: Number(document.getElementById("tk-dung-han").value) || 0,
  };
  try {
    if (id) {
      await api(`/api/tickets/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      el.ticketDialog.close();
      await loadTickets();
      showToast("Đã cập nhật dữ liệu ticket.", "success");
    } else {
      await api("/api/tickets", { method: "POST", body: JSON.stringify(payload) });
      el.ticketDialog.close();
      await loadTickets();
      showToast("Đã thêm dữ liệu ticket.", "success");
    }
  } catch (err) {
    showToast(err.message);
  }
});

// -- Tỉ lệ khởi tạo --

async function loadCreationRates() {
  state.creationRates = await api("/api/creation-rates");
  renderCreationRates();
}

function renderCreationRates() {
  el.creationRateEmpty.hidden = state.creationRates.length > 0;
  const pageItems = creationRatePagination.slice(state.creationRates);
  el.creationRateTbody.innerHTML = pageItems
    .map(
      (r) => `
    <tr data-id="${r.id}">
      <td>${r.period_label}</td>
      <td>${r.team_name}</td>
      <td>${r.so_luong_thanh_cong}</td>
      <td>${r.so_luong_that_bai}</td>
      <td>${r.total}</td>
      <td>${formatPercent(r.grand_total)}</td>
      <td><div class="actions-cell">
        <button class="small btn-edit write-action edit-creation-rate-btn">Sửa</button>
        <button class="small btn-delete delete-creation-rate-btn">Xóa</button>
      </div></td>
    </tr>`,
    )
    .join("");

  el.creationRateTbody.querySelectorAll(".edit-creation-rate-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openCreationRateDialog(state.creationRates.find((r) => r.id === id));
    });
  });
  el.creationRateTbody.querySelectorAll(".delete-creation-rate-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (!await confirmDialog("Xóa dữ liệu này?")) return;
      try {
        await api(`/api/creation-rates/${id}`, { method: "DELETE" });
        await loadCreationRates();
        showToast("Đã xóa dữ liệu tỉ lệ khởi tạo.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

function openCreationRateDialog(rate) {
  el.creationRateForm.reset();
  document.getElementById("cr-id").value = rate?.id ?? "";
  el.creationRateDialogTitle.textContent = rate ? "Sửa tỉ lệ khởi tạo" : "Thêm tỉ lệ khởi tạo";
  const periodSelectEl = document.getElementById("cr-period");
  periodSelectEl.innerHTML = periodOptionsHtml();
  periodSelectEl.value = String(rate?.period_id ?? state.currentPeriodId ?? state.periods[0]?.id ?? "");
  const teamSelectEl = document.getElementById("cr-team");
  teamSelectEl.innerHTML = teamOptionsHtml();
  teamSelectEl.value = String(rate?.team_id ?? state.currentTeamId ?? state.teams[0]?.id ?? "");
  document.getElementById("cr-thanh-cong").value = rate?.so_luong_thanh_cong ?? 0;
  document.getElementById("cr-that-bai").value = rate?.so_luong_that_bai ?? 0;
  el.creationRateDialog.showModal();
}

el.addCreationRateBtn.addEventListener("click", () => {
  if (state.teams.length === 0) {
    showToast("Hãy khai báo ít nhất một team trước.");
    return;
  }
  if (state.periods.length === 0) {
    showToast("Hãy tạo ít nhất một tháng backlog trước.");
    return;
  }
  openCreationRateDialog(null);
});
el.creationRateCancelBtn.addEventListener("click", () => el.creationRateDialog.close());
el.creationRateForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("cr-id").value;
  const payload = {
    period_id: Number(document.getElementById("cr-period").value),
    team_id: Number(document.getElementById("cr-team").value),
    so_luong_thanh_cong: Number(document.getElementById("cr-thanh-cong").value) || 0,
    so_luong_that_bai: Number(document.getElementById("cr-that-bai").value) || 0,
  };
  try {
    if (id) {
      await api(`/api/creation-rates/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      el.creationRateDialog.close();
      await loadCreationRates();
      showToast("Đã cập nhật dữ liệu tỉ lệ khởi tạo.", "success");
    } else {
      await api("/api/creation-rates", { method: "POST", body: JSON.stringify(payload) });
      el.creationRateDialog.close();
      await loadCreationRates();
      showToast("Đã thêm dữ liệu tỉ lệ khởi tạo.", "success");
    }
  } catch (err) {
    showToast(err.message);
  }
});

