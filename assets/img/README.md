# 把单词照片放在这个目录

文件名 = 单词本身，扩展名支持 `.jpg / .jpeg / .png / .webp / .avif / .gif`：

```
assets/img/apple.jpg      → apple 这张卡显示这张照片
assets/img/bank.png       → bank
assets/img/run-1.jpg      → run（同一个词多张图时取第一张）
```

放好后在本项目根目录运行一次：

```bash
node tools/link-local-images.js
```

它会把图片自动挂到 `assets/js/images.js`，并打印「还缺图的单词」清单。

优点：**完全离线可用、不依赖任何图源**，而且画质/版权都由你控制。
一旦这里挂了图，页面就优先用本地图，不再去网上找。
