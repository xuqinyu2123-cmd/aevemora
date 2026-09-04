AEVEMORA V9.8.9 · Developer Mode

新增：
- /developer.html 开发者设备授权页。
- 输入 ADMIN_SECRET 一次，由 Cloudflare Worker 生成长期 developer session。
- 开发模式不限测试次数，不消耗免费次数，不要求测试授权码。
- developer session 默认可设置 365 天，且与浏览器 deviceId 绑定。
- ADMIN_SECRET 不写入浏览器存储。
- 前端升级版本时保留 developer session。
- 普通用户访问逻辑完全不变。

必须同时部署 AEVEMORA_ACCESS_WORKER_V1_1_DEV 的 worker.js，否则 /admin/dev-session 不存在。

开发者入口：
https://xuqinyu2123-cmd.github.io/aevemora/developer.html
