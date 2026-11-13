# ch-rzl-edit

Rizline 谱面编辑器。支持线节点、Tap / Drag / Hold、Canvas 与 Camera 的 X/Y/缩放/旋转关键帧、BPM、Riztime 主题、线条/判定圈颜色和实时预览。

## 技术栈

- TypeScript 5.6 + 原生 DOM + Canvas 2D
- Vite 6
- Tauri 2（Rust）
- `@tauri-apps/plugin-dialog` / `plugin-fs`
- HTMLAudioElement + Web Audio API（打击音效）
- Bun（包管理与脚本）
- VitePress（文档）

## 快速开始

```bash
bun install
bun run dev        # 浏览器开发模式，固定 1420 端口
bun run tauri dev  # Tauri 桌面开发模式
```

构建：

```bash
bun run build
bun run tauri build
```

## 基本使用

1. 导入音乐，或点击「新建谱面」并选择音乐。
2. 在 BPM 面板设置基础 BPM 与 BPM 变化。
3. 在 `line&note` 模式下用 `R` 添加线节点，`Q` / `W` / `E` 添加 Tap / Drag / Hold。
4. 切换编辑对象模式，编辑 Canvas / Camera 的 X、Y、缩放、旋转关键帧，以及 Riztime、线颜色与判定圈颜色。
5. 按住 `T` 预览，松开恢复；`U` 切换编辑叠加层。
6. 导出谱面 JSON。

## 文档

完整的使用方法、渲染规则与谱面格式：

```bash
bun run docs:dev
bun run docs:build
bun run docs:preview
```

文档入口：`docs/index.md`。

## CI 与发布

- **文档**：`.github/workflows/docs.yml` 在推送到 `main` 时构建 VitePress 并部署到 GitHub Pages。
  - 首次使用需在仓库 **Settings → Pages → Build and deployment** 将 Source 设为 **GitHub Actions**。
  - base 会从 GitHub Pages 配置自动读取：项目站点为 `/<仓库名>/`，绑定自定义域名后为 `/`；如需强制覆盖，可设置仓库变量 `DOCS_BASE`。
- **Release**：`.github/workflows/release.yml` 在推送 `v*` 或数字开头的 tag 时，于 `windows-latest` 构建 NSIS 安装包（`.exe`），并创建 **draft release** 上传产物。

```bash
git tag v0.1.0
git push origin v0.1.0
```

构建完成后到 GitHub Releases 检查草稿并手动发布。

## 目录

```text
src/          编辑器、渲染、文件管理与音效
src-tauri/    Tauri 2 桌面端
docs/         VitePress 文档
public/audio/ 打击音效
```
