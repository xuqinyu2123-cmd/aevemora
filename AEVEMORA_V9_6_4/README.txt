AEVEMORA V9.6.4 · 授权墙锁定版

这版采用 fail-closed：
- 页面加载时授权墙默认就是可见状态，不依赖“开始测试”按钮。
- 没有 Cloudflare 验证结果时，授权墙无法关闭。
- 只有有效 Session 或有效授权码验证成功后才解锁。
- startQuizCore 仍有独立内存令牌保护。
- HTML 不再通过 Service Worker 缓存，杜绝旧 index.html 被离线缓存重新提供。
- 新增 auth-diagnostic.html 用于判断 GitHub 到底部署了什么版本。

上传全部文件后，先打开：
https://xuqinyu2123-cmd.github.io/aevemora/auth-diagnostic.html?v=964

然后打开：
https://xuqinyu2123-cmd.github.io/aevemora/?v=9.6.4

如果正式页没有看到 ACCESS REQUIRED · V9.6.4，
但 diagnostic 页能打开，则说明仓库根目录的 index.html 没被最新文件覆盖。
