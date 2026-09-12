# x1080x-ex

面向 `agaghhh.cc` / `hdblog.me` 的 Tampermonkey 增强脚本：一键下载帖子资源、自动整理文件名，并补充 Preview 大图、批量打开主题等功能。

## 主要功能

- **一键下载**：下载主楼附件、封面图和 Preview 大图，不处理回复楼层附件。
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

`hdblog.me` 继续使用独立的 **⚙️ hdblog 设置**，两套设置互不混用。

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 点击：**[安装 x1080x-ex](https://raw.githubusercontent.com/Kesuy/x1080x-ex/main/dist/x1080x-ex.user.js?v=1.9.1)**
3. 打开支持的网站并刷新页面。

首次批量下载时，浏览器可能会询问多文件下载权限，请选择允许。

## 域名设置

脚本元数据使用 `@match *://*/*` 以兼容网站换域名，但业务代码只在允许列表内运行，默认域名为 `agaghhh.cc` 和 `hdblog.me`。

Tampermonkey 菜单提供：

- **⚙️ 设置匹配域名**
- **➕ 添加当前域名**
- **↩️ 重置默认域名**

## 隐私与安全

- 不收集、不上传用户数据，也不保存 Cookie、账号或网站凭据。
- 下载请求由 Tampermonkey 在当前浏览器环境中执行。
- 仅在相应功能开启时访问 hdblog、av-wiki、FANZA 或 MGStage。
- 外部查询失败不会阻断原有附件/封面下载。

## 本地开发

```bash
npm install
npm run check
```

构建产物位于 `dist/x1080x-ex.user.js`。

项目以 [MIT License](LICENSE) 发布。
