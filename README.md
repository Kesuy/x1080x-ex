# x1080x-ex

面向 `agaghhh.cc` / `hdblog.me` 的 Tampermonkey 增强脚本：一键下载帖子资源、自动整理文件名，并补充 Preview 大图、批量打开主题等功能。

## 1.9.2：种子下载增强

- 修正 Torrage 的 torrent 获取接口，并增加 BTCache 作为公共缓存后备源。
- 公共缓存全部失败后，可选用 **qBittorrent 5.2+ / WebAPI 2.11.9+** 从 DHT / Tracker / Peer 获取磁力 metadata 并导出 `.torrent`。
- qBittorrent 中已经存在相同任务时，优先通过 `torrents/export` 直接导出；不存在任务时使用 `POST torrents/fetchMetadata` + `torrents/saveMetadata`，不会把磁力正式加入下载列表。
- qBittorrent 5.2.x 登录同时兼容 HTTP `200` / `204` 响应，导出的 torrent 仍会重新校验 BTIH。
- 在 **⚙️ x1080x 设置** 中新增 qBittorrent WebUI 地址、用户名、密码、metadata 等待时间和登录测试。

## 主要功能

- **一键下载**：下载主楼附件、封面图、Preview 大图和磁力链对应的 `.torrent`，不处理回复楼层附件。
- **种子回退**：优先查询公共 torrent 缓存；缓存均不可用时，可通过你自己的 qBittorrent 获取 metadata 并导出种子。
- **自动命名**：自动识别番号、清理发布参数、处理外挂字幕和 Windows 非法字符；FC2 保留专用多图/种子命名逻辑。
- **Preview 大图**：`agaghhh.cc` 按番号优先搜索 `hdblog.me`，并复用 hdblog 的“搜索结果屏蔽关键词”；hdblog 无可用 Preview 时可继续尝试 **FANZA → MGStage** 官方后备源。
- **真实演员查询**：主楼“出演者”为空时，可通过 `av-wiki.net` 查询演员并追加到附件/标题型文件名；查询失败自动回退原命名。
- **批量打开主题**：列表页可按页面顺序在后台逐个打开当前页主题，并自动控制打开间隔。
- **hdblog 页面增强**：保留独立的 hdblog 设置、Preview/图床/refer 兼容和搜索结果过滤逻辑。

### 图片命名

普通番号没有外部 Preview 时，封面仍命名为 `番号.jpg`。

存在 Preview 时：

```text
SVMGM-050 A.jpg      # agaghhh 原帖封面
SVMGM-050 B.jpg      # 只有 1 张 Preview
```

如果有多张 Preview：

```text
SVMGM-050 A.jpg
SVMGM-050 B1.jpg
SVMGM-050 B2.jpg
SVMGM-050 B3.jpg
...
```

RAR/附件仍使用清理后的帖子标题命名，不受 A/B 图片命名影响。

## 设置

`agaghhh.cc` 使用独立的 **⚙️ x1080x 设置**：

- 批量打开帖子功能
- 下载增强
- 显示大预览图
- 官方后备预览图（FANZA / MGStage）
- 查真实演员信息
- qBittorrent 种子回退

### qBittorrent 种子回退

公共种子缓存无法命中时，如需继续把 magnet 恢复成 `.torrent`，可在 **⚙️ x1080x 设置** 中启用 qBittorrent 回退并填写：

1. **WebUI 地址**：例如 `http://127.0.0.1:8080`
2. **用户名**：你的 qBittorrent WebUI 用户名
3. **密码**：你的 qBittorrent WebUI 密码
4. **等待元数据时间**：默认 60 秒，可设置 10～300 秒

建议先点 **测试 qBittorrent 登录**。当前元数据接口要求 qBittorrent **5.2.0+ / WebAPI 2.11.9+**。

种子下载流程为：

```text
公共缓存
  ↓ 全部失败
qBittorrent 登录
  ↓
已有相同任务 → torrents/export → 导出 .torrent
  ↓ 不存在
POST torrents/fetchMetadata → DHT / Tracker / Peer 获取 metadata
  ↓
torrents/saveMetadata → 导出 .torrent
```

整个回退过程只请求 metadata，不会把磁力正式加入 qBittorrent 下载列表。

`hdblog.me` 继续使用独立的 **⚙️ hdblog 设置**，两套设置互不混用。

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 点击：**[安装 x1080x-ex](https://raw.githubusercontent.com/Kesuy/x1080x-ex/main/dist/x1080x-ex.user.js?v=1.9.2)**
3. 打开支持的网站并刷新页面。

首次批量下载时，浏览器可能会询问多文件下载权限，请选择允许。

## 域名设置

脚本元数据使用 `@match *://*/*` 以兼容网站换域名，但业务代码只在允许列表内运行，默认域名为 `agaghhh.cc` 和 `hdblog.me`。

Tampermonkey 菜单提供：

- **⚙️ 设置匹配域名**
- **➕ 添加当前域名**
- **↩️ 重置默认域名**

## 隐私与安全

- 不收集、不上传用户数据，也不会把 qBittorrent 登录信息发送给第三方服务。
- 如果启用 qBittorrent 回退，WebUI 地址、用户名和密码会保存在 Tampermonkey / Violentmonkey 的**脚本专属本地存储**中，仅用于连接你配置的 qBittorrent WebUI。
- 下载请求由 Tampermonkey 在当前浏览器环境中执行。
- 仅在相应功能开启时访问 hdblog、av-wiki、FANZA、MGStage 或你配置的 qBittorrent WebUI。
- 外部查询失败不会阻断原有附件/封面下载；种子缓存失败且未启用 qBittorrent 时只会报告种子下载失败。
- 若 qBittorrent WebUI 暴露在局域网或公网，建议仅允许可信网络访问，公网场景优先使用 HTTPS。

## 本地开发

```bash
npm install
npm run check
```

构建产物位于 `dist/x1080x-ex.user.js`。

项目以 [MIT License](LICENSE) 发布。
