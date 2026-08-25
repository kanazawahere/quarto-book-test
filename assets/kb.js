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
    // box là <dialog> — dùng showModal()/close() native (CSS gốc chỉ style trạng thái [open])
    // CHỈ ảnh trong nội dung chương (article) — KHÔNG phải icon nút (PDF/list/grid
    // cũng là <img> trong #main; selector "#main img" từng làm bấm nút List = mở
    // lightbox phóng to chính icon đó, Batin bắt 2026-08-25 từ ảnh chụp).
    document.querySelectorAll("article[data-kb-leaf-href] img").forEach(function (thumb) {
      thumb.addEventListener("click", function () {
        img.src = thumb.src;
        box.showModal();
      });
    });
    box.addEventListener("click", function () { box.close(); });
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

/* ═══ WIDGETS TƯƠNG TÁC (2026-08-25, Batin chốt "làm hết") ═══
   Writer chêm fenced code block với "ngôn ngữ" đặc biệt trong .qmd:
     ```quiz       Q: câu hỏi / - sai / -* đúng / E: giải thích  (nhiều câu cách dòng trống)
     ```checklist  # nhóm / - việc                                (tick nhớ localStorage)
     ```flashcard  mặt trước :: mặt sau                           (bấm lật, prev/next)
     ```dapan      dòng 1 = nhãn, còn lại = nội dung ẩn           (bấm mới hiện)
   + nút Copy tự gắn cho mọi <pre> thường và <blockquote> chứa [ĐIỀN (prompt mẫu).
   + tiến độ đọc: ghi chương đã mở, kệ sách hiện thanh %.
   Tĩnh 100%, không backend. PDF không ảnh hưởng (block hạ cấp thành text thường). */
(function () {
  "use strict";

  function esc(s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function widgetBlocks(lang) {
    // bắt cả <pre class="quiz"> lẫn <pre class="sourceCode quiz"> (Quarto/pandoc)
    return Array.prototype.filter.call(
      document.querySelectorAll("article pre"),
      function (pre) {
        var code = pre.querySelector("code");
        var cls = (pre.className + " " + (code ? code.className : ""));
        return (" " + cls + " ").indexOf(" " + lang + " ") !== -1;
      });
  }

  function replaceWith(pre, el) {
    var host = pre.closest("div.sourceCode") || pre;
    host.replaceWith(el);
  }

  // ── Copy prompt: mọi pre thường + blockquote chứa [ĐIỀN ──
  function initCopy() {
    var targets = [];
    document.querySelectorAll("article pre").forEach(function (pre) {
      var cls = pre.className + " " + (pre.querySelector("code") || {}).className;
      if (/\b(quiz|checklist|flashcard|dapan)\b/.test(cls)) return;
      targets.push(pre);
    });
    document.querySelectorAll("article blockquote").forEach(function (bq) {
      if (bq.textContent.indexOf("[ĐIỀN") !== -1 || bq.textContent.indexOf("[DÁN") !== -1)
        targets.push(bq);
    });
    targets.forEach(function (el) {
      var wrap = document.createElement("div");
      wrap.className = "kbw-copywrap";
      el.parentNode.insertBefore(wrap, el);
      wrap.appendChild(el);
      var btn = document.createElement("button");
      btn.className = "kbw-copy";
      btn.textContent = "📋 Sao chép";
      btn.addEventListener("click", function () {
        navigator.clipboard.writeText(el.textContent.trim()).then(function () {
          btn.textContent = "✓ Đã chép — dán vào AI";
          setTimeout(function () { btn.textContent = "📋 Sao chép"; }, 2500);
        });
      });
      wrap.appendChild(btn);
    });
  }

  // ── Quiz ──
  function initQuiz() {
    widgetBlocks("quiz").forEach(function (pre) {
      var qs = [], cur = null;
      pre.textContent.split("\n").forEach(function (ln) {
        ln = ln.trim();
        if (/^Q:/.test(ln)) { cur = { q: ln.slice(2).trim(), opts: [], e: "" }; qs.push(cur); }
        else if (/^-\*/.test(ln) && cur) cur.opts.push({ t: ln.slice(2).trim(), ok: true });
        else if (/^-/.test(ln) && cur) cur.opts.push({ t: ln.slice(1).trim(), ok: false });
        else if (/^E:/.test(ln) && cur) cur.e = ln.slice(2).trim();
      });
      if (!qs.length) return;
      var box = document.createElement("div");
      box.className = "kbw-quiz";
      qs.forEach(function (q, qi) {
        var f = document.createElement("fieldset");
        f.innerHTML = "<legend>" + esc(q.q) + "</legend>";
        q.opts.forEach(function (o) {
          var lb = document.createElement("label");
          lb.innerHTML = '<input type="radio" name="q' + qi + Math.random().toString(36).slice(2, 6) + '"> ' + esc(o.t);
          lb.querySelector("input").addEventListener("change", function () {
            f.querySelectorAll("label").forEach(function (x) { x.classList.remove("kbw-right", "kbw-wrong"); });
            lb.classList.add(o.ok ? "kbw-right" : "kbw-wrong");
            var ex = f.querySelector(".kbw-explain");
            if (ex) ex.textContent = (o.ok ? "✓ Đúng. " : "✗ Chưa đúng. ") + q.e;
          });
          f.appendChild(lb);
        });
        var ex = document.createElement("p");
        ex.className = "kbw-explain";
        f.appendChild(ex);
        box.appendChild(f);
      });
      replaceWith(pre, box);
    });
  }

  // ── Checklist (nhớ localStorage) ──
  function initChecklist() {
    var page = location.pathname;
    widgetBlocks("checklist").forEach(function (pre, bi) {
      var box = document.createElement("div");
      box.className = "kbw-checklist";
      var i = 0;
      pre.textContent.split("\n").forEach(function (ln) {
        ln = ln.replace(/\s+$/, "");
        if (!ln.trim()) return;
        if (/^#/.test(ln.trim())) {
          var h = document.createElement("p");
          h.className = "kbw-check-head";
          h.textContent = ln.replace(/^#+\s*/, "");
          box.appendChild(h);
        } else if (/^-/.test(ln.trim())) {
          var key = "kb:check:" + page + ":" + bi + ":" + i;
          var lb = document.createElement("label");
          var cb = document.createElement("input");
          cb.type = "checkbox";
          try { cb.checked = localStorage.getItem(key) === "1"; } catch (e) {}
          cb.addEventListener("change", function () {
            try { localStorage.setItem(key, cb.checked ? "1" : "0"); } catch (e) {}
            lb.classList.toggle("kbw-done", cb.checked);
          });
          lb.appendChild(cb);
          lb.appendChild(document.createTextNode(" " + ln.trim().replace(/^-\s*(\[.\]\s*)?/, "")));
          if (cb.checked) lb.classList.add("kbw-done");
          box.appendChild(lb);
          i++;
        }
      });
      replaceWith(pre, box);
    });
  }

  // ── Flashcard ──
  function initFlashcard() {
    widgetBlocks("flashcard").forEach(function (pre) {
      var cards = pre.textContent.split("\n").map(function (l) {
        var m = l.split("::");
        return m.length >= 2 ? { f: m[0].trim(), b: m.slice(1).join("::").trim() } : null;
      }).filter(Boolean);
      if (!cards.length) return;
      var idx = 0, back = false;
      var box = document.createElement("div");
      box.className = "kbw-flash";
      box.innerHTML = '<div class="kbw-flash-card" tabindex="0"></div>' +
        '<div class="kbw-flash-nav"><button>‹ Trước</button><span></span><button>Sau ›</button></div>' +
        '<p class="kbw-flash-hint">Bấm vào thẻ để lật</p>';
      var card = box.querySelector(".kbw-flash-card");
      var nav = box.querySelectorAll("button");
      var cnt = box.querySelector("span");
      function render() {
        card.textContent = back ? cards[idx].b : cards[idx].f;
        card.classList.toggle("kbw-flash-back", back);
        cnt.textContent = (idx + 1) + " / " + cards.length;
      }
      card.addEventListener("click", function () { back = !back; render(); });
      nav[0].addEventListener("click", function () { idx = (idx - 1 + cards.length) % cards.length; back = false; render(); });
      nav[1].addEventListener("click", function () { idx = (idx + 1) % cards.length; back = false; render(); });
      render();
      replaceWith(pre, box);
    });
  }

  // ── Đáp án gấp-mở ──
  function initDapan() {
    widgetBlocks("dapan").forEach(function (pre) {
      var lines = pre.textContent.split("\n");
      var title = (lines.shift() || "Xem đáp án").trim();
      var d = document.createElement("details");
      d.className = "kbw-dapan";
      d.innerHTML = "<summary>" + esc(title) + "</summary><div>" +
        esc(lines.join("\n").trim()).replace(/\n/g, "<br>") + "</div>";
      replaceWith(pre, d);
    });
  }

  // ── Tiến độ đọc: ghi chương đã mở + thanh % trên kệ ──
  function initProgress() {
    var art = document.querySelector("article[data-kb-leaf-href]");
    if (art) {
      var parts = location.pathname.split("/").filter(Boolean);
      var slug = parts[parts.length - 2] || "";
      if (slug) {
        try {
          var k = "kb:read:" + slug;
          var seen = JSON.parse(localStorage.getItem(k) || "[]");
          var href = art.dataset.kbLeafHref;
          if (seen.indexOf(href) === -1) { seen.push(href); localStorage.setItem(k, JSON.stringify(seen)); }
        } catch (e) {}
      }
    }
    document.querySelectorAll(".library__book-link[data-slug]").forEach(function (a) {
      var total = parseInt(a.dataset.chapters || "0", 10);
      if (!total) return;
      var seen = [];
      try { seen = JSON.parse(localStorage.getItem("kb:read:" + a.dataset.slug) || "[]"); } catch (e) {}
      if (!seen.length) return;
      var pct = Math.min(100, Math.round(seen.length / total * 100));
      var bar = document.createElement("span");
      bar.className = "kbw-progress";
      bar.innerHTML = '<span style="width:' + pct + '%"></span>';
      bar.title = "Đã đọc " + pct + "%";
      var h2 = a.querySelector("h2");
      if (h2) h2.appendChild(bar);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initCopy(); initQuiz(); initChecklist(); initFlashcard(); initDapan(); initProgress();
  });
})();
