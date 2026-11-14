# paper-reader-for-deepseek-harness

三个 DeepSeek Harness 插件：一个把「问论文」的回答形状固定下来，一个把回复里的公式排版成 KaTeX，一个让输入框里的 Markdown（含公式）实时渲染。

Three DSH plugins: one fixes the shape of an answer about a paper, one typesets a reply's formulas with KaTeX, and one renders the Markdown you are typing — formulas included — as you type it.

## 包含什么

| 目录 | 包名 | 版本 | 作用 | 依赖 |
|---|---|---|---|---|
| [`paper-answer/`](paper-answer/) | `@local/dsh-paper-answer` | 0.1.0 | 常驻一段「论文问答约定」+ 一个协议技能：第一句直答、≤40 字可判真假结论、≤4 句展开 + ≤3 项菜单、断言分三级、新记号同段解释 | 无 |
| [`math-reader/`](math-reader/) | `@local/dsh-math-reader` | 1.0.0 | 回合末尾的「∑ 公式 N」公式栏（内联 KaTeX，不改写原消息）+ 一段数学记号提示 | 无 |
| [`md-live-preview/`](md-live-preview/) | `@local/md-live-preview` | 1.1.0 | 输入框上方的 Markdown 实时预览卡：标题、列表、表格、代码块、链接、图片、KaTeX 公式（`$x$`、`$$…$$`、```` ```math ````），每输入一个字就重渲；工具栏眼睛按钮开关 | 无 |

三个插件互不依赖，可以只装其中一个。都是纯 JS / JSON / SVG，没有原生模块，不需要 Node、pnpm 或编译。

## 安装

前提：DSH **≥ 0.2.2-rc.2**，能打开左侧 **插件** → **添加插件** →「安装第三方插件」。

### 路线 1：本地文件夹（推荐，最能改）

下载仓库（**Code → Download ZIP**）或 `git clone`，解压到一个不会被移动的位置，然后每次填一个**绝对路径**：

| 系统 | 填什么 |
|---|---|
| Windows | `D:\dsh-plugins\paper-reader-for-deepseek-harness\math-reader` |
| Windows | `D:\dsh-plugins\paper-reader-for-deepseek-harness\paper-answer` |
| Windows | `D:\dsh-plugins\paper-reader-for-deepseek-harness\md-live-preview` |
| macOS / Linux | `/Users/you/dsh-plugins/paper-reader-for-deepseek-harness/math-reader` |
| macOS / Linux | `/Users/you/dsh-plugins/paper-reader-for-deepseek-harness/md-live-preview` |

> 目录安装记录为 `link:绝对路径`：之后**不要移动或删除这个仓库**，否则插件失效。
> 建议放纯 ASCII 路径、别放 OneDrive/iCloud 同步目录（安装时的文件锁会失败）。

### 路线 2：`.tgz` 单文件

在要装的子目录里打包（仓库自带的构建产物已包含，不需要 Node 也能装）：

```bash
npm pack          # 或 pnpm pack
```

把得到的 `*.tgz` 放到固定位置、**不要解压**，在「包名或地址」填它的绝对路径。
装进 profile 的是拷贝，源目录可以删；代价是 profile 里留一条 `file:` 指向 tgz。

### 路线 3：git 子目录

直接填（每个插件一行）：

```
github:QinLangT/paper-reader-for-deepseek-harness#path:/math-reader
github:QinLangT/paper-reader-for-deepseek-harness#path:/paper-answer
github:QinLangT/paper-reader-for-deepseek-harness#path:/md-live-preview
```

要固定版本再加 `#<40 位 commit>`。私有仓库需要 Git 凭据可用。

## 装完怎么验（30 秒）

1. 插件页出现三行、已启用：**数学公式阅读器**、**论文问答**、**Markdown 实时预览**，各带自己的图标。
2. 论文问答：问论文里某句话、某个式子或某个符号。期望第一句直接回答，随后一句可判真假的结论、最多 4 句展开、最多 3 项展开菜单；打 `/paper-answer` 可强制走完整协议。
3. 数学公式阅读器：让它回答一个含公式的问题。若 TeX 被写在反引号里，回复末尾会出现「∑ 公式 N」，点开可见排版、TeX 源码、复制 LaTeX。
4. Markdown 实时预览：在输入框打 `# 标题`、`- [ ] 待办` 或 `$\epsilon$`。输入框上方出现「Markdown 预览」卡片并按格式渲染，回车发送后卡片消失；工具栏里模型选择器左侧的眼睛按钮可开关。
5. 冒烟测试（可选，需要 DSH 自带的 Electron 可执行文件；每个插件都有 `test/smoke.mjs`）：

   ```powershell
   # Windows
   $env:ELECTRON_RUN_AS_NODE = "1"
   & "C:\Program Files\DeepSeek Harness\DeepSeek Harness.exe" "D:\dsh-plugins\paper-reader-for-deepseek-harness\paper-answer\test\smoke.mjs"
   ```

   ```bash
   # macOS
   ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" ./paper-answer/test/smoke.mjs
   ```

## 改代码

- 改完在插件页把该插件**停用 → 启用**一次（只存盘不会重载已加载的 JS 模块），或重启 DSH。
- 改了 `math-reader/src/client.template.js` 或 `md-live-preview/src/client.template.js` 必须重新构建客户端 bundle，否则界面不变：在该目录跑 `node build.mjs`（会内联 `vendor/katex.min.js` 并跟随 `package.json` 的 `name`）。
- `client.js` 是构建产物，仓库里带着它是为了让使用者不需要构建。

## 结构

每个子目录都是一个完整 bundle：`package.json` 的 `dsh.bundle.patch` 指向自己的 `cordis.patch.yml`，安装时插入一行插件。`files` 字段列出打包时包含的运行时文件。

## 许可

MIT。`math-reader` 和 `md-live-preview` 都内联 KaTeX 0.18.7（MIT），归属见各自的 `THIRD-PARTY-NOTICES.md`。

## 验证状态

- 已验证（macOS，DSH 0.2.2-rc.2）：`paper-answer`、`math-reader` 安装并生效；提示段确实进入系统提示；`paper-answer` 技能可加载；`math-reader` 的公式栏在 `conversation.chat.turnTail` 注册为活动状态；两份冒烟测试通过；tgz 内容完整；git 子目录 spec 可安装（见提交历史）。
- 已验证（Windows，DSH 0.2.2-rc.3）：`md-live-preview` 以目录方式安装并生效，两个入口在 `conversation.input.dock`（order 15）与 `conversation.input.right`（order 5）注册为活动状态；`test/smoke.mjs` 37 项断言通过（行内/独立/围栏公式、货币不被误判、未闭合 `$$`、表格/列表/代码块、空草稿、24 个畸形输入）。
- 未验证：插件页里的图标渲染与预览卡的实际视觉未做截屏确认（本机无浏览器控制）；`md-live-preview` 在 macOS 上未实机试过。
