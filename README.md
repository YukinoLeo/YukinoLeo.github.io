# MyBlog 维护手册

YukinoLeo 的个人博客（Hexo + Butterfly）。本文档说明项目结构、关键代码文件的作用，以及日常维护需要用到的一切功能接口。

> 通用工作流：改完任何内容，统一执行 `npx hexo clean && npx hexo generate`（**必须 clean**，否则已删除的分栏/文章会残留在 `public/` 里）。本地预览用 `npx hexo server`。

---

## 一、项目结构

```
myBlog/
├─ _config.yml               # Hexo 全局配置（站点信息、permalink、生成器等）
├─ _config.butterfly.yml     # Butterfly 主题覆盖配置（菜单、社交、侧栏等）
├─ package.json              # npm 脚本：build / clean / server / deploy
├─ scaffolds/                # hexo new 的模板（post / page / draft）
├─ source/                   # 站点源内容（最重要的目录）
│  ├─ _data/columns.yml      # ★ 分栏元数据（id → 名称/封面/简介）——唯一真相源
│  ├─ _posts/                # ★ 博客文章，按分栏放进子文件夹
│  │  ├─ <分栏id>/文章.md    #   文件夹名 = 分栏稳定 id（必须 ASCII）
│  │  └─ 文章.md             #   根目录文章只靠 front matter 的 column 字段归栏
│  ├─ _projects/             # Project 卡片数据（*.md）
│  ├─ _research/             # Research 卡片数据（*.md）
│  └─ images/                # 图片：avatar.png、projects/、research/、columns/
├─ scripts/
│  ├─ content-collections.js # ★ 自定义核心脚本（分栏/文章卡片/R项目页生成）
│  └─ katex-marked.js        # KaTeX 公式渲染（markdown 中 $...$ / $$...$$ → KaTeX）
└─ themes/butterfly/         # Butterfly 主题（内含我们的自定义）
   ├─ _config.yml            # 主题默认配置（一般不动）
   ├─ layout/
   │  ├─ index.pug           # ★ 自定义 Glass 首页（替代 Butterfly 默认首页）
   │  ├─ blog.pug            # ★ /blog/ 分栏卡片站
   │  ├─ category.pug        # ★ 分栏内横向文章卡片列表
   │  ├─ research.pug        # ★ Research 汇总页
   │  ├─ projects.pug        # ★ Projects 汇总页
   │  ├─ index.butterfly.pug # Butterfly 原始首页备份（不用）
   │  ├─ archive.glass.backup.pug # 旧 Glass 归档备份（不用）
   │  └─ includes/           # 部分改动：sidebar.pug、card_author.pug
   └─ source/css/
      ├─ glass.css           # ★ 首页 Glass 样式（只作用于首页）
      ├─ glass.backup.css    # 旧版备份（不用）
      └─ collections.css     # ★ 汇总页/文章卡片样式（全站注入）
```

---

## 二、已更改 / 添加的关键文件及作用

| 文件 | 作用 | 说明 |
|---|---|---|
| `scripts/content-collections.js` | **核心数据脚本** | 读取 `_posts` 按分栏 id 分组、合并 `columns.yml`；预计算文章卡片数据（标题/链接/时间/tags/浏览量/90字摘要）；生成 `/research/`、`/projects/`、`/blog/`、`/blog/<id>/` 路由；注册 `postCard` helper |
| `scripts/katex-marked.js` | **KaTeX 数学公式渲染** | 通过 `marked:use` filter 注入 `marked-katex-extension`，把 markdown 里的 `$...$`（行内）和 `$$...$$`（块级）在生成时渲染成 KaTeX HTML |
| `source/_data/columns.yml` | **分栏元数据（唯一真相源）** | `id → {name, cover, description}` + `defaults` 兜底 |
| `themes/butterfly/layout/index.pug` | 自定义 **Glass 首页** | 导航 / Hero / Blog 分栏 / Latest Article / Research / Projects / Footer；分栏简介读 `category.description` |
| `themes/butterfly/layout/blog.pug` | **/blog/ 分栏卡片站** | 展示所有分栏卡片（封面、名称、简介、文章数、Explore） |
| `themes/butterfly/layout/category.pug` | **分栏内横向文章卡片** | 一行一篇文章：标题（链到文章）、时间、tags、浏览量、90字摘要；用 `page.posts.map(postCard)` |
| `themes/butterfly/layout/research.pug` / `projects.pug` | Research / Projects 汇总页 | `.collection-card` 卡片，链接到外部页面 |
| `themes/butterfly/source/css/glass.css` | 首页 Glass 样式 | 只作用于 `.glass-home-page`，不扩散到内容页 |
| `themes/butterfly/source/css/collections.css` | 汇总页 + 横向文章卡片样式 | 经 `inject.head` 全站注入 |
| `_config.yml` | 站点全局配置 | `permalink: :year/:month/:day/:name/`（`:name` 让文章在子文件夹里 URL 也不带文件夹名） |
| `_config.butterfly.yml` | 主题覆盖 | 菜单（Blog→`/blog/`）、社交 GitHub、作者卡按钮、关闭原生分类 widget |
| `themes/butterfly/layout/includes/sidebar.pug` / `widget/card_author.pug` | 侧栏小改 | 删掉指向不存在的 `/tags/`、`/categories/` 总览页的计数链接 |

---

## 三、核心架构（怎么工作的）

### 分栏机制（三层解耦）

```
文件夹 id（文章归属）  →  columns.yml（展示信息）  →  页面渲染
source/_posts/<id>/    →  id → {name, cover, description}  →  /blog/<id>/ 与首页
```

- **文章怎么归栏**：放进 `source/_posts/<分栏id>/` 文件夹即可；也可在 front matter 写 `column:` 补充（见下）。**文件夹 id 必须 ASCII**。
- **显示名/封面/简介**：全部由 `columns.yml` 决定，缺省用 `defaults`。改显示名只动 columns.yml，文章不用改。
- **URL**：`/blog/<id>/`（稳定，不随显示名变化）。

### 两种风格体系

| 页面 | 风格 |
|---|---|
| `/` 首页 | Glass（`index.pug` + `glass.css`） |
| `/blog/`、`/blog/<id>/`、`/research/`、`/projects/`、文章页、归档、tags | Butterfly |

### Research / Projects 是动态汇总页

往 `source/_research/`、`source/_projects/` 丢一个 `.md`，汇总页和首页自动出现新卡片，无需改代码。

### 原生 Hexo 分类已隐藏

文章不再用 `categories` 字段；原生 `/categories/` 页面、文章页分类、侧栏分类 widget 全部不显示。分栏体系完全由我们的 `columns.yml` + 文件夹驱动。

---

## 四、功能接口（日常操作）

### 1. 博客文章

| 操作 | 方法 |
|---|---|
| **新建** | 在 `source/_posts/<分栏id>/` 下新建 `.md`，front matter： |
| **修改** | 直接编辑该 `.md`（标题/正文/tags/时间/views） |
| **删除** | 删掉该 `.md` |
| **换分栏** | 移动文件到别的分栏文件夹（或改 `column:`） |

文章 front matter 可用字段：

```yaml
---
title: 文章标题
date: 2026-08-30          # 发布时间，决定排序与归档
katex: true               # 可选：含数学公式的文章开启 KaTeX 渲染
tags:
  - 标签A
  - 标签B
views: 123                # 可选：浏览量（不写则显示 0）
column: 另一个分栏id       # 可选：补充归属（见「多分栏」）
---
```

> 注意：**不要写 `categories` 字段**（原生分类已隐藏，写了也不会显示）。`hexo new "标题"` 生成的模板不含上述可选字段，记得手动补。

**写数学公式**：在 front matter 加 `katex: true`，正文里用 `$...$`（行内公式）和 `$$...$$`（块级公式）写 LaTeX 即可（如 `$x^2$`、`$$\sum_{i=1}^n i$$`）。公式在生成时已渲染成 KaTeX HTML，无需额外配置。

### 2. 分栏

| 操作 | 方法 |
|---|---|
| **新建分栏** | ① 建文件夹 `source/_posts/<新id>/`；② 可选在 `columns.yml` 加一条定名字/封面/简介（不加则用 defaults：名称=id、通用简介、默认封面） |
| **改显示名** | 改 `columns.yml` 里该 id 的 `name`（一行，全站生效） |
| **改封面/简介** | 改 `columns.yml` 里该 id 的 `cover` / `description`（不写则走 `defaults`） |
| **改 id / URL** | 重命名文件夹 + 同步改 `columns.yml` 的 key |
| **多分栏** | 文章 front matter 写 `column: [id1, id2]`，与所在文件夹取并集（文件夹=主分栏） |
| **删除分栏** | 删掉文件夹（分栏自动消失，无残留） |

`columns.yml` 结构：

```yaml
defaults:
  cover: /images/columns/default.png      # 全局兜底封面
  description: 通用简介兜底
columns:
  ai-basic:          # key = 分栏 id（= 文件夹名）
    name: AI基础      # 显示名
    cover: /images/columns/ai.png   # 可选，不写用 defaults
    description: ...                 # 可选，不写用 defaults
```

### 3. Projects / Research

| 操作 | 方法 |
|---|---|
| **新建** | 在 `source/_projects/` 或 `source/_research/` 新建 `.md` |
| **修改** | 编辑该 `.md` |
| **删除** | 删掉该 `.md` |

Project 示例：

```yaml
---
title: CourseMate
description: An AI-powered RAG teaching assistant...
type: Project          # 侧栏 meta 显示用
year: 2026
link: https://github.com/YukinoLeo/CourseMate   # 卡片点击跳转的外部地址
link_text: GitHub      # 按钮文字（缺省 "View Project"）
cover: /images/projects/coursemate.png
---
```

Research 比 Project 多一个字段：

```yaml
venue: ECCV 2026       # 会议/期刊（显示在卡片顶部）
```

### 4. 图片

| 图 | 位置 |
|---|---|
| 首页头像 | `source/images/avatar.png` |
| Project 卡片图 | `source/images/projects/xxx.png`，front matter `cover: /images/projects/xxx.png` |
| Research 卡片图 | `source/images/research/xxx.png`，同理 |
| 分栏卡片图 | 在 `columns.yml` 里给该分栏设 `cover:`（或改 `defaults.cover` 全局换） |

### 5. 导航 / 站点信息

- 菜单：`_config.butterfly.yml` 的 `menu`（当前 Home / Blog / Projects / Research）。
- GitHub / 邮箱：同文件的 `social`。
- 站点标题/作者/时区等：`_config.yml` 顶部。

---

## 五、常用命令

| 命令 | 作用 |
|---|---|
| `npx hexo clean && npx hexo generate` | 重新生成 `public/`（日常必用） |
| `npx hexo server` | 本地预览（默认 http://localhost:4000） |
| `npx hexo new "标题"` | 生成新文章模板（在 `_posts/` 根目录，记得移进分栏文件夹） |
| `npm run deploy` | 部署（若配置了部署方式） |
