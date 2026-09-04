AEVEMORA V9.9.3 · 人物姓名卡修正版

本版专门修复 V9.9.2 手机结果页：
真实人物肖像已经显示，但人物姓名没有显示。

原因：
V9.9.2 中 mobileResultIdentity（人物姓名 / 时代 / 身份 / 相似度）
被错误嵌套到了 portraitWrap 图片容器内部。
portraitWrap 使用固定比例和 overflow:hidden，因此姓名卡被裁掉。

V9.9.3 修复后手机结果页顺序：
真实人物肖像
↓
人物姓名 + 时代 + 类型 + 模式 + 相似度
↓
人物引语
↓
核心维度
↓
深度结果分析

保留：
- Cloudflare 真实肖像代理
- 手机建筑答题布局
- 开发者无限测试
- 首次免费 / 后续授权
- 120 人物匹配库

Cloudflare Worker 不需要重新部署。

版本检查：
https://xuqinyu2123-cmd.github.io/aevemora/VERSION.txt?v=993

手机测试：
https://xuqinyu2123-cmd.github.io/aevemora/?v=9.9.3
