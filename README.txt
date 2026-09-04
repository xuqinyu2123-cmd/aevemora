AEVEMORA V9.8.2 · Scene Stable

本版专门修复答题页左侧图片“消失/只剩很暗轮廓”的问题。

修复：
- 左侧 dossier 本地图立即显示，不再等待 Wikimedia 超时。
- 本地 fallback 明显提亮，手机端也能看清。
- 网络允许时，真实历史史料图在后台加载成功后再平滑替换。
- 网络不通时始终保留本地图，不再出现空白。
- 省流量 / 2G / 3G 模式完全不请求外部大图。
- 保留 V9.8.1 手机稳定版的拆包、按需人物库、Service Worker 修复。

版本检查：
https://xuqinyu2123-cmd.github.io/aevemora/VERSION.txt?v=982

正式测试：
https://xuqinyu2123-cmd.github.io/aevemora/?v=9.8.2
