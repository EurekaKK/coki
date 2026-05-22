# Coki

AI 深度研究桌面应用。输入一个问题，Coki 自动搜索网络和你的本地文档，生成一份带引用来源的完整研究报告。

## 下载安装

### macOS

1. 打开 [Releases](https://github.com/EurekaKK/coki/releases) 页面
2. 下载最新版 `Coki-x.x.x.dmg`
3. 双击挂载 DMG，将 Coki 拖到 **应用程序** 文件夹
4. 首次打开时若提示「无法打开」，前往 **系统设置 → 隐私与安全性** → 点击「仍要打开」

### Windows

1. 打开 [Releases](https://github.com/EurekaKK/coki/releases) 页面
2. 下载最新版 `Coki-x.x.x.exe`
3. 双击安装程序，按向导完成安装

## 首次配置

打开应用后进入**设置**页面，填写以下 API Key：

| 配置项 | 用途 | 获取方式 |
|---|---|---|
| LLM API Key | 调用大模型生成报告 | 你的模型服务商后台（Anthropic / MiMo 等） |
| Tavily API Key | 网络信息检索 | [tavily.com](https://tavily.com) |
| 智谱 API Key | 本地文档向量嵌入（可选） | [zhipu.com](https://zhipu.com) |

> 所有 API Key 均保存在本地，不会上传至任何服务器。

## 快速上手

1. **开始研究**：在首页输入你想研究的问题，选择深度（快速 / 平衡 / 深度），点击「开始研究」
2. **添加文档**（可选）：进入「文库」上传 PDF / TXT / Markdown，研究时会自动引用
3. **查看报告**：研究完成后进入「历史记录」，点击条目查看带引用来源的完整报告
4. **导出报告**：报告页点击「保存为 .md」可导出 Markdown 文件

## 常见问题

**Q: 为什么首次打开 macOS 版本会提示安全风险？**
A: 当前版本未进行 Apple 代码签名。前往 **系统设置 → 隐私与安全性** 中允许即可。

**Q: 可以离线使用吗？**
A: 研究过程需要联网搜索。若仅使用本地文档 RAG，仍需 LLM API 联网调用。

**Q: 如何更新？**
A: 下载新版安装包覆盖安装即可，数据自动保留。

## 反馈

遇到问题请在 [Issues](https://github.com/EurekaKK/coki/issues) 提交。
