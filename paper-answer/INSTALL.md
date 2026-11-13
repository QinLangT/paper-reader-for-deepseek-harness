# 安装「论文问答」（Windows / macOS / Linux）

包名 `@local/dsh-paper-answer`，版本 0.1.0。纯 JavaScript：没有原生模块、没有客户端 bundle、没有构建步骤——DSH 自带包管理器就够。

## 前提

- DSH **桌面版**，或自行运行的 `dsh web`，版本不低于 **0.2.2-rc.2**（插件/包机制从这一版起）。
- 只需要能打开 DSH 的「插件」页；不需要管理员权限，不需要 Node。

## 方式 A：本地文件夹（最省事）

1. 把 `paper-answer` 整个文件夹放到一个**固定位置**，例如 `D:\Tools\paper-answer`。
2. DSH 左侧 → **插件** → **添加插件** →「安装第三方插件」。
3. 「包名或地址」填**文件夹的绝对路径**，例如 `D:\Tools\paper-answer`（macOS 形如 `/Users/you/Downloads/paper-answer`）。
4. 点**安装**，确认插件行已启用。
5. 刷新页面（F5 / Cmd+R）。

> 目录安装是**链接**：profile 里记录为 `link:绝对路径`，此后别移动或删除这个文件夹。

## 方式 B：`.tgz` 单文件（装成拷贝）

把 `dsh-paper-answer-0.1.0.tgz` 放到本地、**不要解压**，「包名或地址」填它的绝对路径，例如 `C:\Users\you\Downloads\dsh-paper-answer-0.1.0.tgz`。

> 安装器按 pnpm 的 spec 解析来源：绝对路径以 `.tgz` / `.tar.gz` 结尾即按压缩包处理，装进 profile 的是拷贝。
> 代价：profile 里会留下一条 `file:` 指向这个 tgz，删掉它之前先想好以后还要不要重装。

## 方式 C：npm 包名（发布之后，最好维护）

把包发布到 npm（`@local/...` 是本地 scope，发布前改个你能用的包名），然后填 `dsh-paper-answer@0.1.0` 或只填包名取最新版；之后插件页会提示可更新版本。
私有源在同一个对话框的「安装源」里选「自定义地址」。

## 方式 D：Git 仓库

把包内容放进仓库，填 `github:你的账号/仓库名`，要固定版本加 `#<40 位 commit>`。

## 装好之后

- 问论文里的某段、某式子、某符号，回复第一句直接回答，然后是一句可判真假的结论、最多 4 句展开、最多 3 项展开菜单。
- 说「太抽象」「太深」「太宽」「这不是我要问的」，下一轮会换表征而不是重讲一遍。
- 打 `/paper-answer` 可以直接强制走完整协议。
- 长期偏好（「以后都先给结论」）会写进 workspace 的 `.dsh/paper-answer/style.md`，跨会话生效。

## 停用 / 卸载

插件页里**停用**立即生效，**移除**会删除依赖。两者都会一并撤销提示段与 `/paper-answer`。

## 平台说明

- 纯 JS / JSON / SVG，无原生依赖、无路径假设，Windows / macOS / Linux 表现一致。
- 插件内部记的 `stylePath` 默认是 `.dsh/paper-answer/style.md`，相对**当前 workspace**，与插件安装位置无关。
- 提示段属于整个 profile；技能按需加载。

## 许可

MIT。
