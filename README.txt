AEVEMORA V9.9.0 · 真实肖像优先版

修复：
- 手机端不再直接使用 portrait-data.js 的黑色抽象人物卡。
- 结果页第一名和 Top 5 均优先加载真实历史人物肖像。
- 图片由 aevemora-access Cloudflare Worker /portrait 代理。
- 用户手机无需直接访问 Wikipedia/Wikimedia。
- 代理失败时才尝试 Wikipedia 直连；最终才使用本地馆藏风格兜底卡。
- 手机答题阶段只预热第一名候选，不增加明显流量。
- 保留 V9.8.9 开发者无限测试、Mobile Compact、建筑档案场景。

部署顺序：
1. 先部署 AEVEMORA Access Worker V1.2。
2. 再上传本前端到 GitHub Pages 根目录。

版本检查：
https://xuqinyu2123-cmd.github.io/aevemora/VERSION.txt?v=990

正式测试：
https://xuqinyu2123-cmd.github.io/aevemora/?v=9.9.0
