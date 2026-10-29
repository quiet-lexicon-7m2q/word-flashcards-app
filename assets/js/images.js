/*!
 * 单词配图地址表（可选，默认是空的）
 * ------------------------------------------------------------------
 * 用途：给每个单词指定「它所指东西的真实照片」地址，前端会优先使用这里的图片。
 *
 * 两种填法：
 *   1) 有网络时跑一次自动抓图脚本（推荐，一次性把整库填满）：
 *        node tools/resolve-images.js              # 全量抓取
 *        node tools/resolve-images.js --limit 50   # 先试 50 个词
 *      它会用维基百科词条配图 / LoremFlickr 关键词照片填满本文件，
 *      同时输出 data/word_images.json 便于入库。
 *   2) 手工填自己的图（本地图片或图床地址都行）：
 *        window.YY_WORD_IMAGES = { apple: 'assets/img/apple.jpg', bank: 'https://.../bank.jpg' };
 *
 * 没填到的单词，前端会按顺序自动找图：
 *   维基百科该词条配图 → LoremFlickr 关键词照片 → 本地生成的 SVG 占位图（保证不出现破图）
 */
window.YY_WORD_IMAGES = {};
