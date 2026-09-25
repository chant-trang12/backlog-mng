// ---- Tasks ----

async function loadTasks() {
  if (!state.currentPeriodId) {
    state.tasksAll = [];
    state.tasks = [];
    renderTasks();
    renderTaskWarnings();
    syncHomeFromCurrentIfNeeded();
    return;
  }
  state.tasksAll = await api(`/api/periods/${state.currentPeriodId}/tasks?_=1${deptParam()}`);
  const taskIds = new Set(state.tasksAll.map((t) => t.id));
  state.selectedTaskIds.forEach((id) => {
    if (!taskIds.has(id)) state.selectedTaskIds.delete(id);
  });
  applyTaskFilters();
  renderTasks();
  renderTaskWarnings();
  syncHomeFromCurrentIfNeeded();
}

function renderEmpty() {
  el.taskTbody.innerHTML = "";
  el.emptyState.hidden = false;
}

function renderTasks() {
  el.emptyState.hidden = state.periods.length !== 0;
  // Phòng ban tính KPI theo task (không chia team) — ẩn cột Team (tiêu đề
  // đã ẩn ở applyDeptModeSidebarNav, ở đây ẩn từng ô + trừ colspan tương ứng).
  const hideTeamColumn = homeCachTinhKpiTheoTask();
  const colCount = hideTeamColumn ? 15 : 16;
  if (state.tasksAll.length === 0) {
    el.taskTbody.innerHTML = `<tr><td colspan="${colCount}" class="muted" style="text-align:center;padding:16px">Chưa có task nào trong tháng này.</td></tr>`;
    updateTaskSelectionUI();
    taskPagination.slice(state.tasks);
    return;
  }
  if (state.tasks.length === 0) {
    el.taskTbody.innerHTML = `<tr><td colspan="${colCount}" class="muted" style="text-align:center;padding:16px">Không có task nào khớp bộ lọc.</td></tr>`;
    updateTaskSelectionUI();
    taskPagination.slice(state.tasks);
    return;
  }

  const pageItems = taskPagination.slice(state.tasks);

  el.taskTbody.innerHTML = pageItems
    .map((t) => {
      const statusClass = STATUS_CLASS[t.trang_thai] || "status-default";
      return `
    <tr data-id="${t.id}">
      <td><input type="checkbox" class="task-row-checkbox" ${state.selectedTaskIds.has(t.id) ? "checked" : ""} /></td>
      <td>${t.stt}</td>
      <td>${t.tag ? `<span ${tagBadgeAttrs(t.tag)}>${t.tag}</span>` : ""}</td>
      <td>${renderNatureBadges(t.tinh_chat)}</td>
      <td ${hideTeamColumn ? "hidden" : ""}><span class="status-badge ${teamColorClass(t.team)}">${t.team}</span></td>
      <td>${t.nhiem_vu}</td>
      <td>${(t.dod ?? "").replace(/\n/g, "<br/>")}</td>
      <td>${formatDateDisplay(t.deadline)}</td>
      <td>
        <span class="progress-bar"><span style="width:${Math.min(100, Math.max(0, t.phan_tram_hoan_thanh))}%"></span></span>${t.phan_tram_hoan_thanh}%
      </td>
      <td><span class="status-badge ${statusClass}">${t.trang_thai}</span></td>
      <td>${t.dau_moi_phoi_hop ?? ""}</td>
      <td>${(t.tien_do ?? "").replace(/\n/g, "<br/>")}</td>
      <td>
        <div class="badge-group">
          ${t.khong_tinh_diem ? `<span class="status-badge tinh-chat-khong-tinh-diem">${t.khong_tinh_diem}</span>` : ""}
          ${t.da_chuyen_thang ? `<span class="status-badge tinh-chat-da-chuyen" title="Đã chuyển sang tháng sau, không thể chuyển tiếp">Đã chuyển</span>` : ""}
        </div>
      </td>
      <td style="position:relative">
        ${
          t.prev_cpo_danh_gia !== null
            ? `<span class="cell-prev-badge" title="Đánh giá gần nhất (tháng trước): ${t.prev_cpo_danh_gia}%${t.prev_cpo_graded_at ? " — " + fmtGradedAt(t.prev_cpo_graded_at) : ""}${t.prev_cpo_graded_by ? " · " + t.prev_cpo_graded_by : ""}">↩ ${t.prev_cpo_danh_gia}%</span>`
            : ""
        }
        ${t.cpo_danh_gia !== null ? t.cpo_danh_gia + "%" : ""}
        ${renderGradingHistory(t, "percent")}
      </td>
      <td>
        ${(t.cpo_comment ?? "").replace(/\n/g, "<br/>")}
        ${t.cpo_graded_at ? `<div class="cell-graded-at"><svg class="icon" aria-hidden="true"><use href="icons.svg#i-clock"/></svg>${fmtGradedAt(t.cpo_graded_at)}${t.cpo_graded_by ? " · " + t.cpo_graded_by : ""}</div>` : ""}
        ${renderGradingHistory(t, "content")}
      </td>
      <td><div class="actions-cell">
        <button class="small btn-edit write-action edit-btn">Sửa</button>
        <button class="small btn-delete delete-btn">Xóa</button>
        <button class="small btn-grade grade-btn">Chấm điểm</button>
        <button class="small btn-progress progress-btn">Cập nhật tiến độ</button>
        <button class="small btn-member member-btn" title="Quản lý nhân sự tham gia task này"><svg class="icon" aria-hidden="true"><use href="icons.svg#i-user"/></svg>Nhân sự${t.member_count ? ` (${t.member_count})` : ""}</button>
      </div></td>
    </tr>`;
    })
    .join("");

  el.taskTbody.querySelectorAll(".task-row-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (e.target.checked) {
        state.selectedTaskIds.add(id);
      } else {
        state.selectedTaskIds.delete(id);
      }
      updateTaskSelectionUI();
    });
  });
  el.taskTbody.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openTaskDialog(state.tasks.find((t) => t.id === id));
    });
  });
  el.taskTbody.querySelectorAll(".grade-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openGradeDialog(state.tasks.find((t) => t.id === id));
    });
  });
  el.taskTbody.querySelectorAll(".progress-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openProgressDialog(state.tasks.find((t) => t.id === id));
    });
  });
  el.taskTbody.querySelectorAll(".member-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openTaskMemberDialog(state.tasks.find((t) => t.id === id));
    });
  });
  el.taskTbody.querySelectorAll(".grade-hist-toggle").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const list = document.getElementById(btn.dataset.histTarget);
      const willOpen = list.hidden;
      // đóng các popover lịch sử khác
      el.taskTbody.querySelectorAll(".grade-history-list").forEach((l) => {
        if (l !== list) l.hidden = true;
      });
      el.taskTbody.querySelectorAll(".grade-hist-toggle").forEach((b) => b.classList.remove("open"));
      list.hidden = !willOpen;
      btn.classList.toggle("open", willOpen);
    });
  });
  el.taskTbody.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (!await confirmDialog("Xóa task này?")) return;
      try {
        await api(`/api/tasks/${id}`, { method: "DELETE" });
        state.selectedTaskIds.delete(id);
        await loadTasks();
        showToast("Đã xóa task.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  updateTaskSelectionUI();
  syncTaskStickyOffsets();
}

// 6 cột đầu (checkbox/STT/Tag/Phân loại/Team/Nhiệm vụ) của #task-table cố
// định khi cuộn ngang (xem CSS "left: var(--task-col2-left...)") — đo ĐÚNG
// width thật đã render của 5 cột đầu, giống syncMemberStickyOffsets() ở
// 03-members.js. Cột Team bị ẩn (hidden) ở phòng ban tính KPI theo task thì
// width đo được tự động là 0, nên các cột sau nó tự co lại đúng vị trí mà
// không cần code riêng cho từng cách tính KPI.
function syncTaskStickyOffsets() {
  const table = document.getElementById("task-table");
  const ths = table?.querySelectorAll("thead th");
  if (!table || !ths || ths.length < 6) return;
  let left = 0;
  const lefts = [];
  for (let i = 0; i < 5; i++) {
    left += ths[i].getBoundingClientRect().width;
    lefts.push(left);
  }
  table.style.setProperty("--task-col2-left", `${lefts[0]}px`);
  table.style.setProperty("--task-col3-left", `${lefts[1]}px`);
  table.style.setProperty("--task-col4-left", `${lefts[2]}px`);
  table.style.setProperty("--task-col5-left", `${lefts[3]}px`);
  table.style.setProperty("--task-col6-left", `${lefts[4]}px`);
}
window.addEventListener("resize", () => syncTaskStickyOffsets());

function updateTaskSelectionUI() {
  const visible = state.tasks;
  const visibleSelectedCount = visible.filter((t) => state.selectedTaskIds.has(t.id)).length;
  const count = state.selectedTaskIds.size;

  el.bulkActions.hidden = count === 0;
  el.selectedTaskCount.textContent = String(count);
  if (count === 0) closeBulkMenu();
  else updateBulkMenuItems();

  el.taskSelectAll.checked = visible.length > 0 && visibleSelectedCount === visible.length;
  el.taskSelectAll.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visible.length;
}

function selectedTasks() {
  return state.tasksAll.filter((t) => state.selectedTaskIds.has(t.id));
}

function taskHasNatureTon(t) {
  return (t.tinh_chat ?? "")
    .split(",")
    .map((s) => s.trim())
    .includes("Nhiệm vụ tồn");
}

// Luôn liệt kê đủ các thao tác trong menu (ổn định, dễ đoán); chỉ khóa
// (disabled) kèm tooltip khi thao tác không áp dụng cho lựa chọn hiện tại.
function updateBulkMenuItems() {
  const sel = selectedTasks();
  const anyMoved = sel.some((t) => t.da_chuyen_thang);
  const allNoScore = sel.length > 0 && sel.every((t) => t.khong_tinh_diem);
  const anyNoScore = sel.some((t) => t.khong_tinh_diem);
  const allTon = sel.length > 0 && sel.every(taskHasNatureTon);
  const anyTon = sel.some(taskHasNatureTon);

  const setItem = (action, { disabled = false, title = "" }) => {
    const item = el.bulkActionsMenu.querySelector(`[data-bulk-action="${action}"]`);
    if (!item) return;
    item.disabled = disabled;
    item.title = title;
  };

  setItem("move", {
    disabled: anyMoved,
    title: anyMoved
      ? "Trong lựa chọn có task đã được chuyển sang tháng sau — bỏ chọn task đó để tiếp tục."
      : "",
  });
  setItem("ton", {
    disabled: allTon,
    title: allTon ? 'Mọi task đã chọn đều đã có "Nhiệm vụ tồn".' : "",
  });
  setItem("unmark-ton", {
    disabled: !anyTon,
    title: !anyTon ? 'Không task nào đang "Nhiệm vụ tồn".' : "",
  });
  setItem("no-score", {
    disabled: allNoScore,
    title: allNoScore ? 'Mọi task đã chọn đều đã "Không tính điểm".' : "",
  });
  setItem("unmark-no-score", {
    disabled: !anyNoScore,
    title: !anyNoScore ? 'Không task nào đang "Không tính điểm".' : "",
  });
}

function openBulkMenu() {
  updateBulkMenuItems();
  el.bulkActionsMenu.hidden = false;
  el.bulkActionsBtn.setAttribute("aria-expanded", "true");
}

function closeBulkMenu() {
  el.bulkActionsMenu.hidden = true;
  el.bulkActionsBtn.setAttribute("aria-expanded", "false");
}

el.bulkActionsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (el.bulkActionsMenu.hidden) openBulkMenu();
  else closeBulkMenu();
});

document.addEventListener("click", (e) => {
  if (!el.bulkActions.hidden && !el.bulkActions.contains(e.target)) closeBulkMenu();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeBulkMenu();
});

el.bulkActionsMenu.addEventListener("click", async (e) => {
  const item = e.target.closest("[data-bulk-action]");
  if (!item || item.disabled) return;
  closeBulkMenu();
  const action = item.dataset.bulkAction;
  if (action === "move") await doMoveTasksToNextMonth();
  else if (action === "ton") await doMarkTasksTon();
  else if (action === "unmark-ton") await doUnmarkTasksTon();
  else if (action === "no-score") await doMarkTasksNoScore();
  else if (action === "unmark-no-score") await doUnmarkTasksNoScore();
  else if (action === "delete") await doDeleteTasks();
});

el.taskSelectAll.addEventListener("change", (e) => {
  if (e.target.checked) {
    state.tasks.forEach((t) => state.selectedTaskIds.add(t.id));
  } else {
    state.tasks.forEach((t) => state.selectedTaskIds.delete(t.id));
  }
  renderTasks();
});

async function doMoveTasksToNextMonth() {
  const ids = [...state.selectedTaskIds];
  if (ids.length === 0) return;
  if (
    !await confirmDialog(
      `Chuyển ${ids.length} task đã chọn sang tháng sau? Task sẽ được đánh dấu "Nhiệm vụ tồn".`,
      { danger: false },
    )
  ) {
    return;
  }
  try {
    const result = await api(`/api/periods/${state.currentPeriodId}/tasks/move-to-next-month`, {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    state.selectedTaskIds.clear();
    await loadPeriods();
    const skippedCount = result.skippedAlreadyMoved?.length ?? 0;
    const skippedNote = skippedCount > 0 ? ` (bỏ qua ${skippedCount} task đã chuyển trước đó)` : "";
    showToast(`Đã chuyển ${result.moved.length} task sang ${result.targetPeriod.label}.${skippedNote}`, "success");
  } catch (err) {
    showToast(err.message);
  }
}

async function doMarkTasksNoScore() {
  const ids = [...state.selectedTaskIds];
  if (ids.length === 0) return;
  if (!await confirmDialog(`Đánh dấu "Không tính điểm" cho ${ids.length} task đã chọn?`, { danger: false })) return;
  try {
    await api("/api/tasks/mark-no-score", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    state.selectedTaskIds.clear();
    await loadTasks();
    showToast(`Đã đánh dấu "Không tính điểm" cho ${ids.length} task.`, "success");
  } catch (err) {
    showToast(err.message);
  }
}

async function doUnmarkTasksNoScore() {
  const ids = [...state.selectedTaskIds];
  if (ids.length === 0) return;
  if (!await confirmDialog(`Bỏ đánh dấu "Không tính điểm" cho ${ids.length} task đã chọn?`, { danger: false })) return;
  try {
    await api("/api/tasks/unmark-no-score", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    state.selectedTaskIds.clear();
    await loadTasks();
    showToast(`Đã bỏ đánh dấu "Không tính điểm" cho ${ids.length} task.`, "success");
  } catch (err) {
    showToast(err.message);
  }
}

async function doDeleteTasks() {
  const ids = [...state.selectedTaskIds];
  if (ids.length === 0) return;
  if (!await confirmDialog(`Xóa vĩnh viễn ${ids.length} task đã chọn? Không thể hoàn tác.`)) return;
  try {
    await api("/api/tasks/delete-selected", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    state.selectedTaskIds.clear();
    await loadTasks();
    showToast(`Đã xóa ${ids.length} task.`, "success");
  } catch (err) {
    showToast(err.message);
  }
}

async function doMarkTasksTon() {
  const ids = [...state.selectedTaskIds];
  if (ids.length === 0) return;
  if (
    !await confirmDialog(
      `Đánh dấu "Nhiệm vụ tồn" cho ${ids.length} task đã chọn? Task sẽ được gắn Tính chất "Nhiệm vụ tồn" và Không tính điểm.`,
      { danger: false },
    )
  ) {
    return;
  }
  try {
    await api("/api/tasks/mark-ton", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    state.selectedTaskIds.clear();
    await loadTasks();
    showToast(`Đã đánh dấu "Nhiệm vụ tồn" cho ${ids.length} task.`, "success");
  } catch (err) {
    showToast(err.message);
  }
}

async function doUnmarkTasksTon() {
  const ids = [...state.selectedTaskIds];
  if (ids.length === 0) return;
  if (
    !await confirmDialog(
      `Bỏ đánh dấu "Nhiệm vụ tồn" cho ${ids.length} task đã chọn? Task sẽ bỏ Tính chất "Nhiệm vụ tồn" và bỏ Không tính điểm.`,
      { danger: false },
    )
  ) {
    return;
  }
  try {
    await api("/api/tasks/unmark-ton", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    state.selectedTaskIds.clear();
    await loadTasks();
    showToast(`Đã bỏ đánh dấu "Nhiệm vụ tồn" cho ${ids.length} task.`, "success");
  } catch (err) {
    showToast(err.message);
  }
}

// ---- Task dialog (create / update — dùng chung cho nhập mới và cập nhật tiến độ) ----

const teamSelect = document.getElementById("f-team");

function setNatureValue(value) {
  const selected = new Set(
    (value ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  );
  document.querySelectorAll('#f-tinh-chat-group input[type="checkbox"]').forEach((cb) => {
    cb.checked = selected.has(cb.value);
  });
}

function getNatureValue() {
  return [...document.querySelectorAll('#f-tinh-chat-group input[type="checkbox"]:checked')]
    .map((cb) => cb.value)
    .join(", ");
}

// "Nhiệm vụ tồn" là giá trị hệ thống (tự gắn khi chuyển task sang tháng
// sau), không có checkbox trong dialog Sửa — nếu task đang có sẵn, giữ lại
// nguyên khi lưu, không để form (chỉ biết các Phân loại quản lý được) xoá mất.
let editingTaskHasTon = false;

function openTaskDialog(task) {
  el.taskForm.reset();
  document.getElementById("task-id").value = task?.id ?? "";
  el.taskDialogTitle.textContent = task ? `Sửa task #${task.stt}` : "Nhập task mới";
  editingTaskHasTon = task ? taskHasNatureTon(task) : false;

  teamSelect.innerHTML = state.teams
    .map((t) => `<option value="${t.name}">${t.name}</option>`)
    .join("");
  const chosenTeam = task?.team || state.taskFilters.team || state.currentTeam || state.teams[0]?.name || "";
  teamSelect.value = chosenTeam;

  const tagSelect = document.getElementById("f-tag");
  tagSelect.innerHTML =
    `<option value="">-- Không chọn --</option>` +
    state.tags.map((t) => `<option value="${t.ten_tag}">${t.ten_tag}</option>`).join("");
  tagSelect.value = task?.tag ?? "";

  document.getElementById("f-tinh-chat-group").innerHTML = state.categoryOptions
    .map((p) => `<label class="checkbox-option"><input type="checkbox" value="${p.ten_phan_loai}" /> ${p.ten_phan_loai}</label>`)
    .join("");
  setNatureValue(task?.tinh_chat ?? "");
  document.getElementById("f-nhiem-vu").value = task?.nhiem_vu ?? "";
  document.getElementById("f-dod").value = task?.dod ?? "";
  document.getElementById("f-deadline").value = formatDateInput(task?.deadline);
  document.getElementById("f-dau-moi-phoi-hop").value = task?.dau_moi_phoi_hop ?? "";
  el.taskDialog.showModal();
}

el.addTaskBtn.addEventListener("click", () => {
  if (!state.currentPeriodId) {
    showToast("Hãy tạo một tháng backlog trước.");
    return;
  }
  if (state.teams.length === 0) {
    showToast("Hãy khai báo ít nhất một team trước khi nhập task.");
    return;
  }
  openTaskDialog(null);
});

el.cancelBtn.addEventListener("click", () => el.taskDialog.close());

el.taskForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("task-id").value;
  let nature = getNatureValue();
  if (editingTaskHasTon) {
    const items = nature.split(",").map((v) => v.trim()).filter(Boolean);
    if (!items.includes("Nhiệm vụ tồn")) items.push("Nhiệm vụ tồn");
    nature = items.join(", ");
  }
  const payload = {
    team: document.getElementById("f-team").value.trim(),
    tinh_chat: nature || undefined,
    tag: document.getElementById("f-tag").value || undefined,
    nhiem_vu: document.getElementById("f-nhiem-vu").value.trim(),
    dod: document.getElementById("f-dod").value.trim() || undefined,
    deadline: document.getElementById("f-deadline").value || undefined,
    dau_moi_phoi_hop: document.getElementById("f-dau-moi-phoi-hop").value.trim() || undefined,
  };

  try {
    if (id) {
      await api(`/api/tasks/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      el.taskDialog.close();
      await loadTasks();
      showToast("Đã cập nhật task.", "success");
    } else {
      await api(`/api/periods/${state.currentPeriodId}/tasks`, {
        method: "POST",
        body: JSON.stringify({ ...payload, department_id: state.currentDepartmentId ?? undefined }),
      });
      el.taskDialog.close();
      await loadTasks();
      showToast("Đã thêm task mới.", "success");
    }
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Chấm điểm (% Đánh giá, Nội dung đánh giá) ----

function openGradeDialog(task) {
  el.gradeForm.reset();
  document.getElementById("grade-task-id").value = task?.id ?? "";
  document.getElementById("grade-percent").value = task?.cpo_danh_gia ?? "";
  document.getElementById("grade-comment").value = task?.cpo_comment ?? "";
  el.gradeDialog.showModal();
}

el.gradeCancelBtn.addEventListener("click", () => el.gradeDialog.close());

el.gradeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("grade-task-id").value;
  const percentValue = document.getElementById("grade-percent").value;
  const payload = {
    cpo_danh_gia: percentValue ? Number(percentValue) : undefined,
    cpo_comment: document.getElementById("grade-comment").value.trim() || undefined,
  };

  try {
    await api(`/api/tasks/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    el.gradeDialog.close();
    await loadTasks();
    showToast("Đã lưu chấm điểm.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Cập nhật tiến độ (% Hoàn thành, Trạng thái, Tiến độ) ----
// Tách riêng khỏi dialog Sửa: đây là cập nhật định kỳ trong lúc làm việc,
// không đụng tới nội dung task (Team/Tag/Phân loại/Nhiệm vụ/DoD/Deadline).

function openProgressDialog(task) {
  el.progressForm.reset();
  document.getElementById("progress-task-id").value = task?.id ?? "";
  document.getElementById("progress-phan-tram").value = task?.phan_tram_hoan_thanh ?? 0;
  document.getElementById("progress-trang-thai").value = task?.trang_thai ?? "Chưa thực hiện";
  document.getElementById("progress-tien-do").value = task?.tien_do ?? "";
  el.progressDialog.showModal();
}

el.progressCancelBtn.addEventListener("click", () => el.progressDialog.close());

el.progressForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("progress-task-id").value;
  const payload = {
    phan_tram_hoan_thanh: Number(document.getElementById("progress-phan-tram").value) || 0,
    trang_thai: document.getElementById("progress-trang-thai").value,
    tien_do: document.getElementById("progress-tien-do").value.trim() || undefined,
  };

  try {
    await api(`/api/tasks/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    el.progressDialog.close();
    await loadTasks();
    showToast("Đã cập nhật tiến độ.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Nhân sự tham gia task (quản lý sâu hơn: ai làm task này, vai trò gì —
// VD 1 task dự án phần mềm có SM, PO, Dev, QA cùng tham gia) ----

async function openTaskMemberDialog(task) {
  if (!task) return;
  state.taskMemberTaskId = task.id;
  // % Đánh giá của task (cpo_danh_gia) — có giá trị thì mới hiện phần phân
  // bổ tỷ lệ đóng góp/điểm cá nhân, task chưa chấm điểm thì chưa có gì để
  // quy đổi.
  state.taskMemberTaskScore = task.cpo_danh_gia;
  const graded = state.taskMemberTaskScore != null;
  el.taskMemberDialogTitle.textContent = `Nhân sự tham gia: ${task.nhiem_vu}`;
  el.taskMemberDialogTeam.textContent = `Team ${task.team}`;
  el.taskMemberScoreRow.hidden = !graded;
  el.taskMemberScoreBadge.textContent = graded ? `% Đánh giá: ${state.taskMemberTaskScore}%` : "";
  state.taskMemberScoreUnit = "percent";
  el.tmScoreUnit.value = "percent";
  // Tạm bỏ lựa chọn "Thang điểm 5" ở Đơn vị điểm cá nhân cho mọi phòng ban
  // (trước đây chỉ ẩn với phòng tính KPI theo task, nay bỏ luôn với phòng
  // tính KPI theo team để tránh nhầm đơn vị).
  const scale5Option = document.getElementById("tm-score-unit-scale5");
  if (scale5Option) scale5Option.hidden = true;
  fillTaskMemberCategorySelect();
  renderTaskMemberThead();
  await loadTaskMembers();
  el.taskMemberDialog.showModal();
}

function fillTaskMemberCategorySelect() {
  el.tmCategory.innerHTML =
    `<option value="">— Không —</option>` +
    state.memberParticipationOptions.map((p) => `<option value="${p.ten_phan_loai}">${p.ten_phan_loai}</option>`).join("");
}

function renderTaskMemberThead() {
  const graded = state.taskMemberTaskScore != null;
  el.taskMemberThead.innerHTML = `<tr>
    <th style="width:190px">Nhân sự</th>
    <th style="width:190px">Vai trò</th>
    <th style="width:150px">Phân loại</th>
    ${graded ? '<th style="width:120px">Tỷ lệ đóng góp (%)</th><th style="width:140px">Điểm cá nhân</th>' : ""}
    <th style="width:190px">Ghi chú</th>
    <th style="width:56px"></th>
  </tr>`;
}

// Chọn nhân sự từ danh sách nhân sự đã khai báo của tháng đang xem (giống
// nguồn dữ liệu ở trang Team & Nhân sự) — bớt các nhân sự đã gán vào task
// này rồi (1 người chỉ tham gia 1 lần / task, "vai trò" hiển thị ở bảng bên
// trên lấy thẳng theo Chức vụ có sẵn của người đó, không chọn riêng ở đây).
// Gợi ý gõ tìm tự vẽ bằng div (không dùng <input list> + <datalist>) vì bên
// trong <dialog>, Chrome định vị popup gợi ý của datalist sai chỗ (bung ra
// góc màn hình thay vì ngay dưới ô nhập) — lỗi UI gốc trình duyệt, không
// sửa được bằng CSS.
function fillTaskMemberSelect() {
  const assignedIds = new Set(state.taskMembers.map((tm) => tm.member_id));
  state.taskMemberAvailable = state.members.filter((m) => !assignedIds.has(m.id));
  state.taskMemberSelectedId = null;
  el.tmMember.value = "";
  el.tmMember.disabled = state.taskMemberAvailable.length === 0;
  el.tmMember.placeholder = state.taskMemberAvailable.length > 0 ? "Gõ tên để tìm..." : "Đã gán hết nhân sự";
  hideTaskMemberSuggestions();
}

function taskMemberLabel(m) {
  return `${m.name}${m.team_name ? " (" + m.team_name + ")" : ""}`;
}

function hideTaskMemberSuggestions() {
  el.tmMemberSuggestions.hidden = true;
}

function renderTaskMemberSuggestions() {
  const q = el.tmMember.value.trim().toLowerCase();
  const matches = state.taskMemberAvailable.filter((m) => !q || taskMemberLabel(m).toLowerCase().includes(q));
  el.tmMemberSuggestions.innerHTML = matches.length
    ? matches
        .slice(0, 30)
        .map((m) => `<div class="tm-suggest-item" data-id="${m.id}">${taskMemberLabel(m)}</div>`)
        .join("")
    : `<div class="tm-suggest-empty">Không tìm thấy nhân sự phù hợp.</div>`;
  el.tmMemberSuggestions.hidden = false;

  el.tmMemberSuggestions.querySelectorAll(".tm-suggest-item").forEach((item) => {
    // mousedown (không phải click) để chạy TRƯỚC sự kiện blur của input —
    // giữ được lựa chọn thay vì bị ẩn gợi ý mất trước khi kịp xử lý.
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const id = Number(item.dataset.id);
      const m = state.taskMemberAvailable.find((x) => x.id === id);
      el.tmMember.value = m ? taskMemberLabel(m) : "";
      state.taskMemberSelectedId = id;
      hideTaskMemberSuggestions();
    });
  });
}

el.tmMember.addEventListener("input", () => {
  state.taskMemberSelectedId = null; // sửa lại chữ thì phải chọn lại từ gợi ý
  if (!el.tmMember.disabled) renderTaskMemberSuggestions();
});
el.tmMember.addEventListener("focus", () => {
  if (!el.tmMember.disabled) renderTaskMemberSuggestions();
});
el.tmMember.addEventListener("blur", () => hideTaskMemberSuggestions());

async function loadTaskMembers() {
  if (!state.taskMemberTaskId) return;
  state.taskMembers = await api(`/api/tasks/${state.taskMemberTaskId}/members`);
  renderTaskMembers();
  fillTaskMemberSelect();
}

const round2 = (n) => Math.round(n * 100) / 100;
const percentToScale5 = (p) => round2(p / 20);
const scale5ToPercent = (s) => round2(s * 20);

function renderTaskMembers() {
  const graded = state.taskMemberTaskScore != null;
  el.taskMemberEmpty.hidden = state.taskMembers.length > 0;
  el.taskMemberScoreRow.hidden = !graded;
  el.taskMemberUnitRow.hidden = !graded;
  el.taskMemberTotalRow.hidden = !graded;
  const unit = state.taskMemberScoreUnit;

  el.taskMemberTbody.innerHTML = state.taskMembers
    .map((tm) => {
      let scoreCell = "";
      if (graded) {
        const contrib = tm.ty_le_dong_gop != null ? Number(tm.ty_le_dong_gop) : null;
        // Công thức tự tính (áp dụng mọi phòng ban, không phân biệt
        // theo_team/theo_task nữa — khớp đúng công thức đã dùng ở "Điểm cá
        // nhân (Tính theo task)"/tong_diem, xem taskMember.service.ts):
        // task "Hỗ trợ" nhân Tỷ lệ đóng góp; "Thực hiện chính" (hoặc chưa
        // phân loại) thì thẳng % Đánh giá, KHÔNG nhân Tỷ lệ đóng góp — tránh
        // task nhiều người chia sẻ (tỷ lệ thấp) bị kéo điểm xuống so với
        // task 1 người làm trọn (100%) dù % Đánh giá như nhau.
        const auto =
          tm.phan_loai === HO_TRO_LABEL
            ? contrib != null
              ? round2((state.taskMemberTaskScore * contrib) / 100)
              : null
            : state.taskMemberTaskScore;
        const isManual = tm.diem_ca_nhan != null;
        const rawPercent = isManual ? Number(tm.diem_ca_nhan) : auto;
        const displayScore = rawPercent == null ? "" : unit === "scale5" ? percentToScale5(rawPercent) : rawPercent;
        const autoTitle =
          tm.phan_loai === HO_TRO_LABEL
            ? "Tự tính (Hỗ trợ) = % Đánh giá của task × Tỷ lệ đóng góp"
            : "Tự tính (Thực hiện chính) = thẳng % Đánh giá của task, không nhân Tỷ lệ đóng góp";
        scoreCell = `
      <td><input type="number" class="inline-cell-input tm-contrib-input" data-id="${tm.id}" min="0" max="100" step="0.1" value="${contrib ?? ""}" placeholder="—" style="width:76px" /></td>
      <td>
        <div class="row" style="align-items:center;gap:4px;flex-wrap:nowrap">
          <input type="number" class="inline-cell-input tm-score-input" data-id="${tm.id}" step="0.1" value="${displayScore}" placeholder="—" style="width:64px" />
          ${
            isManual
              ? `<span class="pill-x tm-score-reset" data-id="${tm.id}" title="Xóa điểm nhập tay, về tự tính theo %">↺</span>`
              : `<span class="muted" style="font-size:0.68rem;white-space:nowrap" title="${autoTitle}">(tự tính)</span>`
          }
        </div>
      </td>`;
      }
      const categoryOptions =
        `<option value="">— Không —</option>` +
        state.memberParticipationOptions
          .map((p) => `<option value="${p.ten_phan_loai}"${p.ten_phan_loai === tm.phan_loai ? " selected" : ""}>${p.ten_phan_loai}</option>`)
          .join("");
      return `
    <tr data-id="${tm.id}">
      <td>${tm.member_name}</td>
      <td>${tm.member_chuc_vu ?? ""}</td>
      <td>
        <select class="tm-phanloai-select inline-cell-input ${memberParticipationColorClass(tm.phan_loai)}" data-id="${tm.id}" style="border:none;font-weight:600">${categoryOptions}</select>
      </td>
      ${scoreCell}
      <td>${tm.ghi_chu ?? ""}</td>
      <td><button type="button" class="small btn-delete tm-del-btn" data-id="${tm.id}" title="Bỏ khỏi task">×</button></td>
    </tr>`;
    })
    .join("");

  el.taskMemberTbody.querySelectorAll(".tm-del-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!(await confirmDialog("Bỏ nhân sự này khỏi task?", { danger: false }))) return;
      try {
        await api(`/api/task-members/${btn.dataset.id}`, { method: "DELETE" });
        await loadTaskMembers();
        await loadTasks(); // cập nhật lại số đếm ở nút "Nhân sự (N)"
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  el.taskMemberTbody.querySelectorAll(".tm-phanloai-select").forEach((select) => {
    select.addEventListener("change", async () => {
      try {
        await api(`/api/task-members/${select.dataset.id}`, {
          method: "PUT",
          body: JSON.stringify({ phan_loai: select.value || null }),
        });
        await loadTaskMembers();
      } catch (err) {
        showToast(err.message);
        await loadTaskMembers();
      }
    });
  });

  if (graded) {
    el.taskMemberTbody.querySelectorAll(".tm-contrib-input").forEach((input) => {
      input.addEventListener("change", async () => {
        const val = input.value.trim();
        try {
          await api(`/api/task-members/${input.dataset.id}`, {
            method: "PUT",
            body: JSON.stringify({ ty_le_dong_gop: val === "" ? null : Number(val) }),
          });
          await loadTaskMembers();
        } catch (err) {
          showToast(err.message);
          await loadTaskMembers(); // trả input về giá trị đã lưu (request bị từ chối)
        }
      });
    });
    el.taskMemberTbody.querySelectorAll(".tm-score-input").forEach((input) => {
      input.addEventListener("change", async () => {
        const val = input.value.trim();
        const percentValue = val === "" ? null : state.taskMemberScoreUnit === "scale5" ? scale5ToPercent(Number(val)) : Number(val);
        try {
          await api(`/api/task-members/${input.dataset.id}`, {
            method: "PUT",
            body: JSON.stringify({ diem_ca_nhan: percentValue }),
          });
          await loadTaskMembers();
        } catch (err) {
          showToast(err.message);
          await loadTaskMembers();
        }
      });
    });
    el.taskMemberTbody.querySelectorAll(".tm-score-reset").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await api(`/api/task-members/${btn.dataset.id}`, {
            method: "PUT",
            body: JSON.stringify({ diem_ca_nhan: null }),
          });
          await loadTaskMembers();
        } catch (err) {
          showToast(err.message);
        }
      });
    });
  }

  updateTaskMemberTotalBadge();
}

function updateTaskMemberTotalBadge() {
  if (state.taskMemberTaskScore == null) {
    el.taskMemberTotalBadge.textContent = ""; // task chưa chấm điểm — không để lại nội dung cũ
    return;
  }
  const total = round2(
    state.taskMembers.reduce((s, tm) => s + (tm.ty_le_dong_gop != null ? Number(tm.ty_le_dong_gop) : 0), 0),
  );
  el.taskMemberTotalBadge.textContent = `Tổng đã phân bổ: ${total}% / 100%`;
  el.taskMemberTotalBadge.className =
    "status-badge " + (Math.abs(total - 100) < 0.01 ? "status-hoan-thanh" : total > 100 ? "status-huy" : "status-default");
}

el.tmScoreUnit.addEventListener("change", () => {
  state.taskMemberScoreUnit = el.tmScoreUnit.value;
  renderTaskMembers();
});

// Chia đều tỷ lệ đóng góp cho tất cả nhân sự đang có trong task (làm tròn 1
// chữ số thập phân, dồn phần dư vào người cuối để tổng luôn đúng 100%). Áp
// dụng giảm trước/tăng sau để tổng không bao giờ tạm thời vượt quá 100% khi
// đang lưu tuần tự từng dòng (backend chặn cứng > 100%).
// Nhân sự "Hỗ trợ" mặc định 10% (vẫn sửa lại được sau) — phần còn lại
// (100% - tổng % của các "Hỗ trợ") mới chia đều cho các nhân sự còn lại
// (Thực hiện chính hoặc chưa phân loại). Nếu số "Hỗ trợ" quá nhiều (>10
// người, vượt 100% nếu giữ nguyên 10%/người) thì co lại đều nhau cho vừa
// 100%, tránh chặn cứng ở backend khi lưu.
const HO_TRO_LABEL = "Hỗ trợ";
const HO_TRO_DEFAULT_PERCENT = 10;

el.tmSplitEvenBtn.addEventListener("click", async () => {
  const members = state.taskMembers;
  if (members.length === 0) return;

  const supportMembers = members.filter((tm) => tm.phan_loai === HO_TRO_LABEL);
  const mainMembers = members.filter((tm) => tm.phan_loai !== HO_TRO_LABEL);

  const perSupport =
    supportMembers.length * HO_TRO_DEFAULT_PERCENT > 100
      ? round2(100 / supportMembers.length)
      : HO_TRO_DEFAULT_PERCENT;
  const supportTotal = round2(perSupport * supportMembers.length);
  const remaining = Math.max(0, round2(100 - supportTotal));

  let mainValues = [];
  if (mainMembers.length > 0) {
    const base = Math.floor((remaining / mainMembers.length) * 10) / 10;
    mainValues = new Array(mainMembers.length).fill(base);
    mainValues[mainValues.length - 1] = round2(base + round2(remaining - base * mainMembers.length));
  }

  const updates = [
    ...supportMembers.map((tm) => ({
      id: tm.id,
      newVal: perSupport,
      delta: perSupport - (tm.ty_le_dong_gop != null ? Number(tm.ty_le_dong_gop) : 0),
    })),
    ...mainMembers.map((tm, i) => ({
      id: tm.id,
      newVal: mainValues[i],
      delta: mainValues[i] - (tm.ty_le_dong_gop != null ? Number(tm.ty_le_dong_gop) : 0),
    })),
  ].sort((a, b) => a.delta - b.delta); // giảm trước, tăng sau — tránh tổng tạm thời vượt 100%

  try {
    for (const u of updates) {
      await api(`/api/task-members/${u.id}`, {
        method: "PUT",
        body: JSON.stringify({ ty_le_dong_gop: u.newVal }),
      });
    }
    await loadTaskMembers();
    showToast("Đã chia đều tỷ lệ đóng góp.", "success");
  } catch (err) {
    showToast(err.message);
    await loadTaskMembers();
  }
});

el.tmAddBtn.addEventListener("click", async () => {
  const memberId = state.taskMemberSelectedId;
  if (!memberId) {
    showToast("Gõ tên và chọn đúng 1 nhân sự trong danh sách gợi ý.");
    return;
  }
  try {
    await api(`/api/tasks/${state.taskMemberTaskId}/members`, {
      method: "POST",
      body: JSON.stringify({
        member_id: memberId,
        phan_loai: el.tmCategory.value || undefined,
        ghi_chu: el.tmNote.value.trim() || undefined,
      }),
    });
    el.tmNote.value = "";
    el.tmCategory.value = "";
    await loadTaskMembers();
    await loadTasks();
    showToast("Đã thêm nhân sự.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

el.taskMemberCloseBtn.addEventListener("click", () => el.taskMemberDialog.close());

// ---- Export ----

el.exportBtn.addEventListener("click", () => {
  if (!state.currentPeriodId) {
    showToast("Hãy chọn một tháng backlog trước.");
    return;
  }
  const query = state.taskFilters.team
    ? `?team=${encodeURIComponent(state.taskFilters.team)}`
    : "";
  window.location.href = `/api/periods/${state.currentPeriodId}/tasks/export${query}`;
});

