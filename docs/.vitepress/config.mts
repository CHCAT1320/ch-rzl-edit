import { defineConfig } from "vitepress";

export default defineConfig({
  lang: "zh-CN",
  title: "ch-rzl-edit",
  description: "Rizline 谱面编辑器的使用、开发与谱面格式文档",
  cleanUrls: true,
  lastUpdated: true,
  markdown: {
    lineNumbers: true,
  },
  themeConfig: {
    nav: [
      { text: "指南", link: "/guide/introduction", activeMatch: "/guide/" },
      { text: "使用方法", link: "/guide/usage" },
      { text: "谱面格式", link: "/reference/chart-format" },
      { text: "快捷键", link: "/reference/shortcuts" },
    ],
    sidebar: [
      {
        text: "指南",
        items: [
          { text: "项目简介与技术栈", link: "/guide/introduction" },
          { text: "快速开始", link: "/guide/getting-started" },
          { text: "界面与使用方法", link: "/guide/usage" },
          { text: "预览与渲染规则", link: "/guide/rendering" },
        ],
      },
      {
        text: "参考",
        items: [
          { text: "谱面 JSON 格式", link: "/reference/chart-format" },
          { text: "快捷键一览", link: "/reference/shortcuts" },
          { text: "常见问题", link: "/reference/faq" },
        ],
      },
    ],
    outline: {
      level: [2, 3],
      label: "本页目录",
    },
    search: {
      provider: "local",
    },
    docFooter: {
      prev: "上一页",
      next: "下一页",
    },
    lastUpdatedText: "最后更新",
    lightModeSwitchTitle: "切换到浅色模式",
    darkModeSwitchTitle: "切换到深色模式",
    darkModeSwitchLabel: "主题",
    sidebarMenuLabel: "菜单",
    returnToTopLabel: "返回顶部",
  },
});
