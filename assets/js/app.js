/* 每日一句 — 纯静态前端逻辑（零依赖） */
(function () {
  "use strict";

  // 全分类随机（不再限定 a/d/i/k）：动画/漫画/游戏/文学/原创/网络/其他/影视/诗词/网易云/哲学/抖机灵
  var API = "https://v1.hitokoto.cn/?encode=json";
  var MANIFEST_URL = "data/manifest.json";
  var QUOTES_URL = "data/quotes.json";

  // 一言分类字母 → 中文
  var TYPE_MAP = {
    a: "动画", b: "漫画", c: "游戏", d: "文学", e: "原创", f: "来自网络",
    g: "其他", h: "影视", i: "诗词", j: "网易云", k: "哲学", l: "抖机灵"
  };

  var FAV_KEY = "dq_favs_v1";

  var els = {
    dateLabel: document.getElementById("dateLabel"),
    featuredBadge: document.getElementById("featuredBadge"),
    quoteText: document.getElementById("quoteText"),
    quoteAuthor: document.getElementById("quoteAuthor"),
    quoteFrom: document.getElementById("quoteFrom"),
    quoteType: document.getElementById("quoteType"),
    newBtn: document.getElementById("newBtn"),
    favAddBtn: document.getElementById("favAddBtn"),
    copyBtn: document.getElementById("copyBtn"),
    shareBtn: document.getElementById("shareBtn"),
    historyBtn: document.getElementById("historyBtn"),
    favBtn: document.getElementById("favBtn"),
    historyModal: document.getElementById("historyModal"),
    historyList: document.getElementById("historyList"),
    favModal: document.getElementById("favModal"),
    favList: document.getElementById("favList"),
    favEmpty: document.getElementById("favEmpty"),
    toast: document.getElementById("toast"),
    card: document.getElementById("card")
  };

  var state = {
    current: null,      // 当前展示的 quote { text, from, author, type, source }
    manifest: null,     // 清单
    quotes: [],         // 内置兜底库
    isFeatured: false   // 当前是否来自每日快照（历史回看）
  };

  /* ---------- 工具 ---------- */
  function todayStr(d) {
    d = d || new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function fmtDateLabel(d) {
    var wd = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
    return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日 · 周" + wd;
  }

  var toastTimer = null;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.remove("hidden");
    // 强制重排以触发过渡
    void els.toast.offsetWidth;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove("show");
      setTimeout(function () { els.toast.classList.add("hidden"); }, 260);
    }, 1600);
  }

  function normalizeType(t) {
    if (!t) return "";
    if (TYPE_MAP[t]) return TYPE_MAP[t];
    return t; // 已是中文
  }

  // 背景色随换句轻微变化（同一浅色系内）
  function shiftHue() {
    var hue = Math.floor(Math.random() * 360);
    document.documentElement.style.setProperty("--hue", String(hue));
  }

  /* ---------- 渲染 ---------- */
  function renderQuote(q, opts) {
    opts = opts || {};
    state.current = q;
    state.isFeatured = !!opts.featured;

    els.quoteText.textContent = q.text || "（空）";
    var author = q.author || "";
    var from = q.from || "";
    els.quoteAuthor.textContent = author;
    els.quoteAuthor.style.display = author ? "" : "none";
    els.quoteFrom.textContent = from ? "《" + from + "》" : "";
    els.quoteFrom.style.display = from ? "" : "none";

    var t = normalizeType(q.type);
    if (t) {
      els.quoteType.textContent = t;
      els.quoteType.classList.remove("hidden");
    } else {
      els.quoteType.classList.add("hidden");
    }

    if (opts.featured) {
      els.featuredBadge.classList.remove("hidden");
    } else {
      els.featuredBadge.classList.add("hidden");
    }

    syncFavButton();
    shiftHue();
  }

  function syncFavButton() {
    var favs = loadFavs();
    var hit = state.current && favs.some(function (f) {
      return f.text === state.current.text && (f.author || "") === (state.current.author || "");
    });
    els.favAddBtn.classList.toggle("active", !!hit);
  }

  /* ---------- 数据获取 ---------- */
  function fetchJSON(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status + " for " + url);
      return r.json();
    });
  }

  // 实时一言 API
  function fetchHitokoto() {
    return fetchJSON(API).then(function (d) {
      return {
        text: d.hitokoto,
        from: d.from || "",
        author: d.from_who || "",
        type: d.type || "",
        source: "hitokoto"
      };
    });
  }

  // 从内置库随机取一条
  function randomLocalQuote() {
    var pool = state.quotes && state.quotes.length ? state.quotes : [];
    if (!pool.length) return null;
    var q = pool[Math.floor(Math.random() * pool.length)];
    return {
      text: q.text, from: q.from || "", author: q.author || "",
      type: q.type || "", source: "local"
    };
  }

  // 换一句：优先实时 API，失败回退本地库
  function nextQuote() {
    els.newBtn.disabled = true;
    els.newBtn.textContent = "取句中…";
    fetchHitokoto()
      .then(function (q) { renderQuote(q, { featured: false }); })
      .catch(function () {
        var q = randomLocalQuote();
        if (q) {
          renderQuote(q, { featured: false });
          toast("已切换到本地语录");
        } else {
          els.quoteText.textContent = "暂时无法获取句子，请稍后再试。";
          els.quoteAuthor.textContent = "";
          els.quoteFrom.textContent = "";
          els.quoteType.classList.add("hidden");
        }
      })
      .then(function () {
        els.newBtn.disabled = false;
        els.newBtn.textContent = "换一句";
      });
  }

  /* ---------- 收藏 ---------- */
  function loadFavs() {
    try {
      var raw = localStorage.getItem(FAV_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function saveFavs(list) {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function toggleFav() {
    if (!state.current) return;
    var favs = loadFavs();
    var idx = favs.findIndex(function (f) {
      return f.text === state.current.text && (f.author || "") === (state.current.author || "");
    });
    if (idx >= 0) {
      favs.splice(idx, 1);
      saveFavs(favs);
      toast("已取消收藏");
    } else {
      favs.unshift({
        text: state.current.text, from: state.current.from || "",
        author: state.current.author || "", type: state.current.type || "",
        source: state.current.source || "", ts: Date.now()
      });
      saveFavs(favs);
      toast("已收藏 ♥");
    }
    syncFavButton();
  }

  /* ---------- 复制 / 分享 ---------- */
  function buildText(q) {
    q = q || state.current;
    if (!q) return "";
    var who = [];
    if (q.author) who.push(q.author);
    if (q.from) who.push("《" + q.from + "》");
    var tail = who.length ? "—— " + who.join(" · ") : "";
    return "「" + q.text + "」" + (tail ? " " + tail : "");
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        resolve();
      } catch (e) { reject(e); }
    });
  }

  function doCopy() {
    if (!state.current) return;
    copyText(buildText()).then(function () { toast("已复制"); })
      .catch(function () { toast("复制失败"); });
  }

  function doShare() {
    if (!state.current) return;
    var text = buildText(state.current) + "  #每日一句";
    if (navigator.share) {
      navigator.share({ title: "每日一句", text: text }).catch(function () {});
      return;
    }
    copyText(text).then(function () { toast("分享文案已复制"); })
      .catch(function () { toast("复制失败"); });
  }

  /* ---------- 弹层 ---------- */
  function openModal(id) { document.getElementById(id).classList.remove("hidden"); }
  function closeModal(id) { document.getElementById(id).classList.add("hidden"); }

  function renderHistory() {
    els.historyList.innerHTML = "";
    var snaps = (state.manifest && state.manifest.snapshots) || [];
    if (!snaps.length) {
      var li = document.createElement("li");
      li.className = "empty-tip";
      li.textContent = "还没有历史快照，明天再来吧。";
      els.historyList.appendChild(li);
      return;
    }
    snaps.forEach(function (s) {
      var li = document.createElement("li");
      li.className = "history-item";
      li.innerHTML =
        '<div class="history-date">' + (s.date || "") + (s.date === todayStr() ? " · 今日" : "") + '</div>' +
        '<div class="history-text"></div>' +
        '<div class="history-meta"></div>';
      // 用 textContent 防 XSS
      li.querySelector(".history-text").textContent = s.quote ? s.quote.text : "";
      var who = [];
      if (s.quote && s.quote.author) who.push(s.quote.author);
      if (s.quote && s.quote.from) who.push("《" + s.quote.from + "》");
      li.querySelector(".history-meta").textContent = who.join(" · ");
      li.addEventListener("click", function () {
        if (s.quote) {
          renderQuote({
            text: s.quote.text, from: s.quote.from || "", author: s.quote.author || "",
            type: s.quote.type || "", source: "snapshot"
          }, { featured: true });
          closeModal("historyModal");
          toast(s.date + " 的快照");
        }
      });
      els.historyList.appendChild(li);
    });
  }

  function renderFavs() {
    var favs = loadFavs();
    els.favList.innerHTML = "";
    if (!favs.length) {
      els.favEmpty.classList.remove("hidden");
      return;
    }
    els.favEmpty.classList.add("hidden");
    favs.forEach(function (f, i) {
      var li = document.createElement("li");
      li.className = "fav-item";
      var row = document.createElement("div");
      row.className = "fav-row";

      var body = document.createElement("div");
      body.style.flex = "1";
      var txt = document.createElement("div");
      txt.className = "fav-text";
      txt.textContent = f.text;
      var meta = document.createElement("div");
      meta.className = "fav-meta";
      var who = [];
      if (f.author) who.push(f.author);
      if (f.from) who.push("《" + f.from + "》");
      meta.textContent = who.join(" · ");
      body.appendChild(txt);
      body.appendChild(meta);

      var del = document.createElement("button");
      del.className = "fav-del";
      del.type = "button";
      del.setAttribute("aria-label", "删除");
      del.textContent = "×";
      del.addEventListener("click", function (e) {
        e.stopPropagation();
        var list = loadFavs();
        list.splice(i, 1);
        saveFavs(list);
        renderFavs();
        syncFavButton();
        toast("已删除");
      });

      body.addEventListener("click", function () {
        renderQuote({
          text: f.text, from: f.from || "", author: f.author || "",
          type: f.type || "", source: f.source || "local"
        }, { featured: false });
        closeModal("favModal");
      });

      row.appendChild(body);
      row.appendChild(del);
      li.appendChild(row);
      els.favList.appendChild(li);
    });
  }

  /* ---------- 初始化 ---------- */
  function init() {
    els.dateLabel.textContent = fmtDateLabel(new Date());

    // 并行加载快照清单与本地兜底库（历史回看 / 收藏兜底用）
    var pManifest = fetchJSON(MANIFEST_URL).catch(function () { return null; });
    var pQuotes = fetchJSON(QUOTES_URL).catch(function () { return { quotes: [] }; });

    Promise.all([pManifest, pQuotes]).then(function (res) {
      state.manifest = res[0];
      state.quotes = (res[1] && res[1].quotes) || [];

      // 完全随机模式：每次进入页面都实时随机取一句（全分类），
      // 不再固定展示“今日精选”快照；每日快照仅保留在「历史回看」中。
      fetchHitokoto()
        .then(function (q) { renderQuote(q, { featured: false }); })
        .catch(function () {
          var q = randomLocalQuote();
          if (q) renderQuote(q, { featured: false });
          else els.quoteText.textContent = "欢迎使用每日一句，点「换一句」看看吧。";
        });
    });

    // 事件绑定
    els.newBtn.addEventListener("click", nextQuote);
    els.favAddBtn.addEventListener("click", toggleFav);
    els.copyBtn.addEventListener("click", doCopy);
    els.shareBtn.addEventListener("click", doShare);
    els.historyBtn.addEventListener("click", function () { renderHistory(); openModal("historyModal"); });
    els.favBtn.addEventListener("click", function () { renderFavs(); openModal("favModal"); });

    document.querySelectorAll("[data-close]").forEach(function (b) {
      b.addEventListener("click", function () { closeModal(b.getAttribute("data-close")); });
    });
    [els.historyModal, els.favModal].forEach(function (m) {
      m.addEventListener("click", function (e) { if (e.target === m) m.classList.add("hidden"); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closeModal("historyModal"); closeModal("favModal"); }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
