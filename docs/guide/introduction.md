# 项目简介与技术栈

`ch-rzl-edit` 是一个面向 Rizline 谱面（`.json`）的可视化编辑器。它把谱面渲染、时间轴编辑、属性面板和预览播放集中在同一个 Canvas 界面中，适合制作、校对和微调谱面。

## 功能概览

- **线编辑**：创建线节点、调整 `xPosition` / 时间 / Canvas / 缓动 / 节点颜色，支持框选、拖动、复制粘贴和撤销。
- **音符编辑**：Tap（`type: 0`）、Drag（`type: 1`）、Hold（`type: 2`），可修改开始时间、结束时间、结束 Canvas 和类型。
- **Canvas 关键帧**：编辑每个 Canvas 的 X 位移与流速关键帧；支持按横线密度批量生成流速缓动关键帧。
- **Camera 关键帧**：编辑 Camera 的 X 位移与缩放关键帧。
- **谱面设置**：基础 BPM、BPM 变化、主题颜色、Riztime（挑战段落）时间段与过渡。
- **线条外观**：线颜色关键帧与判定圈颜色关键帧，按时间插值。
- **实时预览**：按住 `T` 预览播放，带判定圈、打击特效和 Web Audio 打击音。
- **导入导出**：读取/写入 Rizline 谱面 JSON；桌面端使用系统文件对话框，浏览器端使用文件选择器。

## 技术栈

| 分类 | 技术 | 说明 |
| --- | --- | --- |
| 语言 | TypeScript 5.6 | 全量类型化的渲染与编辑逻辑 |
| UI | 原生 DOM + Canvas 2D | 没有使用 React/Vue 等框架，界面由 `index.html` + CSS 构建 |
| 构建 | Vite 6 | 开发服务器与生产构建 |
| 桌面容器 | Tauri 2（Rust） | 窗口、系统文件对话框、文件读写、DevTools |
| 文件访问 | `@tauri-apps/plugin-dialog`、`@tauri-apps/plugin-fs` | 桌面端原生文件对话框与读写 |
| 音频播放 | HTMLAudioElement | 音乐播放、暂停、跳转，驱动渲染时间 |
| 打击音效 | Web Audio API | `public/audio/hit.wav` 与 `drag.wav`，低延迟播放 |
| 包管理 | Bun | 仓库使用 `bun.lock`；也兼容 npm/pnpm 安装依赖 |
| 文档 | VitePress 1.6 | 本目录 `docs/` |

::: tip 关于包管理器
仓库脚本使用 Bun（`bun.lock`）。Tauri 配置中的 `beforeDevCommand` / `beforeBuildCommand` 也是 `bun run dev` / `bun run build`，因此使用 `tauri dev` 时需要安装 Bun。只运行 `bun run dev` 或 npm 脚本也可以。
:::

## 目录结构

```text
ch-rzl-edit/
├─ src/
│  ├─ main.ts           # 入口：事件绑定、快捷键、渲染循环启动
│  ├─ canvas.ts         # 画布尺寸、设备像素比、9:16 居中区域计算
│  ├─ chartEditor.ts    # 编辑状态、命中检测、选择、拖动、剪贴板、撤销、属性面板
│  ├─ editMode.ts       # 编辑/预览模式、时间轴映射、横线/竖线与播放头绘制
│  ├─ drawChart.ts      # 谱面渲染：线、音符、判定圈、主题、特效、预览播放
│  ├─ fileManager.ts    # 谱面/音乐导入导出、字段清洗与默认值
│  └─ hitSound.ts       # Web Audio 打击音效
├─ public/audio/        # hit.wav / drag.wav
├─ src-tauri/           # Tauri 2 配置与 Rust 端
├─ docs/                # VitePress 文档（本目录）
├─ index.html           # 编辑器界面结构
├─ vite.config.ts       # Vite 配置（固定 1420 端口供 Tauri 使用）
└─ package.json
```

## 与参考播放器的关系

渲染部分以 Rust 参考播放器 `re-ch-rzl-rust` 的行为为准，重点关注：

- 线节点与音符的坐标、缓动和时间映射；
- `floorPosition` 的推导与缓存；
- 节点颜色与线颜色的混合规则；
- 线颜色渐变、端点圆帽和判定圈颜色；
- Riztime 主题切换与过渡。

相关细节见 [预览与渲染规则](/guide/rendering)。

## 适用范围

- 谱面格式为编辑器导出的 Rizline JSON（`fileVersion: 1`）。
- 编辑器按 720×1280 的设计分辨率渲染，并以 9:16 居中显示。
- 音乐与谱面分别导入；新建谱面时会要求先选择音乐，以便自动补齐结束 tick。
