# macOS 安装与使用

四个插件在 macOS 上的完整安装流程。和 Windows 的差别集中在两处：**屏幕录制权限**（公式识别要截屏）和 **Python 解释器**（macOS 自带的 `python3` 是 3.9，跑不了公式识别的模型）。其余三个插件是纯 JS，macOS 与 Windows 表现一致。

本文件在 macOS 26.6（Apple Silicon，DSH 0.2.2-rc.3）上核对，命令都是复制即可运行的形态。

## 前提

| 项目 | 要求 |
|---|---|
| macOS | 12 及以上（Apple Silicon 或 Intel） |
| DSH | 桌面版 **≥ 0.2.2-rc.2**；本文在 0.2.2-rc.3 上核对 |
| Node / pnpm / 编译工具 | 都不需要 |
| Python（仅 `formula-ocr` 的本地识别） | 3.10 – 3.14；`llm` 识别模式不需要 Python |

四个插件的 macOS 依赖：

| 插件 | 需要什么 |
|---|---|
| `paper-answer` | 无 |
| `math-reader` | 无 |
| `md-live-preview` | 无 |
| `formula-ocr` | 屏幕录制权限（截屏）+ Python 3.10+（仅 `local` 识别；切 `llm` 则只要权限） |

## 一步：运行自检脚本（可选，但推荐先跑）

```bash
cd /path/to/paper-reader-for-deepseek-harness
./install-macos.command
```

双击 `install-macos.command` 也能运行。它做四件事：检查 DSH 版本与四个插件目录、检查 Python 与模型缓存、把四个要填的绝对路径复制到剪贴板、可选地跑冒烟测试。

它**不会**改 DSH 的 profile、不会装 Python 包、不会要 sudo。想只看结果不装任何东西：

```bash
./install-macos.command --check
```

## 安装四个插件（约 2 分钟）

DSH 左侧 **插件** → **添加插件** →「安装第三方插件」，在「包名或地址」一次填一个**绝对路径**：

```
/Users/<你>/dsh-plugins/paper-reader-for-deepseek-harness/paper-answer
/Users/<你>/dsh-plugins/paper-reader-for-deepseek-harness/math-reader
/Users/<你>/dsh-plugins/paper-reader-for-deepseek-harness/md-live-preview
/Users/<你>/dsh-plugins/paper-reader-for-deepseek-harness/formula-ocr
```

> 目录安装记录为 `link:绝对路径`：装完**不要移动或删除这个仓库**，否则插件失效。
> 建议纯 ASCII 路径，别放 iCloud Drive / OneDrive 目录——同步中途的文件锁会让安装失败。

不想克隆仓库也行，直接填 git 子目录（每个插件一行，要固定版本再加 `#<40 位 commit>`）：

```
github:QinLangT/paper-reader-for-deepseek-harness#path:/paper-answer
github:QinLangT/paper-reader-for-deepseek-harness#path:/math-reader
github:QinLangT/paper-reader-for-deepseek-harness#path:/md-live-preview
github:QinLangT/paper-reader-for-deepseek-harness#path:/formula-ocr
```

装完刷新页面（`⌘R`），插件页应出现四行且已启用。

## 屏幕录制权限（公式识别必做）

`formula-ocr` 的「截屏框选」按钮要截整屏。macOS 把这个能力锁在「屏幕录制」权限后面，没授权时按钮会提示：

> 未授予屏幕录制权限。macOS 需要给本应用屏幕录制权限：系统设置 → 隐私与安全性 → 屏幕录制，开启 DeepSeek Harness，然后退出并重新打开 DeepSeek Harness。

步骤：

1. 打开 **系统设置** → **隐私与安全性** → **屏幕录制**。
2. 打开 **DeepSeek Harness** 的开关（首次点击截屏按钮时系统也可能自己弹窗）。
3. **退出并重新打开** DeepSeek Harness——权限在进程启动时生效，不重启仍是旧状态。

两点补充：

- 桌面版走 Electron 的 `desktopCapturer`，权限记在 DeepSeek Harness 名下。
- 用 `dsh web` 在浏览器里跑时，Host 不在 Electron 主进程里，会退回系统命令 `/usr/sbin/screencapture`；它继承的是**启动它的那个进程**的权限（通常是终端），所以同样要在上面那个面板里给终端开权限。

剪贴板按钮和图片文件按钮不需要这个权限。

## 公式识别的 Python（只有 `local` 识别需要）

macOS 自带的 `/usr/bin/python3` 是 **3.9.6**，低于两个本地后端的要求（bobine 要求 3.10+），所以不能直接拿它跑。插件按这个顺序找解释器：

1. 行配置里的 `python:`（如果写了）；
2. `~/Library/Application Support/dsh-formula-ocr/venv/bin/python`（下面创建的 venv，**推荐**）；
3. `PATH` 上的 `python3` / `python`。

### 1. 先确认手边有 3.10+

```bash
python3 -V
```

`/Library/Frameworks/Python.framework` 或 Homebrew 的 `python3` 一般够新；`/usr/bin/python3`（3.9.6）不够。没有的话装一个：<https://www.python.org/downloads/macos/> 或 `brew install python@3.13`。

### 2. 建 venv 并装包

路径固定成上面第 2 条，插件会自动用它，**不需要改任何配置**：

```bash
VENV="$HOME/Library/Application Support/dsh-formula-ocr/venv"
python3 -m venv "$VENV"
"$VENV/bin/python" -m pip install --upgrade pip
"$VENV/bin/python" -m pip install "bobine[cpu]" requests
"$VENV/bin/python" -c "import bobine, onnxruntime; print('ok', onnxruntime.__version__)"
```

- 用 venv 也顺手绕开 Homebrew Python 的 `externally-managed-environment` 报错（PEP 668 不允许往系统环境装包）。
- **Intel Mac 注意**：`bobine` 只发布 macOS **arm64** wheel（cp310–cp314），没有 x86_64 版本。Intel 机器上请改用另一个后端 `rapid_latex_ocr`，或直接把 `recognizer` 切成 `llm`。
- 想用别的解释器/环境，在插件配置里写 `python:` 覆盖即可（路径含空格也能用）。

### 3. 预取模型（可选，推荐）

首次识别会在请求里下载权重（TexTeller int8 约 303 MB），网络差时很慢。用插件自带的多连接预取脚本把它提前拉好：

```bash
"$HOME/Library/Application Support/dsh-formula-ocr/venv/bin/python" \
  formula-ocr/tools/prefetch_texeller.py --connections 12
```

模型落在 `~/Library/Caches/dsh-formula-ocr/bobine`（macOS 的缓存目录；Windows 是 `%LOCALAPPDATA%\dsh-formula-ocr`）。之后识别完全离线。

### 先用一张自己的图验证输出质量

本地模型的输出质量取决于截图本身（分辨率、字体、是否是排版公式）。本机用自己渲染的合成图测试时，int8 权重返回过与输入无关的结果；这既可能是图不像真实截图，也可能是该权重在本机的运行库上不理想。所以第一次装完，拿一张**你自己论文里的公式截图**试一次：

- 结果对得上 → 继续用 `local`，全离线。
- 结果明显不对 → 换 `llm` 模式（下方），或按上面的命令另取 fp32 权重（约 1.19 GB，更准但更慢），并确认 worker 用的是 fp32。

插件对明显的失控输出（同一命令重复几十次、超长）会拒绝插入，但"看起来像公式的错答案"拦不住，这一步只能人眼确认。

### 不想装 Python？

把 `formula-ocr` 的识别方式切成 `llm`：

```yaml
- id: formula-ocr
  name: '@local/formula-ocr'
  config:
    recognizer: llm
    provider: deepseek-account
    model: deepseek-flash
```

每个截图走一次视觉模型请求，不需要 Python 和本地模型（截图仍要屏幕录制权限）。

## 验证（30 秒）

1. **插件页**：四行都在、已启用：数学公式阅读器 / 论文问答 / Markdown 实时预览 / 公式识别。
2. **论文问答**：问一句论文里的符号或式子，第一句应直接给答案；打 `/paper-answer` 可强制走完整协议。
3. **数学公式阅读器**：让它回答一个含公式的问题，回复末尾出现「∑ 公式 N」。
4. **Markdown 实时预览**：输入框打 `# 标题` 或 `$\epsilon$`，上方出现预览卡片。
5. **公式识别**：输入框工具行出现三个按钮（框选 / 剪贴板 / 文件）。第一次点框选会最小化窗口约 2 秒再恢复，随后拖框选中公式，`$…$` 出现在光标处。
6. **冒烟测试**（可选）：

   ```bash
   ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" \
     paper-answer/test/smoke.mjs
   ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" \
     math-reader/test/smoke.mjs
   ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" \
     md-live-preview/test/smoke.mjs
   ```

   或直接 `./install-macos.command --smoke`。

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| 双击 `install-macos.command` 提示「无法打开，因为来自身份不明的开发者」 | 右键 → 打开；或先 `xattr -d com.apple.quarantine install-macos.command` |
| 公式识别报「未授予屏幕录制权限」 | 见上文权限三步；授权后必须重启 DSH |
| 公式识别报「本地识别不可用 / Local model is not ready」 | 没有 3.10+ 解释器或没装 `bobine`。按上文建 venv；`"$VENV/bin/python" -c "import bobine"` 应无报错 |
| `pip install` 报 `externally-managed-environment` | 这是 Homebrew Python 的保护，用 venv（上文）即可 |
| Intel Mac 上 `pip install bobine` 失败或试图编译 Rust | bobine 无 macOS x86_64 wheel；改用 `rapid_latex_ocr` 或 `llm` 模式 |
| 首次识别很慢（几十秒到几分钟） | 正在下载 ~303 MB 权重；用预取脚本，之后离线 |
| 插件页显示但按钮/栏不出现 | 刷新页面（`⌘R`）；仍不行则在插件页把该插件**停用 → 启用**一次 |
| 移动了仓库目录后插件失效 | 目录安装是 `link:`；放回原路径，或移除后按新路径重装 |
| `dsh web`（浏览器）里截屏失败 | 浏览器模式没有 Electron 的 `desktopCapturer`，走 `screencapture`；给**启动它的终端**开屏幕录制权限 |

## 更新与卸载

- 更新：`git pull` 后，在插件页把插件**停用 → 启用**（只存盘不会重载已加载的 JS），或重启 DSH。
- 卸载：插件页 **移除**，同时停掉本地识别进程并撤销提示词段落与路由。
- 删 venv / 模型缓存（磁盘）：`rm -rf "$HOME/Library/Application Support/dsh-formula-ocr" ~/Library/Caches/dsh-formula-ocr`。

## 与 Windows 的差异一览

| 项目 | macOS | Windows |
|---|---|---|
| 截屏实现 | Electron `desktopCapturer`；非 Electron 时 `/usr/sbin/screencapture` | Electron `desktopCapturer`；非 Electron 时 PowerShell + GDI+ |
| 截屏权限 | 系统设置 → 隐私与安全性 → 屏幕录制 | 无此权限 |
| Python | 需自行准备 3.10+（系统 3.9 不够）；插件优先用 `~/Library/Application Support/dsh-formula-ocr/venv` | `python3`/`python` 通常已够；可用 `C:\Python312\python.exe` 指定 |
| 模型缓存 | `~/Library/Caches/dsh-formula-ocr` | `%LOCALAPPDATA%\dsh-formula-ocr` |
| 快捷键 | `⌘R` 刷新、`⌘⇧4` 系统截图后走剪贴板按钮 | `F5`、`Win+Shift+S` |

## 已验证 / 未验证

- 已验证（macOS 26.6，arm64，DSH 0.2.2-rc.3）：四个插件以目录方式安装并处于活动状态；`formula-ocr` 的识别与截屏两个路由注册成功；截屏路由在授予权限后返回真实屏幕 PNG（走 `screencapture` 回退），未授权时返回可操作的权限提示；Python worker 在插件专用 venv 下启动为 `bobine-texteller-int8`，模型从 `~/Library/Caches/dsh-formula-ocr` 读取；失控输出被质量门拒绝（返回 `DEGENERATE`）；`math-reader`、`paper-answer`、`md-live-preview` 三份冒烟测试通过。
- 识别质量：用 matplotlib / CodeCogs 渲染的合成图测试时，int8 权重返回了与输入无关的结果（详见上文“先用一张自己的图验证输出质量”）。管道本身（venv、缓存路径、协议、质量门）是通的，但本机没有用真实论文截图验证过准确率。
- 未验证：Intel Mac 实机；fp32 权重（约 1.19 GB，未下载完）；`llm` 识别模式（需要视觉模型路由）；拖框选区的实际手感与插入光标后的排版。
