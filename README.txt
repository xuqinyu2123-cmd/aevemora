AEVEMORA V9.5 · 新地址迁移版

目标正式地址：
https://xuqinyu2123-cmd.github.io/aevemora/

为什么要迁移：
旧地址 /historia-test/ 已经被部分手机浏览器、微信内置浏览器和早期 PWA 缓存过多次。
新建 /aevemora/ 仓库后，会获得全新的 GitHub Pages 路径与 Service Worker scope，从根源上隔离旧 HISTORIA 缓存。

V9.5 已经同步做了这些隔离：
- 新 Service Worker cache key
- manifest 新增独立 PWA id
- localStorage 从 historia_* 改为 aevemora_v95_*
- 分享按钮固定分享新正式地址，而不是带 ?v= 的临时测试地址
- canonical / Open Graph URL 指向新地址

GitHub 操作：
1. 新建 Public 仓库：aevemora
2. 解压本包。
3. 把包内所有文件/文件夹上传到 aevemora 仓库根目录，不要再套一层文件夹。
4. Commit changes。
5. Settings → Pages → Deploy from a branch → main / (root) → Save。
6. 等 github-pages 绿色部署完成。
7. 打开：https://xuqinyu2123-cmd.github.io/aevemora/

手机端：
以后只保存和分享新地址，不再使用 /historia-test/。
如果手机桌面以前添加过旧 HISTORIA / AEVEMORA PWA，建议删除旧图标，再从新地址重新“添加到主屏幕”。
