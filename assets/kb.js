/* kb.js — bookmark (đang-đọc-tới-đâu) + search toàn văn + lightbox.
   Không cần backend: bookmark dùng localStorage, search đọc search-index.json
   do build_kb.py sinh sẵn. Cơ chế mô phỏng basecamp/writebook (Rails) nhưng
   chạy hoàn toàn tĩnh trên GitHub Pages. */

(function () {
  "use strict";

  // ── Bookmark: nhớ chương đọc gần nhất, đánh dấu cam ở trang mục lục ──
  var KEY = "kb:last-read";

  function markLastRead() {
    var last;
    try { last = localStorage.getItem(KEY); } catch (e) { return; }
    if (!last) return;
    document.querySelectorAll(".toc__leaf[data-href]").forEach(function (leaf) {
      if (leaf.dataset.href === last) leaf.classList.add("toc__leaf--last-read");
    });
  }

  function recordThisPage() {
    var el = document.querySelector("[data-kb-leaf-href]");
    if (!el) return;
    try { localStorage.setItem(KEY, el.dataset.kbLeafHref); } catch (e) {}
  }

  // ── Lightbox ảnh ──
  function initLightbox() {
    var box = document.querySelector("#lightbox");
    if (!box) return;
    var img = box.querySelector("img");
    document.querySelectorAll("#main img").forEach(function (thumb) {
      thumb.addEventListener("click", function () {
        img.src = thumb.src;
        box.classList.add("is-open");
      });
    });
    box.addEventListener("click", function () { box.classList.remove("is-open"); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") box.classList.remove("is-open");
    });
  }

  // ── Search toàn văn (client-side, đọc search-index.json) ──
  function initSearch() {
    var input = document.querySelector("[data-kb-search] input");
    var results = document.querySelector(".search__results");
    if (!input || !results) return;

    var index = null;
    var base = input.dataset.indexBase || "";

    function load() {
      if (index) return Promise.resolve(index);
      return fetch(base + "search-index.json")
        .then(function (r) { return r.json(); })
        .then(function (d) { index = d; return d; });
    }

    function escapeHtml(s) {
      return s.replace(/[&<>"]/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
      });
    }

    function render(q) {
      results.innerHTML = "";
      if (!q || q.length < 2 || !index) return;
      var needle = q.toLowerCase();
      var hits = 0;
      index.forEach(function (doc) {
        if (hits >= 12) return;
        var pos = doc.text.toLowerCase().indexOf(needle);
        var inTitle = doc.title.toLowerCase().indexOf(needle) !== -1;
        if (pos === -1 && !inTitle) return;
        hits++;
        var snippet = "";
        if (pos !== -1) {
          var start = Math.max(0, pos - 45);
          var raw = doc.text.slice(start, pos + needle.length + 75);
          snippet = escapeHtml(raw).replace(
            new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"),
            function (m) { return "<mark>" + m + "</mark>"; }
          );
          if (start > 0) snippet = "…" + snippet;
        }
        var li = document.createElement("li");
        li.innerHTML =
          '<a href="' + base + doc.href + '"><strong>' + escapeHtml(doc.title) +
          "</strong>" + (snippet ? '<span class="search__snippet">' + snippet + "</span>" : "") +
          "</a>";
        results.appendChild(li);
      });
      if (hits === 0) {
        var li = document.createElement("li");
        li.innerHTML = '<a href="#"><em>Không tìm thấy</em></a>';
        results.appendChild(li);
      }
    }

    input.addEventListener("focus", load);
    input.addEventListener("input", function () {
      load().then(function () { render(input.value.trim()); });
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest("[data-kb-search]")) results.innerHTML = "";
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    markLastRead();
    recordThisPage();
    initLightbox();
    initSearch();
  });
})();
