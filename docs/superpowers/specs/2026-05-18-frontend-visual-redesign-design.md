# Coki 前端视觉优化设计文档

## 目标

在功能完全不变的前提下，将 Coki 前端从当前的"功能性素颜"风格升级为**极简克制、Apple 设计美学**的视觉体系，同时支持系统级 Light / Dark 自动切换，提升所有页面的视觉一致性和交互精致感。

## 设计原则

1. **内容优先**：视觉元素退后，让研究内容和数据成为焦点
2. **大量留白**：充足的呼吸空间，降低信息密度带来的压迫感
3. **克制用色**：仅使用一套 accent 色（蓝），其余全部使用中性灰阶
4. **精致动效**：所有过渡都有目的性，不炫技
5. **系统级暗色**：完全跟随 macOS 系统设置，切换无闪烁

## 技术方案

- **UI 组件库**：shadcn/ui（已原生支持 Tailwind v4）
- **样式引擎**：Tailwind CSS v4（CSS-first 配置）
- **交互基础**：Radix UI Primitives（由 shadcn 封装）
- **暗色模式**：CSS 变量 + `prefers-color-scheme` 媒体查询
- **字体**：系统字体栈（`-apple-system, BlinkMacSystemFont, Inter`），报告正文使用 `Noto Serif SC`

## 设计系统

### 颜色

全部使用 CSS 自定义属性，在 `index.css` 中定义：

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `--bg-primary` | `#ffffff` | `#000000` | 页面主背景 |
| `--bg-secondary` | `#f5f5f7` | `#1c1c1e` | 卡片、面板背景 |
| `--bg-tertiary` | `#fafafa` | `#2c2c2e` | 输入框、hover 背景 |
| `--text-primary` | `#1d1d1f` | `#f5f5f7` | 标题、主要文字 |
| `--text-secondary` | `#86868b` | `#98989d` | 正文、描述 |
| `--text-tertiary` | `#a1a1a6` | `#636366` | 辅助信息、禁用状态 |
| `--accent` | `#0071e3` | `#0a84ff` | 主按钮、进度条、焦点环 |
| `--accent-hover` | `#0077ed` | `#409cff` | 按钮 hover 状态 |
| `--accent-light` | `#e8f4fd` | `#1c3d5a` | 焦点环 glow |
| `--border` | `#d2d2d7` | `#38383a` | 分隔线、输入框边框 |
| `--border-light` | `#e8e8ed` | `#2c2c2e` | 卡片边框、 subtle 分隔 |

语义色（状态）：
- 成功：`#34c759`（Light）/ `#30d158`（Dark）
- 警告：`#ff9500`（Light）/ `#ff9f0a`（Dark）
- 错误：`#ff3b30`（Light）/ `#ff453a`（Dark）

### 字体层级

| 层级 | 大小 | 字重 | 行高 | 字间距 | 用途 |
|---|---|---|---|---|---|
| Display | 28px | 700 | 1.2 | -0.02em | 页面大标题 |
| Title | 22px | 600 | 1.3 | -0.01em | 卡片标题、章节名 |
| Subtitle | 17px | 600 | 1.4 | 0 | 小节标题 |
| Body | 15px | 400 | 1.6 | 0 | 正文、描述 |
| Caption | 13px | 500 | 1.4 | 0 | 时间戳、标签、辅助 |
| Mono | 13px | 400 | 1.5 | 0 | 日志、代码片段 |

报告正文使用衬线字体 `Noto Serif SC`（中文）+ `Georgia`（英文），字号 16px，行高 1.8，提升长文阅读体验。

### 间距系统

采用 4px 基数，但界面中主要使用以下档：
- `xs`: 4px
- `sm`: 8px
- `md`: 16px
- `lg`: 24px
- `xl`: 32px
- `2xl`: 48px
- `3xl`: 64px

### 圆角

- `sm`: 8px（输入框、小标签、日志行）
- `md`: 12px（卡片、面板、侧边栏项）
- `lg`: 18px（大卡片、模态框）
- `full`: 9999px（按钮、徽章、头像）

### 阴影

极其克制，仅用于需要层级暗示的悬浮元素：
- `shadow-sm`: `0 1px 2px rgba(0,0,0,0.04)` — 卡片默认
- `shadow-md`: `0 4px 16px rgba(0,0,0,0.08)` — 卡片 hover / 下拉菜单
- `shadow-lg`: `0 12px 40px rgba(0,0,0,0.12)` — 模态框

Dark 模式下阴影使用更高不透明度的黑色：
- `shadow-sm`: `0 1px 2px rgba(0,0,0,0.3)`
- `shadow-md`: `0 4px 16px rgba(0,0,0,0.4)`
- `shadow-lg`: `0 12px 40px rgba(0,0,0,0.5)`

## 交互与动效规范

### 页面转场
- 方式：opacity `0 → 1`
- duration: 200ms
- easing: `ease-out`
- **不使用左右滑动**，保持克制

### Hover 状态
- 按钮：`background-color` 变化 150ms + `transform: scale(1.02)` 200ms
- 卡片：`background` 微变 或 `shadow-md` 浮现 200ms
- 链接：`color` 过渡到 accent，150ms
- 列表项：`background` 过渡到 `bg-tertiary`，150ms

### 焦点环
- 不使用浏览器默认 outline
- 统一使用：`box-shadow: 0 0 0 3px var(--accent-light)`
- transition: 200ms ease

### 进度条动画
- width 变化：`cubic-bezier(0.4, 0, 0.2, 1)`
- duration: 500ms

### 卡片/列表入场
- opacity `0 → 1` + translateY `4px → 0`
- duration: 250ms
- stagger: 50ms（列表逐项出现）

### 暗色模式切换
- 所有颜色通过 CSS 变量定义
- 切换通过 `prefers-color-scheme` 媒体查询
- 无 JavaScript 干预，切换无闪烁

## 页面设计方案

### 全局布局

所有页面共享统一的 Sidebar + Main 布局：

```
┌─────────────────────────────────────┐
│  Sidebar  │        Main              │
│  (200px)  │     (flex-1)             │
│           │                          │
│  · 新研究 │                          │
│  · 历史   │     [页面内容]            │
│  · 设置   │                          │
│           │                          │
└─────────────────────────────────────┘
```

**Sidebar 规范**：
- 宽度：200px（固定）
- 背景：`bg-secondary`
- 右侧边框：`1px solid var(--border-light)`
- Logo：左上角，28px Bold，"Coki"
- 导航项：13px Medium，圆角 12px，padding `8px 12px`
- Active 状态：`bg-tertiary` + `text-primary`
- Hover 状态：`bg-tertiary` + `text-primary`
- 项间距：`space-y-1`

### Home / 新研究

当前页面已经比较简洁，优化方向是提升精致感和输入体验：

- **布局**：居中单列，最大宽度 640px
- **标题区**：
  - 主标题："Coki"，Display 28px Bold，居中
  - 副标题："深度研究，由 AI 驱动"，Body 15px，`text-secondary`，居中
  - 上下留白：64px（`3xl`）
- **输入区**：
  - textarea：全宽，`bg-tertiary`，圆角 12px，min-height 120px
  - placeholder：`text-tertiary`
  - focus：`border-color: accent` + `box-shadow: 0 0 0 3px accent-light`
  - 下方间距：24px（`lg`）
- **深度选择器**：
  - 三个 pill 按钮横向排列，居中
  - 默认：`btn-secondary`（灰色背景）
  - 选中：`btn-primary`（蓝色背景）
  - 按钮间间距：8px（`sm`）
  - 过渡：background + scale，200ms
- **主按钮**：
  - "开始研究"，全宽 pill 按钮
  - 高度：48px（增大点击区域）
  - 上方间距：24px
- **整体动效**：页面载入时，标题 → 输入框 → 按钮 依次淡入上移，stagger 100ms

### Dashboard / 进度监控

当前页面信息密度较低，优化方向是提升进度感知的专业感：

- **布局**：居中单列，最大宽度 680px
- **头部区**：
  - 左对齐："正在研究"，Title 22px Semibold
  - 下方：查询主题，Body 15px，`text-secondary`
  - 右侧：当前 phase 标签（Badge，蓝色 accent-light 背景）
- **进度条**：
  - 高度：4px
  - 背景：`border-light`
  - 填充：`accent`
  - 圆角：全圆角
  - 下方：百分比文字，Caption 13px，`text-tertiary`
  - 间距：16px（`md`）
- **日志流**：
  - 背景：`bg-secondary`
  - 圆角：12px
  - 内边距：16px
  - 每条日志：
    - 左侧：[phase] 标签，Caption，Mono 字体，`text-tertiary`
    - 右侧：消息内容，Caption，Mono，`text-secondary`
    - 行间距：`space-y-2`
    - hover：该行 `bg-tertiary` 高亮
  - 自动滚动到底部，平滑滚动
- **错误状态**：
  - 红色背景卡片（`rgba(255,59,48,0.08)`）
  - 圆角 12px
  - 左侧红色竖线（4px）
  - 文字：`text-primary`
- **整体动效**：
  - 进度条变化：width 动画 500ms
  - 新日志出现：从底部滑入（translateY + opacity），250ms
  - phase 标签切换：cross-fade，200ms

### Report / 报告阅读

报告是核心阅读场景，优化方向是打造沉浸式的文档阅读体验：

- **布局**：
  - 最大宽度：800px（适合阅读的行宽）
  - 居中
  - 上下留白：48px（`2xl`）
- **报告头部**：
  - 查询主题：Caption 13px，`text-tertiary`，居左
  - 报告标题：Display 28px Bold，居左
  - 下方间距：32px（`xl`）
- **正文区**：
  - 字体：`Noto Serif SC` + `Georgia`
  - 字号：16px
  - 行高：1.8
  - 字色：`text-secondary`（降低对比度，减少阅读疲劳）
  - 段落间距：`margin-bottom: 1.5em`
  - 引用块：左侧 3px `border-light` 竖线 + `bg-secondary` 背景，圆角 0 8px 8px 0
- **代码块**：
  - 背景：`bg-secondary`
  - 圆角：12px
  - 内边距：16px
  - 字体：Mono 13px
  - 不添加额外边框
- **表格**：
  - 表头：`bg-secondary`，字体 Semibold
  - 单元格：padding 12px 16px
  - 行分隔：1px `border-light`
  - 无外边框，仅保留横向分隔
- **引用脚注**：
  - 上标：`accent` 色，12px
  - 脚注区：上方 32px 留白 + 1px `border-light` 分隔线
  - 脚注文字：Caption 13px，`text-tertiary`
- **底部操作栏**：
  - 位置：报告正文下方，居中
  - 按钮："保存为 .md" + "查看时间线"，`btn-secondary`
  - 间距：`gap-3`
  - 上方留白：48px
  - 下方留白：64px
- **整体动效**：
  - 报告内容载入：标题先出现，正文淡入 300ms
  - 脚注点击：平滑滚动到对应位置（已有 scrollIntoView）

### History / 历史记录

优化方向是提升信息扫描效率和卡片质感：

- **布局**：
  - 最大宽度：720px
  - 标题："历史记录"，Title 22px Semibold，左对齐
  - 上方留白：32px
- **卡片列表**：
  - 布局：`space-y-3`
  - 每个卡片：
    - 背景：`bg-primary`
    - 边框：1px `border-light`
    - 圆角：12px
    - 内边距：20px 24px
    - hover：`shadow-md` 浮现 + `border` 颜色加深，200ms
    - cursor: pointer（整卡片可点击）
  - 卡片内部：
    - 顶部行：查询标题（Subtitle 17px Semibold）+ 状态 Badge（右侧）
    - 下方行：日期（Caption，`text-tertiary`）+ 深度标签（Caption，`text-secondary`）
    - 间距：`space-y-1`
  - 状态 Badge 规范：
    - 已完成：绿色背景（`rgba(52,199,89,0.12)`）+ 绿色文字
    - 进行中：蓝色背景（`accent-light`）+ 蓝色文字
    - 失败：红色背景（`rgba(255,59,48,0.12)`）+ 红色文字
- **空状态**：
  - 居中
  - 图标：一个简洁的文档轮廓（Lucide `FileText`）
  - 文字："暂无研究记录"，Body，`text-secondary`
  - 按钮："开始新研究"，`btn-primary`
- **整体动效**：卡片列表 stagger 入场，每张卡片延迟 50ms

### Timeline / 时间线

优化方向是提升时间线的可读性和专业感：

- **布局**：
  - 最大宽度：800px
  - 标题："时间线"，Title 22px Semibold
- **时间线主体**：
  - 左侧：一条 1px 竖线，`border-light`
  - 节点：圆点，10px，`accent` 色
  - 节点外圈：3px `bg-primary` + 1px `border`（形成"空心圆环"效果）
  - 节点与内容间距：16px
- **Phase 分组**：
  - 每个 phase 作为一个分组
  - phase 标题：Caption 13px，大写，`text-tertiary`，上方留白 24px
  - 分组内日志：`space-y-2`
- **日志条目**：
  - 时间戳：Caption 13px Mono，`text-tertiary`，固定宽度 80px
  - Level Badge：
    - info：灰色（`bg-tertiary` + `text-secondary`）
    - warn：黄色（`rgba(255,149,0,0.12)` + `#ff9500`）
    - error：红色（`rgba(255,59,48,0.12)` + `#ff3b30`）
  - 消息：Caption 13px，`text-secondary`
  - JSON 详情按钮：右侧小箭头图标，点击展开
  - 展开后的 JSON 面板：
    - 背景：`bg-secondary`
    - 圆角：8px
    - 内边距：12px
    - 字体：Mono 12px
    - 语法高亮（JSON key 为 `text-primary`，value 为 `text-secondary`，string 为 accent 色）
- **整体动效**：时间线节点和内容 stagger 入场

### Settings / 设置

优化方向是提升表单的专业感和分组清晰度：

- **布局**：
  - 最大宽度：600px
  - 标题："设置"，Title 22px Semibold
  - 上方留白：32px
- **分组卡片**：
  - 每个设置分组（LLM、Tavily、模型覆盖）作为一个卡片
  - 背景：`bg-primary`
  - 边框：1px `border-light`
  - 圆角：12px
  - 内边距：24px
  - 间距：`space-y-6`
- **分组标题**：
  - Subtitle 17px Semibold
  - 下方 1px `border-light` 分隔线
  - 标题与内容间距：16px
- **表单项**：
  - Label：Caption 13px Medium，`text-primary`，下方间距 6px
  - Input：`bg-tertiary`，圆角 8px，height 40px
  - Description：Caption 13px，`text-tertiary`，input 下方间距 4px
  - 表单项间距：`space-y-4`
- **模型覆盖项（Role Models）**：
  - 使用内嵌的小卡片或行布局
  - 每行：Role 名称（左侧）+ Input（右侧，占 60% 宽度）
  - 行间分隔：1px `border-light`
- **保存按钮**：
  - 右下角对齐
  - `btn-primary`，"保存"
  - 保存成功后：按钮文字变为 "已保存 ✓"，绿色，2 秒后恢复
- **整体动效**：
  - 分组卡片 stagger 入场
  - 保存按钮点击：scale(0.98) 反馈，100ms

## 组件清单（需引入 shadcn/ui）

| 组件 | shadcn 名称 | 用途 |
|---|---|---|
| Button | `button` | 所有按钮 |
| Input | `input` | 表单输入框 |
| Textarea | `textarea` | Home 查询输入 |
| Label | `label` | 表单标签 |
| Badge | `badge` | 状态标签、phase 标签 |
| Card | `card` | 历史记录卡片、设置分组 |
| Separator | `separator` | 分隔线 |
| Tooltip | `tooltip` | 按钮/图标提示 |
| Collapsible | `collapsible` | CostPanel、Timeline JSON 展开 |
| ScrollArea | `scroll-area` | 日志流、报告正文滚动 |
| Skeleton | `skeleton` | 加载占位 |

无需引入的组件（保持现有实现或手写）：
- Sidebar（结构简单，手写更轻量）
- Progress（结构简单，手写）
- Markdown 渲染（已有 react-markdown 栈）

## 文件变更预估

| 文件 | 变更类型 | 说明 |
|---|---|---|
| `apps/renderer/src/index.css` | 重写 | 引入 shadcn base，定义 CSS 变量和主题 |
| `apps/renderer/src/App.tsx` | 修改 | 添加全局布局容器、页面转场动画 |
| `apps/renderer/src/components/Sidebar.tsx` | 重写 | 新视觉风格 |
| `apps/renderer/src/components/Timeline.tsx` | 重写 | 新时间线视觉 |
| `apps/renderer/src/components/CostPanel.tsx` | 修改 | 使用 shadcn Collapsible，新样式 |
| `apps/renderer/src/pages/Home.tsx` | 重写 | 新布局、动效 |
| `apps/renderer/src/pages/Dashboard.tsx` | 重写 | 新进度条、日志流样式 |
| `apps/renderer/src/pages/Report.tsx` | 重写 | 新阅读体验、衬线字体 |
| `apps/renderer/src/pages/History.tsx` | 重写 | 新卡片列表、空状态 |
| `apps/renderer/src/pages/Settings.tsx` | 重写 | 新表单布局、卡片分组 |
| `apps/renderer/src/stores/app-store.ts` | 无变更 | 功能不变 |
| `apps/renderer/src/lib/api.ts` | 无变更 | 功能不变 |
| `apps/renderer/package.json` | 修改 | 添加 shadcn/ui 依赖 |
| `apps/renderer/components.json` | 新增 | shadcn 配置文件 |

## 暗色模式实现策略

1. **CSS 变量法**：所有颜色通过 `:root` 变量定义，Dark 模式通过 `prefers-color-scheme: dark` 覆盖
2. **Tailwind 适配**：在 `index.css` 中定义 `@theme`，将 CSS 变量映射到 Tailwind 的 `color()` 函数
3. **shadcn 主题**：初始化 shadcn 时选择 CSS 变量主题方案，自动生成 Light/Dark 兼容的 tokens
4. **Electron 适配**：`prefers-color-scheme` 在 Electron 中天然支持系统级跟随，无需主进程额外配置
5. **报告正文**：`prose` 类需要使用自定义的 `prose-slate` 变体，将颜色映射到 CSS 变量

## 风险与注意事项

1. **Tailwind v4 兼容性**：shadcn/ui 对 Tailwind v4 的支持相对较新，初始化时需要确认版本匹配
2. **Electron 打包体积**：shadcn 按需引入，不会影响最终包体积
3. **报告渲染**：`@tailwindcss/typography` 的 `prose` 类颜色需要手动覆盖为 CSS 变量，否则暗色模式下正文仍为黑色
4. **better-sqlite3 原生模块**：前端改动不会影响主进程的原生模块加载
5. **preload 构建**：改动不涉及 preload，无需额外重建

## 验收标准

- [ ] 所有 6 个页面在 Light 模式下视觉上统一、精致
- [ ] 所有 6 个页面在 Dark 模式下视觉上统一、精致
- [ ] 系统切换 Light/Dark 时，应用自动跟随，无闪烁
- [ ] 所有按钮、链接、输入框都有明确的 hover / focus 状态
- [ ] 页面转场、卡片入场、进度条变化都有平滑动效
- [ ] 报告正文使用衬线字体，行宽适中，阅读舒适
- [ ] 历史记录卡片有清晰的 hover 反馈和状态标识
- [ ] 设置表单分组清晰，保存反馈明确
- [ ] 功能与现有版本完全一致（无行为变更）
