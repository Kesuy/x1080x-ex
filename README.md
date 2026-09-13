# x1080x-ex

面向 `agaghhh.cc` / `hdblog.me` 的 Tampermonkey 增强脚本：一键下载帖子资源、自动整理文件名，并补充 Preview 大图、跨站搜索、批量打开主题等功能。

## 1.10.0：功能开关与设置整理

- `agaghhh.cc` 与 `hdblog.me` 的主要增强功能都可以在各自设置中独立开关。
- 新增 **跨站搜索按钮** 独立开关：agaghhh → hdblog、hdblog → agaghhh。
- hdblog 新增 **搜索结果过滤 / 单结果自动跳转**、**搜索/列表批量打开**、**文章宽度增强** 显式开关。
- hdblog 的 Preview 大图开关同时管理 Pixhost / refer 解析，关闭后不再主动解析或放大 Preview。
- qBittorrent 元数据回退与 FANZA / MGStage 官方 Preview 后备继续保留独立开关。

## 主要功能

- **一键下载**：下载 agaghhh 主楼附件、图片、Preview 大图和磁力链对应的 `.torrent`，不处理回复楼层附件。
- **自动命名**：下载增强内部自动识别番号、清理发布参数、处理 Windows 非法字符，并支持 FC2、1PON、CARIB 等现有规则。
- **Preview 大图**：agaghhh 按番号优先搜索 hdblog；无匹配时可选 FANZA → MGStage 官方后备源。
- **跨站搜索**：两站标题旁显示 `🔍`，按识别出的番号直接搜索另一站；无码日期型番号会自动使用日期型关键字。
- **真实演员查询**：主楼“出演者”为空时，可通过 `av-wiki.net` 查询演员并追加到下载文件名。
- **批量打开主题**：agaghhh 与 hdblog 的列表/搜索页均可独立控制是否显示后台顺序打开按钮。
- **qBittorrent 种子回退**：公共 torrent 缓存均失败时，可选用 qBittorrent 5.2+ 获取 metadata 并导出 `.torrent`，不会正式加入下载列表。

### BT 图片命名

BT 帖会下载主贴全部有效图片，再接上 hdblog Preview，并按总图片数统一编号：

```text
只有 1 张：SVMGM-050.jpg
2 张：     SVMGM-050 A.jpg / SVMGM-050 B.jpg
3 张：     SVMGM-050 A.jpg / SVMGM-050 B.jpg / SVMGM-050 C.jpg
```

超过 26 张会继续使用 `AA`、`AB`……。RAR/附件仍使用清理后的帖子标题命名。

## 设置

### agaghhh.cc：⚙️ x1080x 设置

可独立控制：

- **批量打开帖子功能**
- **下载增强**
- **跨站搜索按钮（🔍）**
- **显示大预览图（hdblog）**
- **官方后备预览图（FANZA / MGStage）**
- **查真实演员信息**
- **qBittorrent 元数据回退**，并配置 WebUI 地址、用户名、密码、metadata 等待时间和登录测试

跨站搜索与下载增强相互独立：即使关闭下载按钮，也可以保留 `🔍` 搜索按钮。

### hdblog.me：⚙️ hdblog 设置

可独立控制：

- **文章宽度增强** + 文章主内容区宽度
- **显示网盘下载区域**
- **图片下载按钮（⬇）**
- **跨站搜索按钮（🔍，搜索 agaghhh）**
- **自动展开 Preview 大图**（同时管理 Pixhost / refer 解析）
- **搜索 / 列表页批量打开主题**
- **搜索结果屏蔽与单结果自动跳转** + 屏蔽关键词
- **额外图床域名**（Preview 图床兼容配置）

两套设置互不混用；hdblog 的搜索屏蔽规则仍会被 agaghhh 的 hdblog Preview 搜索复用。

### qBittorrent 种子回退

启用后需要填写：

1. **WebUI 地址**，例如 `http://127.0.0.1:8080`
2. **用户名**
3. **密码**
4. **等待元数据时间**，默认 60 秒，可设置 10～300 秒

建议先点 **测试 qBittorrent 登录**。当前 metadata 接口要求 qBittorrent **5.2.0+ / WebAPI 2.11.9+**。

```text
公共缓存
  ↓ 全部失败
qBittorrent 登录
  ↓
已有相同任务 → torrents/export
  ↓ 不存在
POST torrents/fetchMetadata → DHT / Tracker / Peer 获取 metadata
  ↓
torrents/saveMetadata → 导出 .torrent
```

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 点击：**[安装 x1080x-ex](https://raw.githubusercontent.com/Kesuy/x1080x-ex/main/dist/x1080x-ex.user.js)**
3. 打开支持的网站并刷新页面。

正式版本也会发布到 [GitHub Releases](https://github.com/Kesuy/x1080x-ex/releases)，Release 附带可直接安装的 `x1080x-ex.user.js`。

首次批量下载时，浏览器可能会询问多文件下载权限，请选择允许。

## 域名设置

脚本元数据使用 `@match *://*/*` 以兼容网站换域名，但业务代码只在允许列表内运行，默认域名为 `agaghhh.cc` 和 `hdblog.me`。

Tampermonkey 菜单提供：

- **⚙️ 设置匹配域名**
- **➕ 添加当前域名**
- **↩️ 重置默认域名**

## 隐私与安全

- 不收集、不上传用户数据，也不会把 qBittorrent 登录信息发送给第三方服务。
- qBittorrent WebUI 地址、用户名和密码保存在 userscript 管理器的脚本专属本地存储中。
- 仅在相应功能开启时访问 hdblog、agaghhh、av-wiki、FANZA、MGStage 或你配置的 qBittorrent WebUI。
- 外部查询失败不会阻断其它独立功能。

## 本地开发

开发或让 Codex / ChatGPT 修改本项目之前，请先阅读 **[AGENTS.md](AGENTS.md)**。其中约定：以后新增的用户可感知、可独立控制功能，原则上都必须提供对应开关，并放入正确的设置面板。

```bash
npm install
npm run check
```

构建产物位于 `dist/x1080x-ex.user.js`。

项目以 [MIT License](LICENSE) 发布。
