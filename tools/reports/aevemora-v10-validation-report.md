# AEVEMORA V10.0 肖像本地化与验证报告

生成日期：2026-09-07
工作分支：`v10-local-portraits`
基线提交：`cba8e347735f7f858a10e0f817b1dbb6035f28bc`（当前 `main`）

## 结论

V10.0 已为现有 120 位历史人物建立 P001—P120 稳定 ID，并完成 118 位人物的真实肖像本地化。2 位人物因可靠自由许可候选图的分辨率或画面质量不达标，已进入明确 TODO，并继续使用既有网络与馆藏卡回退。题目、人物模型、评分函数和基线排名输出均未改变。

本次工作没有修改或删除任何 `AEVEMORA_V9_*` 历史目录，没有合并到 `main`，没有部署。

## 项目扫描结论

- 项目类型：无构建步骤的静态 HTML/CSS/JavaScript PWA。
- 实际人物数：120，其中中国人物 60、外国人物 60。
- 人物主数据：`index.html` 中的 `PEOPLE` 常量。
- 题目数据：`index.html` 中的 `QUESTIONS` 常量，共 36 题。
- 稳定 ID：人物现按原顺序持久化为 P001—P120；运行时主流程与观察器均使用人物 ID，不再临时用数组下标生成编号。
- 既有兜底库：`portrait-data.js`，1,871,347 字节，内容相对 V9.9.3 基线未改变。
- 外部服务：`owner-config.js` 中的 `ACCESS_CONFIG.apiBase` 指向 Cloudflare Worker；无数据库、包管理器或编译步骤。

## V10 加载链路

### 主肖像

1. `portrait-manifest.js` 按稳定 ID 查找 `portraits/Pxxx/main.webp`。
2. 本地文件失败或该人物为 TODO 时，请求 Cloudflare `/portrait?lang=...&title=...&size=760`。
3. Worker 图片加载失败时，临时绕过 Worker，尝试 Wikipedia 页面图片 API / 搜索 /摘要接口。
4. 外部图仍失败时，按需载入未修改的 `portrait-data.js` 馆藏卡。
5. 最终使用本地生成式 SVG 占位卡，避免空白。

### Top 5

1. IntersectionObserver 进入预加载范围后，按 ID 加载 `thumb.webp`。
2. 本地缩略图失败或缺失时请求 Cloudflare Worker。
3. Worker 图片失败时直接使用 SVG 占位卡；Top 5 不下载 640×800 主图，也不直连 Wikipedia。

### 分享海报与预热

- 分享海报优先读取获胜人物的本地 `main.webp`，再复用页面当前图和原有回退。
- 前 30 题不预热人物图；最后 6 题只按当前排名预热移动端 Top 1 / 桌面端 Top 3 的本地主图。
- Service Worker 安装阶段不列举肖像。每张同源肖像首次实际访问后才进入独立的 `aevemora-v10-portraits-20260907` 缓存。

## 肖像与许可统计

| 项目 | 结果 |
|---|---:|
| 本地人物 | 118 |
| TODO 人物 | 2 |
| WebP 文件 | 236 |
| 主图规格 | 640×800 |
| 缩略图规格 | 240×300 |
| 主图总大小 | 8,578,166 B |
| 主图平均大小 | 72,696 B |
| 主图最大值 | 243,870 B（P064） |
| 缩略图总大小 | 1,215,764 B |
| 缩略图平均大小 | 10,303 B |
| 缩略图最大值 | 35,362 B（P064） |
| 肖像资源合计 | 9,793,930 B |

许可分布：

| 许可 | 数量 |
|---|---:|
| Public Domain | 104 |
| CC0 | 1 |
| CC BY 2.0 / 2.5 / 3.0 / 4.0 | 6 |
| CC BY-SA 2.0 / 4.0 | 6 |
| Attribution（LANL） | 1 |

所有 118 条许可记录都标记为允许商业使用。13 条需要署名的记录已保留作者、许可链接和来源页，结果页主肖像会展示可点击的许可来源。逐项记录见 `portrait-licenses.csv`。

## 身份与图像 QA

- 所有人物先通过中/英文维基精确标题关联 Wikidata，再读取 P18 对应的 Wikimedia Commons 文件。
- 对来源页、作者、许可、原图 URL、Wikidata 身份链和处理说明逐项留档。
- 使用确定性的裁切、缩放、轻微对比度调整和 WebP 编码；没有使用 AI 生成、重绘、演员剧照或中文文件名。
- 对 5 张全量接触表进行了人物身份、裁切和明显重复人工复核，并对孔子、老子、韩信、李世民、武则天、拿破仑等构图进行二次修正。
- 自动检查未发现完全重复的二进制文件；下载流程的感知哈希检查未发现近重复候选。

## TODO

| ID | 人物 | 原因 | 当前行为 |
|---|---|---|---|
| P043 | 李时珍 | Commons 可靠候选原图仅 232×283，不满足 640×800 主图质量 | Cloudflare → Wikipedia → portrait-data → SVG |
| P059 | 邓稼先 | 明确自由许可候选分辨率有限且带大面积手写文字 | Cloudflare → Wikipedia → portrait-data → SVG |

## 自动验证

执行命令：`node scripts/validate-v10.mjs`

结果：36 / 36 通过。覆盖范围包括：

- 分支与 `main` 基线隔离。
- 120 人物数量、顺序 ID、唯一性和 60/60 地区分布。
- 人物其余字段、36 题、`normalize`、`similarity`、`rank` 源码不变。
- 6 组固定用户画像 × 3 种匹配模式的完整排名输出不变。
- 人物 CSV、manifest、许可 CSV、TODO CSV 的数量与集合闭合。
- 236 个文件的路径、WebP 格式、精确尺寸、大小上限、中文文件名和完全重复检查。
- `portrait-data.js` 相对基线不变。
- 主图、Top 5、海报和 Service Worker 链路静态检查。
- 生产 JavaScript 语法与本地 HTTP 关键资源加载。
- V9.x 历史目录未修改。

## 真实浏览器验证

- 桌面结果页：获胜人物 P114 荣格命中 `./portraits/P114/main.webp`，自然尺寸 640×800，许可来源可见。
- 桌面 Top 5：5 张图片均命中各自 `thumb.webp`，自然尺寸全部为 240×300。
- TODO 回退：P043 李时珍没有本地 manifest 记录，实际成功命中 AEVEMORA Cloudflare Portrait Proxy。
- Service Worker：页面受控；肖像缓存从 6 条增至 7 条，仅由一次显式图片访问触发。
- 移动视口 390×844：本地主图、许可条和人物姓名卡均可见；姓名卡位于肖像容器下方。
- 海报加载：成功读取获胜人物本地 640×800 主图。
- 未发现运行时 JavaScript 错误；浏览器仅报告既有的 `/favicon.ico` 404，本任务未触碰无关图标链路。

## 主要改动文件

- `index.html`：稳定人物 ID、本地优先加载、Top 5 缩略图链路、海报、末段预热、许可来源 UI、V10 版本号。
- `portrait-manifest.js`：118 位人物的 ID → 本地主图/缩略图/许可元数据。
- `portraits/Pxxx/`：118 组主图与缩略图。
- `portrait-person-list.csv`：120 位人物完整清单。
- `portrait-licenses.csv`：118 条来源与许可记录。
- `portrait-todo.csv`：2 条质量阻塞记录。
- `sw.js`：按访问缓存肖像的独立运行时缓存。
- `scripts/localize-portraits.py`：可重复的合规采集、身份校验、图像处理与报告生成。
- `scripts/validate-v10.mjs`：36 项自动验证。
- `tools/portrait-overrides.json`：人工审阅后的来源、裁切与跳过决策。
- `tools/baselines/v9.9.3-ranking-baseline.json`：修改前数据和排名基线。
- `manifest.webmanifest`、`VERSION.txt`、`README.txt`：V10 元数据与运行说明。

## 剩余风险

- P043、P059 仍依赖外部链路；本地化率为 98.33%，不是 100%。只有在获得更高质量且许可明确的原图后，才应将其 manifest `local` 标记为 true。
- 历史人物的传统画像属于后世艺术表现，并非摄影意义上的身份实证；记录保证的是来源链、题名与许可的一致性。
- 第三方来源页面或许可说明未来可能变化，交付时保留 CSV 是必要的审计依据。
