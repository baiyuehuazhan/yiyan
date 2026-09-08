# 每日一句 · Daily Quote

一句值得回味的话，配作者与出处。极简、有意境、纯静态、零构建。

线上访问：https://yiyan.hzxq.asia/

## 特性

- 🎲 **完全随机**：每次打开页面或点「换一句」，都实时从一言**全部分类**里随机取一句（动画/漫画/游戏/文学/原创/网络/其他/影视/诗词/网易云/哲学/抖机灵），不限定分类、不固定某一句。
- 🌅 **每日快照**：GitHub Actions 每天 UTC 22:00 自动存一句快照，供「历史回看」与离线兜底（不再在首页固定展示）。
- 🔄 **兜底不空屏**：实时 API 失败时自动回退到内置语录库，**永不空屏**。
- ⭐ **收藏**：存入浏览器 `localStorage`，可随时回看、删除。
- 📋 **复制 / 分享**：一键复制带出处的句子，或生成分享文案（移动端调用系统分享面板）。
- 📜 **历史回看**：查看过去每天的每日快照。
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
│   └── snapshots/            # 每日快照（供历史回看 / 兜底）
├── .github/workflows/fetch.yml
├── package.json
├── .gitignore
└── README.md
```

## 本地运行

```bash
# 预览
npm start                # 起一个静态服务器 http://localhost:8080

# 手动抓取今天的快照（写入 data/snapshots/）
npm run fetch
```

> 直接双击 `index.html`（file://）会因浏览器的本地文件 CORS 限制无法加载 `data/`，
> 请用 `npm start` 起本地服务器预览。

## 数据源（全部免 key）

- **主源**：[一言 Hitokoto API](https://hitokoto.cn/) `https://v1.hitokoto.cn/?encode=json`
  全部分类随机，返回 `hitokoto` / `from` / `from_who` / `type` / `creator`。
- **兜底 1**：内置 `data/quotes.json`（50–100 条优质语录）。
- **兜底 2**：Actions 每日快照（「历史回看」数据源）。

## 部署（GitHub Pages）

1. 推送到 `main` 分支；
2. 仓库 Settings → Pages → Source 选 `Deploy from a branch` → `main` / `/ (root)`；
3. Actions 每天自动抓取；也可手动 `Actions → 每日快照抓取 → Run workflow` 触发。

## 技术说明

- 纯原生 HTML / CSS / JavaScript，无任何框架、无构建步骤。
- 前端运行时：打开页面即请求一言实时 API（全分类随机）→ 失败回退本地库；`manifest.json` 仅用于「历史回看」。
- 快照格式见 `data/snapshots/YYYY-MM-DD.json`（按北京时间命名）；`manifest.json` 保留最近 60 天。
- 无任何 API key / token，所有外部接口均免鉴权。
