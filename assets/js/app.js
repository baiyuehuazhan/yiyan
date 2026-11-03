/* =====================================================
 * 每日一句 · Daily Quote — 纯静态前端逻辑（零依赖）
 * 完全随机模式：每次打开 / 换一句 实时取一言（全分类随机）
 * ===================================================== */
(function () {
  "use strict";

  var API = "https://v1.hitokoto.cn/?encode=json"; // 全分类：动画/漫画/游戏/文学/原创/网络/其他/影视/诗词/网易云/哲学/抖机灵
  var FAV_KEY = "dq_favs_v1";
  var API_TIMEOUT = 8000;   // 请求超时（毫秒）
  var DEDUP_TRIES = 2;      // 拿到与当前相同的句子时，最多再重取几次

  var TYPE_MAP = {
    a: "动画", b: "漫画", c: "游戏", d: "文学", e: "原创", f: "来自网络",
    g: "其他", h: "影视", i: "诗词", j: "网易云", k: "哲学", l: "抖机灵"
  };

  function $(id) { return document.getElementById(id); }

  var els = {
    dateLabel: $("dateLabel"),
    quoteText: $("quoteText"),
    quoteAuthor: $("quoteAuthor"),
    quoteFrom: $("quoteFrom"),
    quoteType: $("quoteType"),
    newBtn: $("newBtn"),
    newBtnText: $("newBtnText"),
    favAddBtn: $("favAddBtn"),
    copyBtn: $("copyBtn"),
    shareBtn: $("shareBtn"),
    favBtn: $("favBtn"),
    favModal: $("favModal"),
    favList: $("favList"),
    favEmpty: $("favEmpty"),
    toast: $("toast")
  };

  var state = {
    current: null      // 当前展示 { text, from, author, type, source }
  };

  var inflight = null;   // 当前在飞的请求控制器（新请求会打断旧的）
  var reqToken = 0;      // 请求序号，只有最后一次的结果会被渲染

  /* ---------- 工具 ---------- */
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
    return !els.favModal.classList.contains("hidden");
  }

  /* ---------- 渲染 ---------- */
  function renderQuote(q) {
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
  function fetchJSON(url, timeout, ctrl) {
    if (!ctrl) ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, timeout || API_TIMEOUT);
    return fetch(url, { cache: "no-store", signal: ctrl.signal })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
        return r.json();
      })
      .finally(function () { clearTimeout(timer); });
  }

  function fetchHitokoto(ctrl) {
    // 一言对同一个 URL 会命中服务端缓存，连点几次都返回同一句。
    // 带上随机参数强制换一条。
    var url = API + "&_=" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    return fetchJSON(url, API_TIMEOUT, ctrl).then(function (d) {
      return {
        text: d.hitokoto || "",
        from: d.from || "",
        author: d.from_who || "",
        type: d.type || "",
        source: "hitokoto"
      };
    });
  }

  // 取一条与当前不同的句子；撞车就再取，最多 DEDUP_TRIES 次
  function fetchDistinct(tries, ctrl) {
    return fetchHitokoto(ctrl).then(function (q) {
      var same = state.current && q.text && q.text === state.current.text;
      if (same && tries < DEDUP_TRIES) {
        return fetchDistinct(tries + 1, ctrl);
      }
      return q;
    });
  }

  // 换一句（也用于首页首次取句）：只走在线接口，失败直接提示，不做本地兜底
  // 连点不吞：新的一次会打断上一次请求，只有最后一次的结果会被渲染
  function nextQuote() {
    var token = ++reqToken;

    if (inflight) {
      inflight.__interrupted = true;   // 标记：这次 abort 是新点击造成的，不是超时
      try { inflight.abort(); } catch (e) {}
    }
    var ctrl = new AbortController();
    ctrl.__interrupted = false;
    inflight = ctrl;

    els.newBtn.classList.add("loading");
    els.newBtnText.textContent = "取句中…";

    fetchDistinct(0, ctrl)
      .then(function (q) {
        if (token !== reqToken) return;          // 已被后来的点击取代
        renderQuote(q);
      })
      .catch(function (err) {
        if (token !== reqToken) return;
        // 只有"被新点击打断"才静默退出，超时和网络错误都要如实报出来
        if (err && err.name === "AbortError" && ctrl.__interrupted) return;
        state.current = null;
        els.quoteText.textContent = "暂时无法取句，请稍后再试";
        els.quoteAuthor.classList.add("hidden");
        els.quoteFrom.classList.add("hidden");
        els.quoteType.classList.add("hidden");
        syncFavButton();
        toast("取句失败，请检查网络后重试");
      })
      .finally(function () {
        if (token !== reqToken) return;
        inflight = null;
        els.newBtn.classList.remove("loading");
        els.newBtnText.textContent = "换一句";
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
    var tail = who.length ? "—— " + who.join(" ") : "";
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

  /* ---------- 分享：把当前这句画成卡片图 ---------- */
  var CARD_W = 1080, CARD_H = 1350;   // 4:5，朋友圈/小红书都好发

  var CLAUSE_PUNCT = "，。；：！？、,.!?;:";

  // 先按标点切成语义块，避免"远行/客。"这种把字切开的断法
  function splitClauses(text) {
    var out = [], buf = "";
    for (var i = 0; i < text.length; i++) {
      buf += text.charAt(i);
      if (CLAUSE_PUNCT.indexOf(text.charAt(i)) >= 0) { out.push(buf); buf = ""; }
    }
    if (buf) out.push(buf);
    return out;
  }

  // 单块本身就超宽时，退化成逐字硬切
  function hardWrap(ctx, text, maxWidth) {
    var lines = [], line = "";
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      var test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // 按像素宽度排行：能整块放下就整块放，放不下才换行
  function wrapLines(ctx, text, maxWidth) {
    text = String(text || "").replace(/\s+/g, " ").trim();
    var clauses = splitClauses(text);
    var lines = [], line = "";

    for (var i = 0; i < clauses.length; i++) {
      var c = clauses[i];
      if (!c) continue;

      if (!line) {
        if (ctx.measureText(c).width <= maxWidth) {
          line = c;
        } else {
          var p1 = hardWrap(ctx, c, maxWidth);
          for (var a = 0; a < p1.length - 1; a++) lines.push(p1[a]);
          line = p1[p1.length - 1];
        }
        continue;
      }

      if (ctx.measureText(line + c).width <= maxWidth) {
        line += c;
      } else {
        lines.push(line);
        if (ctx.measureText(c).width <= maxWidth) {
          line = c;
        } else {
          var p2 = hardWrap(ctx, c, maxWidth);
          for (var b = 0; b < p2.length - 1; b++) lines.push(p2[b]);
          line = p2[p2.length - 1];
        }
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawQuoteCard(q) {
    var canvas = document.createElement("canvas");
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    var ctx = canvas.getContext("2d");

    var PAD = 64;                       // 画布边 → 纸面
    var INNER = 96;                     // 纸面 → 内容
    var left = PAD + INNER;
    var right = CARD_W - PAD - INNER;
    var contentW = right - left;

    var PAPER = "#f2ede3", SHEET = "#fffdf8";
    var INK = "#1b1814", INK_SOFT = "#6b6358", INK_FAINT = "#8b8173";
    var ACCENT = "#9c3f2e";
    var RULE = "rgba(27,24,20,0.14)", RULE_SOFT = "rgba(27,24,20,0.075)";
    var serif = '"Noto Serif SC", "Songti SC", "STSong", Georgia, serif';
    var sans = '"PingFang SC", "Microsoft YaHei", -apple-system, sans-serif';

    // 纸底 + 纸面
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    ctx.fillStyle = SHEET;
    ctx.fillRect(PAD, PAD, CARD_W - PAD * 2, CARD_H - PAD * 2);
    ctx.strokeStyle = RULE;
    ctx.lineWidth = 2;
    ctx.strokeRect(PAD, PAD, CARD_W - PAD * 2, CARD_H - PAD * 2);
    // 顶部赭红压线
    ctx.fillStyle = ACCENT;
    ctx.fillRect(PAD, PAD, CARD_W - PAD * 2, 5);

    ctx.textBaseline = "top";

    // 日期
    var d = new Date();
    var wd = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
    var dateStr = d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日 · 周" + wd;
    ctx.beginPath();
    ctx.arc(left - 24, PAD + 82, 5, 0, Math.PI * 2);
    ctx.fillStyle = ACCENT;
    ctx.fill();
    ctx.font = "500 26px " + sans;
    ctx.fillStyle = INK_SOFT;
    ctx.textAlign = "left";
    ctx.fillText(dateStr, left, PAD + 68);

    // 顶部分隔线
    ctx.strokeStyle = RULE_SOFT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left, PAD + 134);
    ctx.lineTo(right, PAD + 134);
    ctx.stroke();

    // ---- 中部内容块，垂直居中 ----
    var eyebrow = normalizeType(q.type);
    var who = [];
    if (q.author) who.push(q.author);
    if (q.from) who.push("《" + q.from + "》");
    var metaText = who.length ? "—— " + who.join(" ") : "";

    var fs = 74;
    ctx.font = "500 " + fs + "px " + serif;
    var lines = wrapLines(ctx, q.text || "", contentW);

    // 短句自动放大，撑出海报感
    if (lines.length === 1) {
      var w1 = ctx.measureText(lines[0]).width;
      if (w1 > 0 && w1 < contentW * 0.82) {
        var bigger = Math.min(116, Math.floor(fs * (contentW * 0.82) / w1));
        if (bigger > fs) {
          ctx.font = "500 " + bigger + "px " + serif;
          var testLines = wrapLines(ctx, q.text || "", contentW);
          if (testLines.length === 1) { fs = bigger; lines = testLines; }
          else { ctx.font = "500 " + fs + "px " + serif; }
        }
      }
    }

    if (lines.length > 3) {
      fs = 60;
      ctx.font = "500 " + fs + "px " + serif;
      lines = wrapLines(ctx, q.text || "", contentW);
    }
    if (lines.length > 4) {
      fs = 50;
      ctx.font = "500 " + fs + "px " + serif;
      lines = wrapLines(ctx, q.text || "", contentW);
    }

    var lh = 1.72;
    var textH = lines.length * fs * lh;
    var eyebrowH = eyebrow ? 34 : 0;
    var gap1 = eyebrow ? 52 : 0;
    var metaH = metaText ? 40 : 0;
    var gap2 = metaText ? 70 : 0;
    var blockH = eyebrowH + gap1 + textH + gap2 + metaH;

    // 直接在整张纸面里垂直居中，别让日期栏和页脚把重心带偏
    var centerY = (PAD + CARD_H - PAD) / 2;
    var y = centerY - blockH / 2;

    // 眉标：两侧短线夹分类名
    if (eyebrow) {
      ctx.font = "500 24px " + sans;
      ctx.fillStyle = ACCENT;
      ctx.textAlign = "center";
      ctx.fillText(eyebrow, CARD_W / 2, y + 4);
      var tw = ctx.measureText(eyebrow).width;
      var cy = y + eyebrowH / 2 + 2;
      ctx.strokeStyle = "rgba(156,63,46,0.38)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(CARD_W / 2 - tw / 2 - 58, cy);
      ctx.lineTo(CARD_W / 2 - tw / 2 - 18, cy);
      ctx.moveTo(CARD_W / 2 + tw / 2 + 18, cy);
      ctx.lineTo(CARD_W / 2 + tw / 2 + 58, cy);
      ctx.stroke();
      y += eyebrowH + gap1;
    }

    // 正文
    ctx.font = "500 " + fs + "px " + serif;
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], CARD_W / 2, y + i * fs * lh + (fs * lh - fs) / 2);
    }
    y += textH + gap2;

    // 落款
    if (metaText) {
      ctx.font = "400 28px " + serif;
      ctx.fillStyle = INK_SOFT;
      ctx.textAlign = "center";
      ctx.fillText(metaText, CARD_W / 2, y + 4);
    }

    // 底部分隔线 + 页脚
    ctx.strokeStyle = RULE_SOFT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left, CARD_H - PAD - 140);
    ctx.lineTo(right, CARD_H - PAD - 140);
    ctx.stroke();

    ctx.font = "500 22px " + sans;
    ctx.fillStyle = INK_FAINT;
    ctx.textAlign = "left";
    ctx.fillText("每 日 一 句", left, CARD_H - PAD - 100);
    ctx.textAlign = "right";
    ctx.fillText("yiyan.hzxq.asia", right, CARD_H - PAD - 100);

    return canvas;
  }

  function canvasToBlob(canvas) {
    return new Promise(function (resolve, reject) {
      if (canvas.toBlob) {
        canvas.toBlob(function (b) {
          b ? resolve(b) : reject(new Error("toBlob 返回空"));
        }, "image/png");
      } else {
        try {
          var dataUrl = canvas.toDataURL("image/png");
          var bin = atob(dataUrl.split(",")[1]);
          var arr = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          resolve(new Blob([arr], { type: "image/png" }));
        } catch (e) { reject(e); }
      }
    });
  }

  function waitFonts() {
    if (document.fonts && document.fonts.ready) {
      return document.fonts.ready.catch(function () { return null; });
    }
    return Promise.resolve();
  }

  // 推广版文案：多带一行站点署名，粘到微信/QQ 里像样
  function buildShareText(q) {
    q = q || state.current;
    if (!q || !q.text) return "";
    var who = [];
    if (q.author) who.push(q.author);
    if (q.from) who.push("《" + q.from + "》");
    var tail = who.length ? " —— " + who.join(" ") : "";
    return "「" + q.text + "」" + tail + "\n—— 每日一句 · yiyan.hzxq.asia";
  }

  function doShare() {
    if (!state.current) return;
    var q = state.current;
    var text = buildShareText(q);

    // 触屏设备：优先调系统分享，能直接把图片发进微信/QQ 或存相册
    var isTouch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    if (isTouch && navigator.share) {
      toast("正在准备分享…");
      waitFonts().then(function () {
        return canvasToBlob(drawQuoteCard(q));
      }).then(function (blob) {
        var file = null;
        try { file = new File([blob], "每日一句.png", { type: "image/png" }); } catch (e) {}
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
          return navigator.share({ files: [file], title: "每日一句" })
            .catch(function () { throw new Error("cancelled"); });
        }
        throw new Error("no-file-share");
      }).catch(function () {
        // 分享被取消或设备不支持发图 → 退回复制文案
        copyText(text).then(function () { toast("已复制，去微信粘贴"); })
          .catch(function () { toast("复制失败"); });
      });
      return;
    }

    // 桌面：不再弹 Windows 分享面板（里面没有微信），直接复制文案
    copyText(text).then(function () {
      toast("已复制，去微信 / QQ 粘贴");
    }).catch(function () {
      toast("复制失败");
    });
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
        });
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

    // 首次进入：直接取一句
    nextQuote();

    // 事件
    els.newBtn.addEventListener("click", function () { this.blur(); nextQuote(); });
    els.favAddBtn.addEventListener("click", toggleFav);
    els.copyBtn.addEventListener("click", doCopy);
    els.shareBtn.addEventListener("click", doShare);
    els.favBtn.addEventListener("click", function () { renderFavs(); openModal("favModal"); });

    document.querySelectorAll("[data-close]").forEach(function (b) {
      b.addEventListener("click", function () { closeModal(b.getAttribute("data-close")); });
    });

    els.favModal.addEventListener("click", function (e) {
      if (e.target === els.favModal) els.favModal.classList.add("hidden");
    });

    // 键盘：Esc 关闭；空格 / → / Enter / N 换一句（避免在按钮/输入态误触）
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
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
