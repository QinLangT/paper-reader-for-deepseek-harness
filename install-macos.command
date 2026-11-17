#!/bin/bash
# macOS installer companion for the four DSH plugins in this repository.
#
# It never touches the DSH profile: installing into a profile is the plugin
# manager's job (DSH owns that file and locks it while running). This script
# checks the prerequisites, prints the exact absolute paths to paste into
# 插件 → 添加插件, copies them to the clipboard, and can run the smoke tests.
#
#   ./install-macos.command            interactive: checks, copies paths, offers smoke tests
#   ./install-macos.command --check    checks only, no prompts, no clipboard write
#   ./install-macos.command --smoke    checks, copies paths, runs smoke tests without asking
#   ./install-macos.command --help     this text
#
# Requires nothing but macOS's own tooling (bash, awk, sed, pbcopy).

set -u

HERE=$(cd "$(dirname "$0")" && pwd)
APPLICATIONS_DIRS=("/Applications" "${HOME}/Applications")
DSH_MIN_VERSION="0.2.2-rc.2"
PLUGINS=(paper-answer math-reader md-live-preview formula-ocr)
VENV="${HOME}/Library/Application Support/dsh-formula-ocr/venv"
MODEL_CACHE="${HOME}/Library/Caches/dsh-formula-ocr"

MODE="interactive"
case "${1:-}" in
  --check) MODE="check" ;;
  --smoke) MODE="smoke" ;;
  --help|-h)
    sed -n '3,16p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  "") ;;
  *)
    printf '未知参数：%s（用 --check / --smoke / --help）\n' "$1" >&2
    exit 2
    ;;
esac

PROBLEMS=0
WARNINGS=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; WARNINGS=$((WARNINGS + 1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; PROBLEMS=$((PROBLEMS + 1)); }
note() { printf '    %s\n' "$1"; }
head1() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# Compare dotted versions, rc-number aware: prints 1 when $1 >= $2.
version_ge() {
  # BSD awk (macOS default) only accepts functions at the top level, never
  # inside a rule or BEGIN, so key() sits outside BEGIN here.
  awk -v a="$1" -v b="$2" '
    function key(v,  n,p,maj,min,pat,pre) {
      n = split(v, p, /[-.]/)
      maj = p[1] + 0; min = p[2] + 0; pat = p[3] + 0
      if (n >= 5 && p[4] == "rc") pre = p[5] + 0
      else if (n >= 4 && p[4] == "rc") pre = p[5] + 0
      else pre = 9999
      return (maj * 1000000 + min * 1000 + pat) * 10000 + pre
    }
    BEGIN { print (key(a) >= key(b)) ? 1 : 0 }
  '
}

head1 "1. 系统与 DSH"

if [ "$(uname -s)" != "Darwin" ]; then
  bad "这不是 macOS（uname: $(uname -s)）；本脚本只处理 macOS，其他平台请看 README.md"
else
  ok "macOS $(sw_vers -productVersion)（$(uname -m)）"
fi

APP=""
for dir in "${APPLICATIONS_DIRS[@]}"; do
  if [ -d "${dir}/DeepSeek Harness.app" ]; then
    APP="${dir}/DeepSeek Harness.app"
    break
  fi
done

DSH_VERSION=""
if [ -n "${APP}" ]; then
  ok "DeepSeek Harness：${APP}"
  # The runtime description lives under primary-runtime since the bundled
  # runtime split; older layouts kept it one level up.
  RUNTIME_JSON="${APP}/Contents/Resources/runtime/primary-runtime/runtime.json"
  [ -f "${RUNTIME_JSON}" ] || RUNTIME_JSON="${APP}/Contents/Resources/runtime/runtime.json"
  if [ -f "${RUNTIME_JSON}" ]; then
    DSH_VERSION=$(sed -n 's/.*"desktopVersion"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "${RUNTIME_JSON}" | head -1)
  fi
  if [ -z "${DSH_VERSION}" ]; then
    warn "读不到 DSH 版本（${RUNTIME_JSON}）；请确认版本 ≥ ${DSH_MIN_VERSION}"
  elif [ "$(version_ge "${DSH_VERSION}" "${DSH_MIN_VERSION}")" = "1" ]; then
    ok "DSH 版本 ${DSH_VERSION}（≥ ${DSH_MIN_VERSION}）"
  else
    bad "DSH 版本 ${DSH_VERSION} 低于 ${DSH_MIN_VERSION}；插件/包机制从该版本起才有"
  fi
else
  bad "没找到 /Applications/DeepSeek Harness.app；先装 DSH 桌面版"
  note "装好后重新运行本脚本。"
fi

head1 "2. 插件目录"

MISSING=0
for plugin in "${PLUGINS[@]}"; do
  dir="${HERE}/${plugin}"
  if [ ! -d "${dir}" ]; then
    bad "${plugin}：目录不存在（${dir}）"
    MISSING=$((MISSING + 1))
  elif [ ! -f "${dir}/package.json" ] || [ ! -f "${dir}/cordis.patch.yml" ]; then
    bad "${plugin}：缺少 package.json 或 cordis.patch.yml"
    MISSING=$((MISSING + 1))
  else
    ok "${plugin}"
  fi
done
if [ "${MISSING}" -gt 0 ]; then
  note "请确认脚本和四个插件目录在同一层，即仓库根目录（当前：${HERE}）。"
fi

head1 "3. 公式识别的 Python（只有 formula-ocr 的 local 模式需要）"

PYTHON=""
if [ -x "${VENV}/bin/python" ]; then
  PYTHON="${VENV}/bin/python"
  ok "插件专用 venv：${VENV}"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON=$(command -v python3)
  warn "没有 ${VENV}；先按 MACOS.md 建 venv（系统 python3 通常是 3.9，跑不了模型）"
else
  warn "没有 python3；formula-ocr 的 local 识别不可用（可改用 llm 模式）"
fi

if [ -n "${PYTHON}" ]; then
  PY_VERSION=$("${PYTHON}" -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null || echo "?")
  if [ "${PY_VERSION}" = "?" ]; then
    warn "解释器无法运行：${PYTHON}"
  else
    if [ "$(version_ge "${PY_VERSION}" "3.10")" = "1" ]; then
      ok "Python ${PY_VERSION}"
    else
      bad "Python ${PY_VERSION} 低于 3.10（${PYTHON}）；local 识别需要 3.10+"
    fi
    if "${PYTHON}" -c 'import bobine' >/dev/null 2>&1; then
      ok "bobine 已安装"
    elif "${PYTHON}" -c 'import rapid_latex_ocr' >/dev/null 2>&1; then
      ok "rapid_latex_ocr 已安装"
    else
      warn "没有识别后端（bobine / rapid_latex_ocr）"
    fi
  fi
fi

if [ -d "${MODEL_CACHE}" ]; then
  ok "模型缓存 $(du -sh "${MODEL_CACHE}" 2>/dev/null | awk '{print $1}')：${MODEL_CACHE}"
else
  warn "还没有模型缓存；首次识别会下载约 303 MB，或先跑 prefetch_texeller.py"
fi

head1 "4. 屏幕录制权限（公式识别的截屏按钮）"

note "macOS 不提供命令行查询该权限的方式，请自行确认："
note "系统设置 → 隐私与安全性 → 屏幕录制 → 打开 DeepSeek Harness → 退出并重新打开 DSH"
note "未授权时按钮会直接提示「未授予屏幕录制权限」，不会静默失败。"

head1 "5. 安装路径（已复制到剪贴板）"

PATHS=()
for plugin in "${PLUGINS[@]}"; do
  PATHS+=("${HERE}/${plugin}")
done
printf '%s\n' "${PATHS[@]}" | sed 's/^/    /'
if [ "${MODE}" != "check" ]; then
  if printf '%s\n' "${PATHS[@]}" | pbcopy 2>/dev/null; then
    printf '\n    已复制四个路径；在 DSH「插件 → 添加插件」里一次粘贴一个。\n'
  else
    printf '\n    pbcopy 不可用，请手动复制上面的路径。\n'
  fi
fi

head1 "6. 冒烟测试"

run_smoke() {
  local app_bin="${APP}/Contents/MacOS/DeepSeek Harness"
  if [ -z "${APP}" ] || [ ! -x "${app_bin}" ]; then
    warn "找不到 DSH 可执行文件，跳过冒烟测试"
    return
  fi
  local ran=0
  for plugin in "${PLUGINS[@]}"; do
    local test_file="${HERE}/${plugin}/test/smoke.mjs"
    if [ ! -f "${test_file}" ]; then
      note "${plugin}：没有 test/smoke.mjs，跳过"
      continue
    fi
    ran=$((ran + 1))
    if ELECTRON_RUN_AS_NODE=1 "${app_bin}" "${test_file}" >/dev/null 2>&1; then
      ok "${plugin} 冒烟测试通过"
    else
      bad "${plugin} 冒烟测试失败（手动运行看输出：ELECTRON_RUN_AS_NODE=1 \"${app_bin}\" \"${test_file}\"）"
    fi
  done
  [ "${ran}" -gt 0 ] || warn "没有可运行的冒烟测试"
}

case "${MODE}" in
  smoke) run_smoke ;;
  check) note "（--check 模式不执行测试）" ;;
  interactive)
    printf '  现在跑冒烟测试吗？需要几秒 [Y/n] '
    read -r answer || answer="n"
    case "${answer}" in
      ""|y|Y|yes|YES) run_smoke ;;
      *) note "跳过。随时可以运行：./install-macos.command --smoke" ;;
    esac
    ;;
esac

head1 "结果"

if [ "${PROBLEMS}" -gt 0 ]; then
  printf '  \033[31m%d 个问题\033[0m，%d 个提醒。先按上面的提示处理，再重跑本脚本。\n' "${PROBLEMS}" "${WARNINGS}"
  printf '  详细说明：%s/MACOS.md\n' "${HERE}"
  exit 1
fi
if [ "${WARNINGS}" -gt 0 ]; then
  printf '  可以安装，但有 %d 个提醒（多半只影响公式识别的 local 模式）。\n' "${WARNINGS}"
else
  printf '  全部就绪。\n'
fi
printf '  下一步：DSH → 插件 → 添加插件 →「安装第三方插件」→ 粘贴上面的路径，一次一个。\n'
printf '  装完按 ⌘R 刷新；细节与故障排查见 %s/MACOS.md\n' "${HERE}"
exit 0
