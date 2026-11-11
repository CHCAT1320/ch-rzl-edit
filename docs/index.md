---
layout: home

hero:
  name: ch-rzl-edit
  text: Rizline 谱面编辑器
  tagline: TypeScript + Canvas 2D + Tauri 2，支持线/音符编辑、Canvas 与 Camera 关键帧、BPM、Riztime 主题和实时预览
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: 使用方法
      link: /guide/usage

features:
  - title: 完整的谱面编辑
    details: 线节点、Tap / Drag / Hold、Canvas 位移与流速、Camera 位移与缩放、BPM 变化、Riztime 主题与判定圈颜色。
  - title: 即时预览
    details: 按住 T 从当前位置开始预览播放，包含判定圈、打击特效与打击音；松开后自动暂停并回到原时间点。
  - title: 对齐参考播放器
    details: 渲染逻辑参考 re-ch-rzl-rust，覆盖缓动、floorPosition、颜色混合、线色叠加和 Riztime 过渡。
  - title: 桌面与浏览器双形态
    details: Tauri 2 桌面端使用系统文件对话框读写谱面与音频；纯浏览器环境自动回退到文件选择器。
---

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [项目简介与技术栈](/guide/introduction) | 项目定位、技术选型、目录结构 |
| [快速开始](/guide/getting-started) | 环境要求、安装依赖、开发运行、构建打包 |
| [界面与使用方法](/guide/usage) | 界面区域、导入导出、编辑模式、选择与拖动、属性面板 |
| [预览与渲染规则](/guide/rendering) | 坐标体系、颜色混合、音符类型、主题与 Riztime 过渡 |
| [谱面 JSON 格式](/reference/chart-format) | 字段说明、示例、导出规则 |
| [快捷键一览](/reference/shortcuts) | 编辑与播放快捷键 |
| [常见问题](/reference/faq) | 导入、音频、音画同步、渲染差异等问题 |
