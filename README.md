# Coki

AI 深度研究桌面应用。输入问题，Coki 自动搜索网络和你的本地文档，生成一份带引用来源的完整研究报告。

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 9+
- macOS / Windows / Linux

### 安装依赖

```bash
git clone https://github.com/EurekaKK/coki.git
cd coki
pnpm install
```

### 开发模式

```bash
pnpm dev
```

这会同时启动：
- **Renderer**（Vite，http://localhost:5173）
- **Main**（Electron 主进程）

### 生产构建

```bash
pnpm build
```

构建顺序：renderer → preload → main。

## 打包发布

### 本地打包

```bash
# macOS DMG
pnpm release:mac

# Windows EXE（需在 Windows 环境或安装 Wine）
pnpm release:win
```

输出目录：`dist-electron/`

### 自动发布（推荐）

推 tag 触发 GitHub Actions，自动构建并上传到 GitHub Releases：

```bash
git tag v0.1.0
git push origin v0.1.0
```

工作流会在 macOS runner 上打 DMG，在 Windows runner 上打 EXE，完成后以 draft 形式发布到 Releases。

## 配置 API Key

首次打开应用后，进入**设置**页面配置：

| 配置项 | 用途 | 获取方式 |
|---|---|---|
| LLM API Key | 调用大模型（Claude / MiMo 等） | 你的模型服务商后台 |
| Tavily API Key | 网络搜索 | [tavily.com](https://tavily.com) |
| 智谱 API Key | 文档向量嵌入（可选） | [zhipu.com](https://zhipu.com) |

## 项目结构

```
coki/
├── apps/
│   ├── main/        # Electron 主进程
│   ├── preload/     # contextBridge API
│   └── renderer/    # React 前端
├── packages/
│   ├── engine/      # 研究流水线核心
│   └── shared/      # 共享类型和常量
├── build/           # 打包资源（entitlements 等）
├── .github/
│   └── workflows/   # CI/CD
└── electron-builder.yml
```

## 技术栈

- Electron + React + TypeScript
- Vite（Renderer）+ esbuild（Main）
- Tailwind CSS + shadcn/ui
- SQLite + better-sqlite3
- Vectra（本地向量搜索）

## License

MIT
