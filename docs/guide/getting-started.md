# 快速开始

## 环境要求

- **Node.js 18+** 或 **Bun 1.1+**
- **Rust 工具链** 与系统构建依赖（仅桌面端 `tauri dev/build` 需要）
- **Windows**：需要 MSVC Build Tools 与 WebView2（Windows 10/11 通常已内置）
- 其他平台请参考 Tauri 2 的官方前置依赖说明

## 安装依赖

```bash
bun install
```

也可以使用 `npm install`，但 Tauri 配置里写死了 `bun run dev` / `bun run build`，因此运行桌面端时建议使用 Bun。

## 运行

### 浏览器开发模式

```bash
bun run dev
```

Vite 会固定在 **1420** 端口启动（`vite.config.ts` 中的 `strictPort: true`）。浏览器模式下没有 Tauri API，导入/导出会自动回退到文件选择器与浏览器下载。

### 桌面开发模式

```bash
bun run tauri dev
```

Tauri 会启动 Vite，并打开桌面窗口。桌面端可以使用系统文件对话框直接读写本地谱面与音频。

### 构建

```bash
bun run build        # 前端类型检查 + Vite 生产构建
bun run tauri build  # 打包桌面安装包
```

## 文档

```bash
bun run docs:dev     # 本地预览文档
bun run docs:build   # 构建静态文档
bun run docs:preview # 预览构建结果
```

## 第一个谱面

1. 点击 **导入音乐** 选择音频文件；或点击 **新建谱面**，在弹窗中选择音乐后自动创建基础谱面。
2. 在 **BPM** 面板填写基础 BPM。有变速时点击 **添加**，为每个变速点填写 tick 与实际 BPM。
3. 在 **当前 Canvas** 选择要编辑的 Canvas。没有对应 Canvas 时先点击 **新建 Canvas**。
4. 将鼠标移到 Canvas 上，按 `R` 添加线节点；选中已创建的线后按 `R` 继续补点。
5. 选中一条线，按 `Q` / `W` / `E` 分别添加 Tap / Drag / Hold。
6. 拖动节点或音符调整位置；在右侧 **对象** 面板精调数值。
7. 按住 `T` 从当前时间预览，松开后回到预览前的时间点。
8. 点击 **导出谱面** 保存 JSON。

::: tip 操作顺序
线和音符的编辑都在 `line&note` 模式完成。Canvas、Camera 关键帧需要先在顶部 **编辑对象** 下拉框中切换到对应模式。
:::
