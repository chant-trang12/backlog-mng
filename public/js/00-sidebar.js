// ---- Sidebar thu gọn chỉ còn icon ----
// Nạp trong <head> (trước khi vẽ trang) để đặt class ngay, không nháy.
// Trạng thái nhớ theo trình duyệt (localStorage). Khi thu gọn, mỗi mục menu
// có title = tên mục để rê chuột vẫn đọc được.
(function () {
  const KEY = "sidebar-collapsed";
  const root = document.documentElement;
  try {
    if (localStorage.getItem(KEY) === "1") root.classList.add("sidebar-collapsed");
  } catch {}

  function syncTitles() {
    const collapsed = root.classList.contains("sidebar-collapsed");
    document.querySelectorAll(".sidebar .nav-item").forEach((btn) => {
      const label = btn.querySelector(".nav-label")?.textContent.trim();
      if (!label) return;
      if (collapsed) btn.title = label;
      else if (btn.title === label) btn.removeAttribute("title");
    });
    const toggle = document.getElementById("sidebar-collapse-btn");
    if (toggle) {
      toggle.title = collapsed ? "Mở rộng menu" : "Thu gọn menu";
      toggle.setAttribute("aria-label", toggle.title);
      toggle.setAttribute("aria-expanded", String(!collapsed));
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    syncTitles();
    document.getElementById("sidebar-collapse-btn")?.addEventListener("click", () => {
      const collapsed = root.classList.toggle("sidebar-collapsed");
      try {
        localStorage.setItem(KEY, collapsed ? "1" : "0");
      } catch {}
      syncTitles();
      // Bảng/biểu đồ đo lại bề rộng (header nổi, cột ghim...).
      window.dispatchEvent(new Event("resize"));
    });
  });
})();
