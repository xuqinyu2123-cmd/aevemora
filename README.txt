AEVEMORA V9.6.5 · 根目录直传版

这版专门解决“上传了新版但网站仍然没有授权墙”的问题。

关键变化：
- Worker 地址已经直接写入 index.html，不再依赖 access-config.js。
- 授权墙默认显示，未验证无法关闭。
- ZIP 解压后文件直接位于压缩包根目录，不再套 AEVEMORA_V9_x_x 外层文件夹。
- 新增 VERSION.txt，用于确认 GitHub 根目录是否真的更新。

上传时：
1. 解压 ZIP。
2. 进入解压后的目录。
3. 全选里面的 index.html、sw.js、manifest.webmanifest、backgrounds、dossiers 等。
4. 上传到 GitHub aevemora 仓库根目录，覆盖旧文件。
5. 不要把整个文件夹作为一个子目录上传。

部署后先检查：
https://xuqinyu2123-cmd.github.io/aevemora/VERSION.txt?v=965

应该看到：
AEVEMORA V9.6.5 ROOT ACCESS LOCK

然后打开：
https://xuqinyu2123-cmd.github.io/aevemora/?v=9.6.5

正确页面一打开就会看到：
ACCESS REQUIRED · V9.6.5
