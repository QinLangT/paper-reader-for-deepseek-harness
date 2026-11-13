# 安装「数学公式阅读器」（Windows / macOS / Linux）

包名 `@local/dsh-math-reader`，版本 1.0.0。纯 JavaScript：没有原生模块，不需要 Node、pnpm 或编译——DSH 桌面版自带包管理器。

## 前提

- DSH **桌面版**，或自行运行的 `dsh web`（网页界面），版本不低于 **0.2.2-rc.2**。
- 只需要能打开 DSH 的「插件」页；不需要管理员权限。

## 方式 A：本地文件夹（Windows 最省事）

1. 解压 `dsh-math-reader-1.0.0.zip`，得到文件夹，例如 `D:\Tools\dsh-math-reader`。
2. DSH 左侧 → **插件** → **添加插件** →「安装第三方插件」。
3. 在「包名或地址」填入**文件夹的绝对路径**，例如 `D:\Tools\dsh-math-reader`（macOS 形如 `/Users/you/Downloads/dsh-math-reader`）。
4. 点 **安装**，确认插件行已启用。
5. 刷新页面（F5 / Cmd+R）。

> 目录安装是**链接**：profile 里记录为 `link:`，此后别移动或删除这个文件夹。

## 方式 B：`.tgz` 单文件（装成拷贝）

把 `dsh-math-reader-1.0.0.tgz` 放到本地，**不要解压**，在「包名或地址」填它的绝对路径，例如 `C:\Users\you\Downloads\dsh-math-reader-1.0.0.tgz`。

> 安装器按 pnpm 的 spec 解析来源：绝对路径以 `.tgz` / `.tar.gz` 结尾即按压缩包处理，装进 profile 的是拷贝，源文件可以删掉。

## 方式 C：npm 包名（发布之后，最好维护）

把包发布到 npm 后，在「包名或地址」填 `dsh-math-reader@1.0.0` 或只填 `dsh-math-reader`（最新版）。之后插件页会提示可更新版本，能一键更新。

若使用私有源，在同一对话框的「安装源」里选「自定义地址」并填写源地址。

## 方式 D：Git 仓库

把包内容放进 GitHub 仓库，填 `github:你的账号/仓库名`；要固定版本可加 `#<40 位 commit>`。私有仓库需要 pnpm 能用你的 Git 凭据。

## 装好之后

- 含公式的回复末尾（反馈按钮上方）会出现 `∑ 公式 N`：点开即可看到排版结果、每条前面的一句话摘录、`TeX` 源码开关和「复制 LaTeX」。
- 最新一条回复若把公式写在反引号里，会自动展开；更早的回复保持折叠，点一下即可展开。
- 往后的回复会用 `$…$` / `$$…$$` 写数学（插件加的提示词段落生效），聊天视图就地排版。

## 停用 / 卸载

插件页里 **停用** 立即生效，**移除** 会删除依赖；两者都会一并撤销提示词段落。

## 平台说明

- 纯 JS/CSS/SVG/JSON，无原生依赖、无路径假设，Windows / macOS / Linux 表现一致。
- 对方**不需要构建**：`client.js` 已内联 KaTeX 0.18.7，样式和字体复用 DSH 页面自带的 KaTeX 资源。
- 公式栏需要网页界面；终端、SDK 会话只会受提示词段落影响（回复里的 `$…$` 原样显示）。

## 把它发布给自己的读者

`@local/...` 是本地 scope，不能发布到 npm；换一个你能发布的包名即可，代码不用改：

1. `package.json` 的 `name` 改成你的包名，例如 `dsh-math-reader` 或 `@你的scope/dsh-math-reader`（`private` 已移除）。
2. `cordis.patch.yml` 里的 `name:` 同步改成同一个包名。
3. 重新构建客户端 bundle：`node build.mjs`（bundle 的 module id 会自动跟随 `package.json` 的 `name`）。
4. `npm publish`（scoped 包加 `--access public`）。
5. 其他人按方式 C 安装。

## 许可

插件本身 MIT；内置 KaTeX 0.18.7 为 MIT，见 `THIRD-PARTY-NOTICES.md`。
