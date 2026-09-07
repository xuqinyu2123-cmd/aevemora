AEVEMORA V10.0.0 · 120 人物真实肖像本地化

项目类型：无需构建步骤的静态 PWA。

V10.0.0 主要变化：
- 120 位人物按现有顺序获得稳定 ID（P001—P120）。
- 118 位人物具备经身份与许可核验的本地 WebP 主图和缩略图。
- P043 李时珍、P059 邓稼先因候选图片质量不足保留为网络回退。
- 主肖像：本地 main → Cloudflare → Wikipedia → portrait-data → SVG。
- Top 5：本地 thumb → Cloudflare → SVG。
- 分享海报优先使用本地 main。
- Service Worker 只在实际访问时缓存肖像，不在安装阶段全量下载。

关键文件：
- index.html：正式页面、人物与题目数据、加载链路。
- portrait-manifest.js：按稳定 ID 索引的本地肖像清单。
- portrait-person-list.csv：120 位人物资料与维基标题。
- portrait-licenses.csv：118 张本地肖像的来源与许可记录。
- portrait-todo.csv：2 个未本地化人物及原因。
- portrait-data.js：保留的既有馆藏卡兜底数据。
- sw.js：应用壳与本地肖像运行时缓存。
- scripts/validate-v10.mjs：V10 自动验证脚本。

本地运行：
python -m http.server 8000

打开：
http://127.0.0.1:8000/

验证：
node scripts/validate-v10.mjs

本版本只在 v10-local-portraits 分支开发，不自动合并或部署到 main。
