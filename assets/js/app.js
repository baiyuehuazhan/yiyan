/* =====================================================
 * 每日一句 · Daily Quote — 纯静态前端逻辑（零依赖）
 * 完全随机模式：每次打开 / 换一句 实时取一言（全分类随机）
 * ===================================================== */
(function () {
  "use strict";

  var API = "https://v1.hitokoto.cn/?encode=json"; // 全分类：动画/漫画/游戏/文学/原创/网络/其他/影视/诗词/网易云/哲学/抖机灵
  var MANIFEST_URL = "data/manifest.json";
  var QUOTES_URL = "data/quotes.json";
  var FAV_KEY = "dq_favs_v1";
  var API_TIMEOUT = 8000;   // 实时 API 超时（毫秒）
  var DATA_TIMEOUT = 6000;  // 本地 data/*.json 超时

  var TYPE_MAP = {
    a: "动画", b: "漫画", c: "游戏", d: "文学", e: "原创", f: "来自网络",
    g: "其他", h: "影视", i: "诗词", j: "网易云", k: "哲学", l: "抖机灵"
  };

  function $(id) { return document.getElementById(id); }

  var els = {
    dateLabel: $("dateLabel"),
    featuredBadge: $("featuredBadge"),
    quoteText: $("quoteText"),
    quoteAuthor: $("quoteAuthor"),
    quoteFrom: $("quoteFrom"),
    quoteType: $("quoteType"),
    newBtn: $("newBtn"),
    newBtnText: $("newBtnText"),
    favAddBtn: $("favAddBtn"),
    copyBtn: $("copyBtn"),
    shareBtn: $("shareBtn"),
    historyBtn: $("historyBtn"),
    favBtn: $("favBtn"),
    historyModal: $("historyModal"),
    historyList: $("historyList"),
    favModal: $("favModal"),
    favList: $("favList"),
    favEmpty: $("favEmpty"),
    toast: $("toast")
  };

  var state = {
    current: null,     // 当前展示 { text, from, author, type, source }
    manifest: null,
    quotes: [],
    busy: false        // 换一句进行中，防重复触发
  };

  /* ---------- 工具 ---------- */
  function pad2(n) { return String(n).padStart(2, "0"); }

  function todayStr(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function fmtDateLabel(d) {
    var wd = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
    return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日 · 周" + wd;
  }

  var toastTimer = null;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.remove("hidden");
    void els.toast.offsetWidth;            // 强制重排，触发过渡
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove("show");
      setTimeout(function () { els.toast.classList.add("hidden"); }, 300);
    }, 1800);
  }

  function normalizeType(t) {
    if (!t) return "";
    return TYPE_MAP[t] || t;
  }

  // 背景色随换句变化
  function shiftHue() {
    document.documentElement.style.setProperty("--hue", String(Math.floor(Math.random() * 360)));
  }

  // 正文入场动画
  function animateQuote() {
    els.quoteText.classList.remove("pop");
    void els.quoteText.offsetWidth;
    els.quoteText.classList.add("pop");
  }

  function anyModalOpen() {
    return !els.historyModal.classList.contains("hidden") ||
           !els.favModal.classList.contains("hidden");
  }

  /* ---------- 渲染 ---------- */
  function renderQuote(q, opts) {
    opts = opts || {};
    state.current = q;

    els.quoteText.textContent = q.text || "（空）";

    if (q.author) {
      els.quoteAuthor.textContent = q.author;
      els.quoteAuthor.classList.remove("hidden");
    } else {
      els.quoteAuthor.classList.add("hidden");
    }

    if (q.from) {
      els.quoteFrom.textContent = "《" + q.from + "》";
      els.quoteFrom.classList.remove("hidden");
    } else {
      els.quoteFrom.classList.add("hidden");
    }

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
    animateQuote();
    shiftHue();
  }

  function syncFavButton() {
    var favs = loadFavs();
    var hit = state.current && favs.some(function (f) {
      return f.text === state.current.text &&
             (f.author || "") === (state.current.author || "");
    });
    els.favAddBtn.classList.toggle("active", !!hit);
  }

  /* ---------- 数据获取 ---------- */
  function fetchJSON(url, timeout) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeout || DATA_TIMEOUT) : null;
    return fetch(url, { cache: "no-cache", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
        return r.json();
      })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  function fetchHitokoto() {
    return fetchJSON(API, API_TIMEOUT).then(function (d) {
      return {
        text: d.hitokoto || "",
        from: d.from || "",
        author: d.from_who || "",
        type: d.type || "",
        source: "hitokoto"
      };
    });
  }

  function randomLocalQuote() {
    var pool = state.quotes && state.quotes.length ? state.quotes : [];
    if (!pool.length) return null;
    var q = pool[Math.floor(Math.random() * pool.length)];
    return {
      text: q.text, from: q.from || "", author: q.author || "",
      type: q.type || "", source: "local"
    };
  }

  // 换一句（也用于首页首次取句）：实时 API → 本地兜底 → 错误提示
  function nextQuote() {
    if (state.busy) return;
    state.busy = true;
    els.newBtn.disabled = true;
    els.newBtn.classList.add("loading");
    els.newBtnText.textContent = "取句中…";

    fetchHitokoto()
      .then(function (q) {
        renderQuote(q, { featured: false });
      })
      .catch(function () {
        var q = randomLocalQuote();
        if (q) {
          renderQuote(q, { featured: false });
          toast("网络开小差了，已切换本地语录");
        } else {
          state.current = null;
          els.quoteText.textContent = "暂时无法取句，请稍后再试";
          els.quoteAuthor.classList.add("hidden");
          els.quoteFrom.classList.add("hidden");
          els.quoteType.classList.add("hidden");
          els.featuredBadge.classList.add("hidden");
          syncFavButton();
          toast("取句失败，请检查网络后重试");
        }
      })
      .finally(function () {
        state.busy = false;
        els.newBtn.classList.remove("loading");
        els.newBtnText.textContent = "换一句";
        els.newBtn.disabled = false;
      });
  }

  /* ---------- 收藏 ---------- */
  function loadFavs() {
    try {
      var raw = localStorage.getItem(FAV_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function saveFavs(list) {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function toggleFav() {
    if (!state.current) return;
    var favs = loadFavs();
    var idx = favs.findIndex(function (f) {
      return f.text === state.current.text &&
             (f.author || "") === (state.current.author || "");
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
    if (!q || !q.text) return "";
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
        ta.setAttribute("readonly", "");
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
  function openModal(id) { $(id).classList.remove("hidden"); }
  function closeModal(id) { $(id).classList.add("hidden"); }

  function quoteToMetaText(quote) {
    var who = [];
    if (quote && quote.author) who.push(quote.author);
    if (quote && quote.from) who.push("《" + quote.from + "》");
    if (quote && quote.type) who.push(normalizeType(quote.type));
    return who.join(" · ");
  }

  function renderHistory() {
    var frag = document.createDocumentFragment();
    var snaps = (state.manifest && state.manifest.snapshots) || [];
    var today = todayStr();

    if (!snaps.length) {
      var tip = document.createElement("li");
      tip.className = "empty-tip";
      tip.textContent = "历史从今天开始积累，每天清晨会自动归档一句。";
      frag.appendChild(tip);
    } else {
      snaps.forEach(function (s) {
        if (!s || !s.quote) return;
        var li = document.createElement("li");
        li.className = "item";

        var dateDiv = document.createElement("div");
        dateDiv.className = "item-date";
        dateDiv.textContent = s.date || "";
        if (s.date === today) {
          var chip = document.createElement("span");
          chip.className = "today-chip";
          chip.textContent = "今日";
          dateDiv.appendChild(chip);
        }

        var textDiv = document.createElement("div");
        textDiv.className = "item-text";
        textDiv.textContent = s.quote.text || "";

        var metaDiv = document.createElement("div");
        metaDiv.className = "item-meta";
        metaDiv.textContent = quoteToMetaText(s.quote);

        li.appendChild(dateDiv);
        li.appendChild(textDiv);
        li.appendChild(metaDiv);

        li.addEventListener("click", function () {
          renderQuote({
            text: s.quote.text, from: s.quote.from || "",
            author: s.quote.author || "", type: s.quote.type || "",
            source: "snapshot"
          }, { featured: true });
          closeModal("historyModal");
          toast((s.date === today ? "今天" : s.date) + " 的快照");
        });

        frag.appendChild(li);
      });
    }
    els.historyList.innerHTML = "";
    els.historyList.appendChild(frag);
  }

  function renderFavs() {
    var frag = document.createDocumentFragment();
    var favs = loadFavs();

    if (!favs.length) {
      els.favEmpty.classList.remove("hidden");
    } else {
      els.favEmpty.classList.add("hidden");
    }

    favs.forEach(function (f, i) {
      var li = document.createElement("li");
      li.className = "item";

      var row = document.createElement("div");
      row.className = "fav-row";

      var body = document.createElement("div");
      body.className = "fav-body";

      var txt = document.createElement("div");
      txt.className = "item-text";
      txt.textContent = f.text || "";

      var meta = document.createElement("div");
      meta.className = "item-meta";
      meta.textContent = quoteToMetaText(f);

      body.appendChild(txt);
      body.appendChild(meta);

      var del = document.createElement("button");
      del.className = "fav-del";
      del.type = "button";
      del.setAttribute("aria-label", "删除这条收藏");
      del.title = "删除";
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
      frag.appendChild(li);
    });

    els.favList.innerHTML = "";
    els.favList.appendChild(frag);
  }

  /* ---------- 初始化 ---------- */
  function init() {
    els.dateLabel.textContent = fmtDateLabel(new Date());

    // 并行加载快照清单与本地兜底库
    var pManifest = fetchJSON(MANIFEST_URL, DATA_TIMEOUT).catch(function () { return null; });
    var pQuotes = fetchJSON(QUOTES_URL, DATA_TIMEOUT).catch(function () { return { quotes: [] }; });

    Promise.all([pManifest, pQuotes]).then(function (res) {
      state.manifest = res[0];
      state.quotes = (res[1] && res[1].quotes) || [];
      // 首次进入：直接随机取一句
      nextQuote();
    });

    // 事件
    els.newBtn.addEventListener("click", function () { this.blur(); nextQuote(); });
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

    // 键盘：Esc 关闭；空格 / → / Enter / N 换一句（避免在按钮/输入态误触）
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        closeModal("historyModal");
        closeModal("favModal");
        return;
      }
      if (anyModalOpen()) return;
      var ae = document.activeElement;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" ||
                 ae.tagName === "SELECT" || ae.tagName === "BUTTON" || ae.isContentEditable)) {
        return;
      }
      if (e.key === " " || e.key === "ArrowRight" || e.key === "Enter" ||
          e.key.toLowerCase() === "n") {
        e.preventDefault();
        nextQuote();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
