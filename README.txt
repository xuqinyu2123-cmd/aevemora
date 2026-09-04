AEVEMORA V9.8.1 · Mobile Stable

本版重点修手机端稳定性：
- 修复 Service Worker 仍缓存已不存在 access-config.js 导致安装失败的问题。
- Service Worker 改为逐个容错缓存，不再因某一个资源失败导致整次安装失败。
- 移除 controllerchange 自动刷新，避免微信/手机浏览器出现重复刷新或版本抖动。
- 约 1.8MB 的人物馆藏数据从 index.html 拆到 portrait-data.js，只在结果页需要人物图时加载。
- 手机、微信、QQ、弱网/省流量模式不再访问 Wikipedia/Wikimedia 人物图，直接使用站内人物馆藏。
- 手机答题背景使用本地 SVG，不依赖 Wikimedia。
- HTML 导航 network-first，4.5 秒失败后回退已缓存页面。
- 保留“首次完整测试免费 1 次，第二次申请次数”的 V9.8 逻辑。

上传：解压后把根目录全部内容覆盖上传到 aevemora 仓库根目录。
测试：https://xuqinyu2123-cmd.github.io/aevemora/?v=9.8.1
版本确认：https://xuqinyu2123-cmd.github.io/aevemora/VERSION.txt?v=981
