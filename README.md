# x1080x-ex

面向 `agaghhh.cc` / `hdblog.me` 的 Tampermonkey 增强脚本。

## 主要功能

- **一键下载**：下载 agaghhh 主楼附件、图片、Preview 大图，并将磁力链转换为 `.torrent`。
- **下载保护**：下载进行中在浏览器标签标题显示“⬇ 下载中”，关闭标签页时弹出浏览器确认提示，完成后自动恢复。
- **自动命名**：自动识别番号、清理标题并处理 Windows 非法字符，支持 FC2、1PON、CARIB 等规则。
- **Preview 大图**：agaghhh 按番号从 hdblog 获取 Preview；hdblog 无结果时可使用 FANZA / MGStage 官方后备源。
- **Pixhost 解析**：自动解析 Preview 原图，并对 `pixhost.to` / `pixhost.cc` 等同一资源进行去重。
- **跨站搜索**：agaghhh 与 hdblog 标题旁提供 `🔍`，可按番号直接搜索另一站。
- **真实演员查询**：主楼演员信息为空时，可通过 av-wiki 查询并补充到下载文件名。
- **批量打开**：列表和搜索页支持顺序后台打开主题。
- **搜索增强**：支持关键词过滤、搜索结果仅 1 个主题时自动跳转。
- **qBittorrent 回退**：公共 torrent 缓存失败时，可通过 qBittorrent 5.2+ 获取 metadata 并导出 `.torrent`。

### BT 图片命名

```text
1 张：SVMGM-050.jpg
2 张：SVMGM-050 A.jpg / SVMGM-050 B.jpg
3 张：SVMGM-050 A.jpg / SVMGM-050 B.jpg / SVMGM-050 C.jpg
```

超过 26 张继续使用 `AA`、`AB`……。

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)
2. 点击 **[安装 x1080x-ex](https://raw.githubusercontent.com/Kesuy/x1080x-ex/main/dist/x1080x-ex.user.js)**
3. 打开支持的网站并刷新页面

正式版本也会发布到 [GitHub Releases](https://github.com/Kesuy/x1080x-ex/releases)。

## 设置

### agaghhh.cc

通过 **⚙️ x1080x 设置** 可独立控制：

- 下载增强
- 下载时保护标签页（默认开启）
- Preview 大图
- 官方 Preview 后备源
- 跨站搜索
- 搜索单结果自动跳转
- 批量打开帖子（默认随机间隔 1.8–3.5 秒，可自定义并恢复默认）
- 真实演员查询
- qBittorrent metadata 回退

### hdblog.me

通过 **⚙️ hdblog 设置** 可控制：

- 文章宽度
- Preview 大图展开
- 图片下载按钮
- 下载时标记标签页并在关闭时提醒（默认开启）
- 跨站搜索
- 搜索结果过滤与自动跳转
- 批量打开主题（默认随机间隔 0.8–1.6 秒，可自定义并恢复默认）
- 额外图床域名

## 域名

默认支持：

- `agaghhh.cc`
- `hdblog.me`

Tampermonkey 菜单可使用 **设置匹配域名 / 添加当前域名 / 重置默认域名** 管理站点域名。

## 本地开发

修改项目之前请先阅读 [AGENTS.md](AGENTS.md)。

```bash
npm install
npm run check
```

构建产物：`dist/x1080x-ex.user.js`

[MIT License](LICENSE)
