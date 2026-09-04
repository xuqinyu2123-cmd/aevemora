AEVEMORA V9.6.2 · 授权后端已连接版

已完成：
- access-config.js 已写入正式 Cloudflare Worker：
  https://aevemora-access.xuqinyu2123.workers.dev
- 前端授权弹窗现在可以直接调用真实后端。
- purchaseUrl 暂时留空，后续有商品页/联系方式后再填。

部署前确认：
1. Cloudflare Worker 的 CODES / SESSIONS KV 已绑定。
2. ADMIN_SECRET 已设为 Secret。
3. ALLOWED_ORIGINS 已设为：
   https://xuqinyu2123-cmd.github.io
4. 在 Cloudflare 点 Deploy，使变量生效。

然后把本包上传覆盖 GitHub aevemora 仓库。

首次测试：
https://xuqinyu2123-cmd.github.io/aevemora/?v=9.6.2
