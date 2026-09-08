#!/usr/bin/env node
/**
 * 每日抓取一句快照（供「历史回看」，不再默认展示）：
 *   1. 调用一言 API（免 key、全分类随机）取 1 条；
 *   2. 失败则从内置 data/quotes.json 随机取 1 条；
 *   3. 写 data/snapshots/YYYY-MM-DD.json（UTC 日期）；
 *   4. 重建 data/manifest.json（倒序、保留最近 60 天）。
 * 同时供 GitHub Actions 与本地 node scripts/fetch.js 使用。
 */
"use strict";

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const SNAPSHOTS_DIR = path.join(DATA_DIR, "snapshots");
const MANIFEST_PATH = path.join(DATA_DIR, "manifest.json");
const QUOTES_PATH = path.join(DATA_DIR, "quotes.json");

// 全分类随机（不再限定 a/d/i/k）：动画/漫画/游戏/文学/原创/网络/其他/影视/诗词/网易云/哲学/抖机灵
const API = "https://v1.hitokoto.cn/?encode=json";
const KEEP_DAYS = 60;

// 一言分类字母 → 中文
const TYPE_MAP = {
  a: "动画", b: "漫画", c: "游戏", d: "文学", e: "原创", f: "来自网络",
  g: "其他", h: "影视", i: "诗词", j: "网易云", k: "哲学", l: "抖机灵"
};

function utcDateStr(d) {
  d = d || new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function log(...a) { console.log("[fetch]", ...a); }

function fetchHitokoto() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  return fetch(API, {
    headers: { "User-Agent": "daily-quote-bot", Accept: "application/json" },
    signal: ctrl.signal
  })
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .finally(() => clearTimeout(timer))
    .then((d) => ({
      text: d.hitokoto,
      from: d.from || "",
      author: d.from_who || "",
      type: TYPE_MAP[d.type] || d.type || "",
      source: "hitokoto"
    }));
}

function randomLocalQuote() {
  let quotes = [];
  try {
    const raw = JSON.parse(fs.readFileSync(QUOTES_PATH, "utf8"));
    quotes = raw.quotes || [];
  } catch (e) {
    log("读取 quotes.json 失败:", e.message);
  }
  if (!quotes.length) return null;
  const q = quotes[Math.floor(Math.random() * quotes.length)];
  return {
    text: q.text,
    from: q.from || "",
    author: q.author || "",
    type: q.type || "",
    source: "local"
  };
}

function pickQuote() {
  return fetchHitokoto()
    .then((q) => {
      log("已从一言 API 取到句子");
      return q;
    })
    .catch((err) => {
      log("一言 API 失败，回退本地库:", err.message);
      const q = randomLocalQuote();
      if (!q) throw new Error("本地语录库也为空");
      return q;
    });
}

function rebuildManifest() {
  if (!fs.existsSync(SNAPSHOTS_DIR)) return;
  const files = fs.readdirSync(SNAPSHOTS_DIR).filter((f) => f.endsWith(".json"));
  const entries = [];
  for (const f of files) {
    const date = f.replace(/\.json$/, "");
    let quote = null;
    try {
      const obj = JSON.parse(fs.readFileSync(path.join(SNAPSHOTS_DIR, f), "utf8"));
      quote = obj.quote || null;
    } catch (e) { continue; }
    entries.push({ date, file: `data/snapshots/${f}`, quote });
  }
  entries.sort((a, b) => (a.date < b.date ? 1 : -1));
  const trimmed = entries.slice(0, KEEP_DAYS);
  const manifest = {
    updatedAt: new Date().toISOString(),
    count: trimmed.length,
    snapshots: trimmed
  };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  log(`manifest 已更新：共 ${trimmed.length} 条快照`);
}

function main() {
  const date = utcDateStr();
  const snapPath = path.join(SNAPSHOTS_DIR, `${date}.json`);

  if (fs.existsSync(snapPath)) {
    log(`${date} 的快照已存在，跳过写入（保持幂等）`);
    rebuildManifest();
    return;
  }

  pickQuote()
    .then((quote) => {
      const snapshot = {
        generatedAt: new Date().toISOString(),
        date,
        quote,
        source: quote.source
      };
      if (!fs.existsSync(SNAPSHOTS_DIR)) fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
      fs.writeFileSync(snapPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
      log(`已写入快照: data/snapshots/${date}.json`);
      rebuildManifest();
    })
    .catch((err) => {
      console.error("[fetch] 致命错误:", err.message);
      process.exit(1);
    });
}

main();
