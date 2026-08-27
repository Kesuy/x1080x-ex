# x1080x-ex

【x1080x 增强】油猴脚本：在 Discuz 帖子标题右侧增加下载按钮，一键下载主楼附件和正文大图，并自动重命名。

## 功能

- 下载**主楼附件**，不会误下载回复楼层的附件。
- 普通帖子根据图片加载后的真实尺寸，下载主楼正文中**面积最大的图片**，不再固定选择第二张。
- 图片优先使用网页已经加载的 `currentSrc/src`；附件和图片先请求为 Blob，再通过隐藏的 `download` 链接按脚本生成的名称保存，避免服务器 URL 或 `Content-Disposition` 重写文件名。
- FC2 帖子下载主楼中的**全部有效大图**，排除表情、头像等小图。
- 识别旧版 Discuz 的 `FC2-PPV-4960963 [BT](FC2)正文标题` 格式：
  - 第一张图命名为 `FC2-4960963 A.jpg`；只有两张时第二张为 `FC2-4960963 B.jpg`。
  - 三张及以上时从第二张起依次为 `FC2-4960963 B1.jpg`、`FC2-4960963 B2.jpg`……
  - 内置 [磁力链接转种子下载](https://github.com/Kesuy/magnet-to-torrent-userscript) 3.3.0 的核心下载与校验逻辑，将种子保存为清理后的帖子标题，例如 `FC2-4960963 正文标题.torrent`。
- 根据帖子标题删除番号之后、正文标题之前的发布参数：
  - `SNOS-325 (HD1080P_60fps)(S1)(snos00325)正文标题`
  - 重命名为 `SNOS-325 正文标题.rar`
- 支持番号位于前置发布参数中的标题：
  - `(HD1080P)(Prestige)(ABF-355)月刊ハメ撮り…`
  - 重命名为 `ABF-355 月刊ハメ撮り….rar`，大图命名为 `ABF-355.jpg`
- 正文标题后续出现的括号会保留。
- 识别 `[中文外掛字幕]` / `[中文外挂字幕]`：
  - `MFYD-080 [中文外掛字幕](...)(mfyd00080)正文标题`
  - 重命名为 `MFYD-080 正文标题[外挂字幕].rar`
- 普通帖子的大图重命名为 `番号.jpg`，例如 `SNOS-325.jpg`。
- 识别 `(HD1080P)(厂牌)(fc4929786)正文标题` 形式的 FC2 标题，附件重命名为 `FC2-4929786 正文标题.rar`。
- FC2 多图依次命名为 `FC2-4929786 (1).jpg`、`FC2-4929786 (2).jpg`……；只有一张时命名为 `FC2-4929786.jpg`。
- 自动转换 Windows 文件名不允许的字符。
- 支持网站更换域名，可在油猴扩展菜单中维护域名列表。

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)（油猴）。
2. 点击安装脚本：
   **[安装 x1080x-ex](https://raw.githubusercontent.com/Kesuy/x1080x-ex/main/dist/x1080x-ex.user.js)**
3. 打开帖子详情页，标题右侧会出现 **“⬇”** 下载按钮。

> 同源 Discuz 附件使用页面请求上下文并携带当前登录状态，跨域图片使用 Tampermonkey 请求；响应验证通过后才会保存到浏览器下载目录。首次批量下载时，浏览器可能会询问下载权限，请选择允许。

种子下载不再依赖另一个 userscript 的按钮或脚本沙箱：直接从 iTorrents/Torrage 多源获取 torrent，解析 bencode 并重新计算 `info` 字典的 SHA-1，只有 infohash 与磁力链 BTIH 完全一致时才保存。

独立安装的 `magnet-to-torrent-userscript` 可照常保留。`x1080x-ex` 不查找、不点击、不移动也不修改它生成的磁力链接、按钮、样式或设置，因此不会影响原脚本布局。

## 网站更换域名时

脚本为了支持未来域名，元数据使用了 `@match *://*/*`，但业务代码只会在允许列表内的域名运行；默认仅允许 `agaghhh.cc`，不会读取或上传其他网站的数据。

在任意网页点击浏览器工具栏中的 Tampermonkey 图标，可使用：

- **⚙️ 设置匹配域名**：输入一个或多个域名，也可粘贴完整网址；支持逗号、空格或换行分隔。
- **➕ 添加当前域名**：将正在浏览的网站加入允许列表。
- **↩️ 重置默认域名**：恢复为 `agaghhh.cc`。

保存后刷新页面即可生效。配置的主域名也允许其子域名。

## 文件命名示例

| 原帖子标题 | 下载后的附件名 |
|---|---|
| `SNOS-325 (HD1080P_60fps)(S1)(snos00325)スーパー絶倫… 桜乃りの` | `SNOS-325 スーパー絶倫… 桜乃りの.rar` |
| `DLDSS-504 (HD1080P)(DAHLIA)(1dldss00504)‘変態適齢期’第二章―。…` | `DLDSS-504 ‘変態適齢期’第二章―。….rar` |
| `MFYD-080 [中文外掛字幕](HD1080P_60fps)(溜池ゴロー)(mfyd00080)近所に住む…` | `MFYD-080 近所に住む…[外挂字幕].rar` |
| `(HD1080P)(Hello World)(fc4929786)『TV局7社內定…』` | `FC2-4929786 『TV局7社內定…』.rar` |
| `(HD1080P)(Prestige)(ABF-355)月刊ハメ撮り…` | `ABF-355 月刊ハメ撮り….rar` |

## 兼容性说明

脚本兼容常见 Discuz 页面结构，包括：

- 标题：`#thread_subject`
- 主楼正文：`#postlist` 中的第一个 `post_*` / `postmessage_*`
- 附件：`forum.php?mod=attachment` 与 `attachment.php`
- 图片：优先使用已加载的 `currentSrc/src`；`zoomfile`、`file`、图片外层链接和 `data-original` 用于识别或后备定位

如果网站模板发生较大变化，请提交 Issue，并附上**已脱敏**的网页 HTML；不要上传 Cookie、账号信息或其他凭据。

## 本地开发

```bash
npm install
npm test
npm run build
npm run smoke
npm run check
```

构建产物位于 `dist/x1080x-ex.user.js`。

## 隐私与安全

- 不收集、不上传任何数据。
- 不包含 Cookie、账号或网站凭据。
- 下载请求由 Tampermonkey 在当前登录会话中执行。
- 项目以 [MIT License](LICENSE) 发布。
