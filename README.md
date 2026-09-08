# 每日一句 · Daily Quote

一句值得回味的话，配作者与出处。极简、有意境、纯静态、零构建。

线上访问：https://yiyan.hzxq.asia/

## 特性

- 🌅 **今日精选**：GitHub Actions 每天 UTC 22:00 用一言 API 取一句存为快照，离线/限流也能看。
- 🔄 **换一句**：优先实时调用一言 API，失败自动回退到内置语录库，**永不空屏**。
- ⭐ **收藏**：存入浏览器 `localStorage`，可随时回看、删除。
- 📋 **复制 / 分享**：一键复制带出处的句子，或生成分享文案（移动端调用系统分享面板）。
- 📜 **历史回看**：查看过去每天的「今日精选」。
- 🎨 **意境视觉**：柔和渐变背景、充足留白、优雅衬线大字；每次换句背景色在同一浅色系内轻微变化。
- 📱 **真·移动端适配**：禁缩放、适配刘海安全区、触控 ≥ 44px、无横向滚动。

## 目录结构

```
daily-quote/
├── index.html
├── assets/
│   ├── css/style.css
│   └── js/app.js
├── scripts/
│   └── fetch.js              # 抓取脚本（Actions / 本地复用）
├── data/
│   ├── manifest.json         # 快照倒序清单 + updatedAt
│   ├── quotes.json           # 内置离线语录库（兜底）
│   └── snapshots/            # 每日「今日精选」快照
├── .github/workflows/fetch.yml
├── package.json
├── .gitignore
└── README.md
```

## 本地运行

```bash
# 预览
npm start                # 起一个静态服务器 http://localhost:8080

# 手动生成今天的今日精选（写入 data/snapshots/）
npm run fetch
```

> 直接双击 `index.html`（file://）会因浏览器的本地文件 CORS 限制无法加载 `data/`，
> 请用 `npm start` 起本地服务器预览。

## 数据源（全部免 key）

- **主源**：[一言 Hitokoto API](https://hitokoto.cn/) `https://v1.hitokoto.cn/?c=a&c=d&c=i&c=k`
  返回 `hitokoto` / `from` / `from_who` / `type` / `creator`。
- **兜底 1**：内置 `data/quotes.json`（50–100 条优质语录）。
- **兜底 2**：Actions 每日快照，前端优先展示「今日精选」。

## 部署（GitHub Pages）

1. 推送到 `main` 分支；
2. 仓库 Settings → Pages → Source 选 `Deploy from a branch` → `main` / `/ (root)`；
3. Actions 每天自动抓取；也可手动 `Actions → 每日精选抓取 → Run workflow` 触发。

## 技术说明

- 纯原生 HTML / CSS / JavaScript，无任何框架、无构建步骤。
- 前端运行时：先读 `manifest.json` → 展示最新今日精选 → 「换一句」走实时 API → 全失败回退本地库。
- 快照格式见 `data/snapshots/YYYY-MM-DD.json`；`manifest.json` 保留最近 60 天。
- 无任何 API key / token，所有外部接口均免鉴权。
