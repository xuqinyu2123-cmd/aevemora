AEVEMORA V9.6.3 · 强制授权修正版

修复：
- 开始测试不再直接进入答题。
- 所有“开始测试”按钮改用全新 requestQuizAccess()。
- 任何遗留 startQuiz() 调用都会转到授权入口。
- startQuizCore() 本身增加一次性内存授权令牌，没有令牌即使被误调用也只会打开授权弹窗。
- 授权存储键升级为 aevemora_access_v2，旧授权状态不会被沿用。
- 第一次加载 V9.6.3 自动清理旧 AEVEMORA/HISTORIA CacheStorage。
- access-config.js 改成 network-first。
- 授权弹窗会明确显示 V9.6.3，方便确认浏览器真的加载了新版。

Worker 已连接：
https://aevemora-access.xuqinyu2123.workers.dev

上传：
把本包全部覆盖到 GitHub aevemora 仓库。

首次测试：
https://xuqinyu2123-cmd.github.io/aevemora/?v=9.6.3

正常流程：
开始测试 → ACCESS TO THE ARCHIVE · V9.6.3 → 输入授权码 → 验证成功 → 第 1 题
