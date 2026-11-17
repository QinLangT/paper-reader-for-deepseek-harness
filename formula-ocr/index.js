/**
 * Host half of the formula OCR plugin.
 *
 * One loopback HTTP route accepts a base64 screenshot and answers with Markdown
 * math. Two recognizers behind it:
 *
 * - `llm`   – sends the image to the profile's vision model route through the
 *             Harness LLM service.
 * - `local` – keeps one Python worker (tools/formula_worker.py, TexTeller or
 *             RapidLaTeXOCR on ONNX) alive and asks it; no model API and no
 *             token spend.
 *
 * Screen capture runs on the Host, so it follows the Host's platform: Electron's
 * `desktopCapturer` inside the desktop app (macOS needs Screen Recording there),
 * `screencapture` on macOS, and DPI-aware GDI+ through PowerShell on Windows.
 *
 * The Client half (client.js) owns the composer buttons; the browser reaches
 * this route with a same-origin POST because the page owns no Remote namespace.
 */

import { readFile, unlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url))
const HELPER_PATH = join(PACKAGE_DIR, 'tools', 'formula_worker.py')

const DEFAULT_PATH = '/_formula-ocr/recognize'
const CAPTURE_PATH = '/_formula-ocr/capture'
const DEFAULT_PROVIDER = 'deepseek-account'
const DEFAULT_MODEL = 'deepseek-flash'
const DEFAULT_MAX_TOKENS = 4096
const MAX_BODY_BYTES = 16 * 1024 * 1024
const LLM_TIMEOUT_MS = 180000
const LOCAL_TIMEOUT_MS = 120000
const LOCAL_START_TIMEOUT_MS = 300000
const MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const REQUEST_MARKER = 'x-dsh-formula-ocr'
const SCREEN_PERMISSION_HINT = 'macOS blocks screen capture without permission for this app: System Settings → Privacy & Security → Screen Recording, turn on DeepSeek Harness, then quit and reopen DeepSeek Harness.'

const INSTRUCTION = [
  'You transcribe the mathematical content of a screenshot into Markdown with LaTeX math.',
  '',
  'Rules:',
  '1. Output only the transcription. No preamble, no explanation, no surrounding code fence.',
  '2. Inline math uses $...$; display math uses $$...$$ on its own lines.',
  '3. Keep surrounding natural-language text as ordinary Markdown.',
  '4. Use standard LaTeX commands such as \\frac, \\sqrt, \\sum, \\int, \\alpha, \\mathbb, \\operatorname.',
  '5. Use \\begin{aligned} ... \\end{aligned} for multi-line derivations and aligned relations.',
  '6. A table of formulas becomes one formula per line; a labelled equation keeps its label as text.',
  '7. If the image holds no mathematical content, transcribe the visible text instead.',
].join('\n')

export const inject = ['attachments', 'llm', 'webServer']

/**
 * Register the recognition route and the owned local worker.
 * @param ctx - Host context with `attachments`, `llm`, and `webServer`.
 * @param config - Optional row config: `recognizer`, `provider`, `model`, `maxTokens`, `prompt`, `python`.
 */
export function apply(ctx, config) {
  const settings = normalizeConfig(config)
  const recognizer = createLocalRecognizer(ctx, settings)

  ctx.effect(() => () => recognizer.shutdown(), 'formula-ocr: local recognizer')
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: CAPTURE_PATH,
      handler: (req, res) => {
        handleCapture(ctx, req, res).catch((error) => {
          sendJson(res, 500, { ok: false, error: 'INTERNAL_ERROR', detail: describe(error) })
        })
      },
    }),
    'formula-ocr: capture route',
  )
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: DEFAULT_PATH,
      handler: (req, res) => {
        handle(ctx, settings, recognizer, req, res).catch((error) => {
          sendJson(res, 500, { ok: false, error: 'INTERNAL_ERROR', detail: describe(error) })
        })
      },
    }),
    'formula-ocr: recognition route',
  )
}

/**
 * Normalize the row config; every field is optional.
 * @param raw - Row config as written in the patch.
 */
function normalizeConfig(raw) {
  const value = raw !== null && typeof raw === 'object' ? raw : {}
  // The route path stays fixed: the Client bundle posts to the constant below.
  return {
    // Local is the default: no model API, no token spend. `llm` opts back in.
    recognizer: value.recognizer === 'llm' ? 'llm' : 'local',
    provider: isNonEmptyString(value.provider) ? value.provider : '',
    model: isNonEmptyString(value.model) ? value.model : '',
    python: isNonEmptyString(value.python) ? value.python : '',
    backend: isNonEmptyString(value.backend) ? value.backend : 'auto',
    hfEndpoint: isNonEmptyString(value.hfEndpoint) ? value.hfEndpoint : '',
    maxTokens: Number.isFinite(value.maxTokens) && value.maxTokens > 0
      ? Math.floor(value.maxTokens)
      : DEFAULT_MAX_TOKENS,
    prompt: isNonEmptyString(value.prompt) ? value.prompt : INSTRUCTION,
  }
}

/**
 * Answer one recognition request.
 * @param ctx - Host context.
 * @param settings - Normalized row config.
 * @param recognizer - Owned local recognizer.
 * @param req - Node request.
 * @param res - Node response.
 */
async function handle(ctx, settings, recognizer, req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST')
    sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' })
    return
  }
  if (req.headers[REQUEST_MARKER] !== '1') {
    sendJson(res, 403, { ok: false, error: 'FORBIDDEN' })
    return
  }
  if (!sameServedOrigin(readOrigin(ctx), req.headers.origin)) {
    sendJson(res, 403, { ok: false, error: 'FORBIDDEN_ORIGIN' })
    return
  }

  let body
  try {
    body = await readJsonBody(req)
  } catch (error) {
    const tooLarge = error instanceof Error && error.code === 'BODY_TOO_LARGE'
    sendJson(res, tooLarge ? 413 : 400, { ok: false, error: tooLarge ? 'BODY_TOO_LARGE' : 'BAD_REQUEST' })
    return
  }

  const mediaType = normalizeMediaType(body && body.mediaType)
  if (!mediaType) {
    sendJson(res, 400, { ok: false, error: 'UNSUPPORTED_MEDIA_TYPE' })
    return
  }
  const data = decodeBase64(body && body.data)
  if (!data || data.length === 0) {
    sendJson(res, 400, { ok: false, error: 'EMPTY_IMAGE' })
    return
  }
  const name = isNonEmptyString(body && body.name) ? body.name.slice(0, 120) : undefined

  if (settings.recognizer === 'local') {
    await answerLocal(recognizer, data, res)
    return
  }
  await answerLlm(ctx, settings, data, mediaType, name, req, res)
}

/**
 * Answer one screen-capture request with a PNG of the desktop.
 *
 * The page never asks the browser for display capture: Electron rejects that
 * without a main-process handler, and a picker is not the QQ/WeChat flow. The
 * Host grabs the pixels here and the Client only owns the drag-to-select UI.
 * @param ctx - Host context.
 * @param req - Node request.
 * @param res - Node response.
 */
async function handleCapture(ctx, req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST')
    sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' })
    return
  }
  if (req.headers[REQUEST_MARKER] !== '1') {
    sendJson(res, 403, { ok: false, error: 'FORBIDDEN' })
    return
  }
  if (!sameServedOrigin(readOrigin(ctx), req.headers.origin)) {
    sendJson(res, 403, { ok: false, error: 'FORBIDDEN_ORIGIN' })
    return
  }
  const shot = await captureScreen(ctx)
  if (!shot.ok) {
    sendJson(res, 200, { ok: false, error: shot.error, detail: shot.detail || '' })
    return
  }
  sendJson(res, 200, {
    ok: true,
    data: shot.base64,
    mediaType: 'image/png',
    width: shot.width || 0,
    height: shot.height || 0,
    source: shot.source,
  })
}

/** Resolved Electron module, `null` when the Host is not an Electron main process. */
let electronBinding

/**
 * Capture the desktop on the Host.
 * @param ctx - Host context.
 */
async function captureScreen(ctx) {
  const electron = await loadElectron()
  if (electron) {
    const shot = await captureWithElectron(electron)
    if (shot.ok) return shot
    // A denied permission is actionable: say so instead of masking it with the
    // fallback, which would fail for the very same reason.
    if (shot.error === 'CAPTURE_PERMISSION') return shot
  }
  return captureFallback(ctx)
}

/**
 * @returns Electron's module in a main process, otherwise null.
 */
async function loadElectron() {
  if (electronBinding !== undefined) return electronBinding
  try {
    const imported = await import('electron')
    const candidate = imported && imported.desktopCapturer ? imported : imported && imported.default
    electronBinding = candidate && candidate.desktopCapturer ? candidate : null
  } catch {
    electronBinding = null
  }
  return electronBinding
}

/**
 * Screen-capture permission state on macOS.
 * @param electron - Electron module.
 * @returns `granted` / `denied` / `restricted` / `not-determined`, or '' when
 * the platform does not gate screen capture.
 */
function screenAccessStatus(electron) {
  if (process.platform !== 'darwin') return ''
  try {
    const preferences = electron && electron.systemPreferences
    if (!preferences || typeof preferences.getMediaAccessStatus !== 'function') return 'not-determined'
    const status = preferences.getMediaAccessStatus('screen')
    return typeof status === 'string' ? status : 'not-determined'
  } catch {
    return 'not-determined'
  }
}

/**
 * Hide the app's windows, capture the display under the cursor, restore them.
 * @param electron - Electron module.
 */
async function captureWithElectron(electron) {
  const { desktopCapturer, screen, BrowserWindow } = electron
  // macOS gates desktop capture behind a per-app permission; asking twice is
  // pointless, and a denied app gets an empty thumbnail instead of an error.
  const access = screenAccessStatus(electron)
  if (access === 'denied' || access === 'restricted') {
    return { ok: false, error: 'CAPTURE_PERMISSION', detail: SCREEN_PERMISSION_HINT }
  }
  const hidden = []
  try {
    if (BrowserWindow && typeof BrowserWindow.getAllWindows === 'function') {
      for (const win of BrowserWindow.getAllWindows()) {
        try {
          if (win.isVisible()) {
            win.hide()
            hidden.push(win)
          }
        } catch {
          // A window that refuses to hide is simply left in the shot.
        }
      }
    }
    if (hidden.length > 0) await delay(240)
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
    if (!sources || sources.length === 0) {
      return { ok: false, error: 'CAPTURE_FAILED', detail: 'no screen source' }
    }
    let source = sources[0]
    try {
      if (screen && typeof screen.getCursorScreenPoint === 'function') {
        const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
        const match = sources.filter((entry) => String(entry.display_id) === String(display.id))[0]
        if (match) source = match
      }
    } catch {
      // Fall back to the first source.
    }
    if (!source.thumbnail || source.thumbnail.isEmpty()) {
      // The page was never asked for permission, or the grant needs a restart.
      if (process.platform === 'darwin') {
        return { ok: false, error: 'CAPTURE_PERMISSION', detail: SCREEN_PERMISSION_HINT }
      }
      return { ok: false, error: 'CAPTURE_FAILED', detail: 'empty thumbnail' }
    }
    const size = source.thumbnail.getSize()
    const buffer = source.thumbnail.toPNG()
    if (!buffer || buffer.length === 0) {
      return { ok: false, error: 'CAPTURE_FAILED', detail: 'empty png' }
    }
    return {
      ok: true,
      base64: buffer.toString('base64'),
      width: size.width,
      height: size.height,
      source: 'electron',
    }
  } catch (error) {
    return { ok: false, error: 'CAPTURE_FAILED', detail: describe(error) }
  } finally {
    for (const win of hidden) {
      try {
        win.show()
        win.focus()
      } catch {
        // Restoring focus is best effort.
      }
    }
  }
}

/**
 * Fallback capture when the Host is not an Electron main process, so no
 * `desktopCapturer` exists: `screencapture` on macOS, GDI+ on Windows.
 * @param ctx - Host context.
 */
async function captureFallback(ctx) {
  if (process.platform === 'win32') return captureWithPowerShell(ctx)
  if (process.platform === 'darwin') return captureWithScreencapture(ctx)
  return {
    ok: false,
    error: 'CAPTURE_UNAVAILABLE',
    detail: 'no screen-capture backend for ' + process.platform,
  }
}

/**
 * Fallback capture for a non-Electron Host on macOS: one `screencapture -x`
 * call writes the desktop to a temp file, and the Client still owns the
 * drag-to-select step.
 *
 * The binary inherits the Screen Recording grant of the process that spawns it,
 * so a missing file means either that permission or a headless session; there is
 * no exit code that tells them apart, and the permission is the common case.
 * @param ctx - Host context.
 */
async function captureWithScreencapture(ctx) {
  const subprocess = optionalService(ctx, 'subprocess')
  if (!subprocess) {
    return { ok: false, error: 'CAPTURE_UNAVAILABLE', detail: 'ctx.subprocess is not mounted' }
  }
  const target = join(tmpdir(), 'dsh-formula-ocr-' + process.pid + '-' + Date.now() + '.png')
  let handle
  try {
    handle = subprocess.spawn({
      argv: ['/usr/sbin/screencapture', '-x', '-t', 'png', target],
      cwd: tmpdir(),
      graceMs: 3000,
      stdio: { stdin: 'ignore', stdout: { maxBytes: 8192 }, stderr: { maxBytes: 8192 } },
    })
  } catch (error) {
    return { ok: false, error: 'CAPTURE_FAILED', detail: describe(error) }
  }
  const outcome = await (handle.done || Promise.resolve({ exitCode: 0 })).catch(() => ({ exitCode: null }))
  const exitCode = outcome && typeof outcome.exitCode === 'number' ? outcome.exitCode : null
  try {
    const bytes = await readFile(target)
    if (bytes.length === 0) throw new Error('screencapture wrote an empty file')
    return { ok: true, base64: bytes.toString('base64'), width: 0, height: 0, source: 'screencapture' }
  } catch (error) {
    if (exitCode !== null && exitCode !== 0) {
      return { ok: false, error: 'CAPTURE_PERMISSION', detail: SCREEN_PERMISSION_HINT }
    }
    return { ok: false, error: 'CAPTURE_FAILED', detail: describe(error) }
  } finally {
    await unlink(target).catch(() => undefined)
  }
}

/**
 * Fallback capture for a non-Electron Host: GDI+ through one PowerShell call.
 *
 * It minimizes the window in front (the app the user just clicked in), waits
 * for the desktop to repaint, captures the whole virtual screen at physical
 * resolution, then restores the window — the same order QQ and WeChat use, so
 * the app itself never ends up in the shot.
 * @param ctx - Host context.
 */
async function captureWithPowerShell(ctx) {
  const subprocess = optionalService(ctx, 'subprocess')
  if (!subprocess) {
    return { ok: false, error: 'CAPTURE_UNAVAILABLE', detail: 'ctx.subprocess is not mounted' }
  }
  const stamp = 'dsh-formula-ocr-' + process.pid + '-' + Date.now()
  const target = join(tmpdir(), stamp + '.png')
  const scriptPath = join(tmpdir(), stamp + '.ps1')
  try {
    await writeFile(scriptPath, captureScript(), 'utf8')
  } catch (error) {
    return { ok: false, error: 'CAPTURE_FAILED', detail: describe(error) }
  }
  let handle
  try {
    handle = subprocess.spawn({
      argv: [
        join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath, target,
      ],
      cwd: tmpdir(),
      graceMs: 3000,
      stdio: { stdin: 'ignore', stdout: { maxBytes: 8192 }, stderr: { maxBytes: 8192 } },
    })
  } catch (error) {
    await unlink(scriptPath).catch(() => undefined)
    return { ok: false, error: 'CAPTURE_FAILED', detail: describe(error) }
  }
  const outcome = await (handle.done || Promise.resolve({ exitCode: 0 })).catch(() => ({ exitCode: null }))
  await unlink(scriptPath).catch(() => undefined)
  if (!outcome || outcome.exitCode !== 0) {
    return { ok: false, error: 'CAPTURE_FAILED', detail: 'powershell exit ' + String(outcome && outcome.exitCode) }
  }
  try {
    const bytes = await readFile(target)
    return { ok: true, base64: bytes.toString('base64'), width: 0, height: 0, source: 'powershell' }
  } catch (error) {
    return { ok: false, error: 'CAPTURE_FAILED', detail: describe(error) }
  } finally {
    await unlink(target).catch(() => undefined)
  }
}

/**
 * One-shot Windows capture script: DPI-aware GDI+ grab with window minimize.
 */
function captureScript() {
  return [
    'param([string]$Target)',
    'Add-Type -AssemblyName System.Windows.Forms,System.Drawing',
    '$src=@"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class FocrWin32 {',
    '  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();',
    '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
    '  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);',
    '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);',
    '  [DllImport("user32.dll")] public static extern bool GetWindowPlacement(IntPtr h, ref FocrPlacement p);',
    '  [DllImport("user32.dll")] public static extern bool SetWindowPlacement(IntPtr h, ref FocrPlacement p);',
    '  [StructLayout(LayoutKind.Sequential)] public struct FocrPoint { public int X; public int Y; }',
    '  [StructLayout(LayoutKind.Sequential)] public struct FocrRect { public int Left; public int Top; public int Right; public int Bottom; }',
    '  [StructLayout(LayoutKind.Sequential)] public struct FocrPlacement { public int length; public int flags; public int showCmd; public FocrPoint min; public FocrPoint max; public FocrRect normal; }',
    '}',
    '"@',
    'Add-Type -TypeDefinition $src',
    '[void][FocrWin32]::SetProcessDPIAware()',
    '$h=[FocrWin32]::GetForegroundWindow()',
    '$p=[FocrWin32+FocrPlacement]::new()',
    '$p.length=[System.Runtime.InteropServices.Marshal]::SizeOf($p)',
    '$minimized=$false',
    'try {',
    '  if ($h -ne [IntPtr]::Zero -and [FocrWin32]::GetWindowPlacement($h,[ref]$p)) {',
    '    [void][FocrWin32]::ShowWindow($h,6)',
    '    $minimized=$true',
    '    Start-Sleep -Milliseconds 320',
    '  }',
    '  $b=[System.Windows.Forms.SystemInformation]::VirtualScreen',
    '  $img=[System.Drawing.Bitmap]::new($b.Width,$b.Height)',
    '  $g=[System.Drawing.Graphics]::FromImage($img)',
    '  $g.CopyFromScreen($b.Left,$b.Top,0,0,$img.Size)',
    '  $img.Save($Target,[System.Drawing.Imaging.ImageFormat]::Png)',
    '  $g.Dispose()',
    '  $img.Dispose()',
    '} finally {',
    '  if ($minimized) {',
    '    [void][FocrWin32]::SetWindowPlacement($h,[ref]$p)',
    '    [void][FocrWin32]::SetForegroundWindow($h)',
    '    Start-Sleep -Milliseconds 150',
    '  }',
    '}',
  ].join('\n')
}

/**
 * @param ms - Milliseconds to wait.
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Answer through the local ONNX worker.
 * @param recognizer - Owned local recognizer.
 * @param data - Image bytes.
 * @param res - Node response.
 */
async function answerLocal(recognizer, data, res) {
  try {
    const markdown = await recognizer.recognize(data)
    if (!markdown) {
      sendJson(res, 200, { ok: false, error: 'EMPTY_RESULT', detail: '' })
      return
    }
    sendJson(res, 200, { ok: true, markdown, recognizer: 'local' })
  } catch (error) {
    sendJson(res, 200, {
      ok: false,
      error: errorCode(error, 'LOCAL_FAILED'),
      detail: describe(error),
    })
  }
}

/**
 * Answer through the profile's vision model route.
 * @param ctx - Host context.
 * @param settings - Normalized row config.
 * @param data - Image bytes.
 * @param mediaType - Verified media type.
 * @param name - Optional display name.
 * @param req - Node request, for client-abort propagation.
 * @param res - Node response.
 */
async function answerLlm(ctx, settings, data, mediaType, name, req, res) {
  const route = resolveRoute(ctx, settings)
  const capability = await checkCapability(ctx, route)
  if (capability.error) {
    sendJson(res, 200, { ok: false, error: capability.error, detail: capability.detail })
    return
  }

  let attachment
  try {
    attachment = await ctx.attachments.saveImage({ data, mediaType, name })
  } catch (error) {
    sendJson(res, 200, { ok: false, error: 'IMAGE_REJECTED', detail: describe(error) })
    return
  }

  const result = await transcribe(ctx, settings, route, attachment, req)
  if (!result.ok) {
    sendJson(res, 200, { ok: false, error: result.error, detail: result.detail })
    return
  }
  sendJson(res, 200, {
    ok: true,
    markdown: result.markdown,
    recognizer: 'llm',
    provider: route.provider,
    model: route.model,
  })
}

/**
 * Stream one transcription request and collect its visible text.
 * @param ctx - Host context.
 * @param settings - Normalized row config.
 * @param route - Resolved provider/model route.
 * @param attachment - Stored image reference.
 * @param req - Node request, for client-abort propagation.
 */
async function transcribe(ctx, settings, route, attachment, req) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('REQUEST_TIMEOUT')), LLM_TIMEOUT_MS)
  let clientGone = false
  const onAborted = () => {
    clientGone = true
    controller.abort(new Error('CLIENT_ABORTED'))
  }
  if (typeof req.once === 'function') req.once('aborted', onAborted)

  let deltas = ''
  let blocks = ''
  let failure
  try {
    const options = {
      provider: route.provider,
      model: route.model,
      maxTokens: settings.maxTokens,
      signal: controller.signal,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', attachment },
          { type: 'text', text: settings.prompt },
        ],
      }],
    }
    for await (const chunk of ctx.llm.stream(options)) {
      if (chunk.type === 'text-delta') {
        deltas += chunk.text
      } else if (chunk.type === 'block-end' && chunk.block && chunk.block.type === 'text') {
        blocks += chunk.block.text
      } else if (chunk.type === 'finish') {
        const reason = chunk.reason
        if (reason && (reason.kind === 'error' || reason.kind === 'aborted')) {
          failure = reason.failure || { code: 'PROVIDER_FAILED', message: '' }
        }
      }
    }
  } catch (error) {
    failure = { code: 'STREAM_FAILED', message: describe(error) }
  } finally {
    clearTimeout(timer)
    if (typeof req.removeListener === 'function') req.removeListener('aborted', onAborted)
  }

  if (failure) {
    return {
      ok: false,
      error: failure.code || 'PROVIDER_FAILED',
      detail: clientGone ? 'CLIENT_ABORTED' : (failure.message || ''),
    }
  }
  const markdown = cleanMarkdown(deltas || blocks)
  if (!markdown) return { ok: false, error: 'EMPTY_RESULT', detail: '' }
  return { ok: true, markdown }
}

/**
 * One owned Python worker that keeps the ONNX model warm between screenshots.
 * @param ctx - Host context.
 * @param settings - Normalized row config.
 */
function createLocalRecognizer(ctx, settings) {
  const state = {
    handle: null,
    buffer: '',
    pending: null,
    starting: null,
    ready: null,
    queue: Promise.resolve(),
    stopped: false,
  }

  /**
   * Ask the worker to transcribe one image; calls are serialized.
   * @param data - Image bytes.
   */
  function recognize(data) {
    const task = state.queue.then(async () => {
      await ensureStarted()
      return request(data)
    })
    state.queue = task.then(() => undefined, () => undefined)
    return task
  }

  /** Start the worker once, sharing one attempt between concurrent callers. */
  function ensureStarted() {
    if (state.stopped) return Promise.reject(localFailure('LOCAL_UNAVAILABLE', 'the plugin is unloading'))
    if (state.handle) return Promise.resolve()
    if (state.starting) return state.starting
    state.starting = start().finally(() => {
      state.starting = null
    })
    return state.starting
  }

  /** Spawn the worker and wait for its readiness frame. */
  async function start() {
    const subprocess = optionalService(ctx, 'subprocess')
    if (!subprocess) throw localFailure('LOCAL_UNAVAILABLE', 'ctx.subprocess is not mounted in this profile')
    const python = await resolvePython(subprocess, settings.python)
    let handle
    try {
      handle = subprocess.spawn({
        argv: [python, HELPER_PATH],
        cwd: PACKAGE_DIR,
        graceMs: 3000,
        stdio: {
          stdin: 'pipe',
          stdout: 'pipe',
          stderr: { maxBytes: 256 * 1024 },
        },
        env: buildEnv(settings),
      })
    } catch (error) {
      throw localFailure('LOCAL_START_FAILED', describe(error))
    }
    state.handle = handle
    state.buffer = ''
    state.ready = createReadyWaiter()
    attach(handle)
    try {
      await withTimeout(state.ready.promise, LOCAL_START_TIMEOUT_MS, 'LOCAL_START_FAILED')
    } catch (error) {
      shutdown()
      throw error
    } finally {
      state.ready = null
    }
  }

  /** Create the readiness waiter the first frame settles. */
  function createReadyWaiter() {
    let settle
    const promise = new Promise((resolve, reject) => {
      settle = { resolve, reject }
    })
    return { promise, settle }
  }

  /**
   * Wire one worker handle's streams and exit.
   * @param handle - Spawned subprocess handle.
   */
  function attach(handle) {
    if (handle.stdout) {
      if (typeof handle.stdout.setEncoding === 'function') handle.stdout.setEncoding('utf8')
      handle.stdout.on('data', (chunk) => onOutput(chunk))
      handle.stdout.on('error', () => undefined)
    }
    if (handle.stdin && typeof handle.stdin.on === 'function') {
      // A write to a died worker must not surface as an unhandled stream error.
      handle.stdin.on('error', () => undefined)
    }
    if (handle.done && typeof handle.done.then === 'function') {
      handle.done.then(
        (outcome) => onExit(handle, outcome),
        (error) => onExit(handle, { exitCode: null, signal: null, error: describe(error) }),
      )
    }
  }

  /**
   * @param handle - Handle that exited.
   * @param outcome - Exit facts.
   */
  function onExit(handle, outcome) {
    if (state.handle !== handle) return
    state.handle = null
    state.buffer = ''
    const code = outcome && outcome.exitCode !== null && outcome.exitCode !== undefined
      ? 'exit code ' + outcome.exitCode
      : 'no exit code'
    const failure = localFailure('LOCAL_CRASHED', 'the recognizer stopped (' + code + ')')
    // An exit during startup must settle the readiness wait, not only the request.
    if (state.ready) {
      state.ready.settle.reject(failure)
      state.ready = null
    }
    failPending(failure)
  }

  /**
   * Consume one stdout chunk into complete protocol lines.
   * @param chunk - Decoded text.
   */
  function onOutput(chunk) {
    state.buffer += typeof chunk === 'string' ? chunk : String(chunk)
    let index = state.buffer.indexOf('\n')
    while (index >= 0) {
      const line = state.buffer.slice(0, index).trim()
      state.buffer = state.buffer.slice(index + 1)
      if (line) onFrame(line)
      index = state.buffer.indexOf('\n')
    }
  }

  /**
   * @param line - One JSON frame from the worker.
   */
  function onFrame(line) {
    let frame
    try {
      frame = JSON.parse(line)
    } catch {
      return
    }
    if (!frame || typeof frame !== 'object') return
    if (Object.prototype.hasOwnProperty.call(frame, 'ready')) {
      if (!state.ready) return
      if (frame.ready === true) {
        state.ready.settle.resolve()
      } else {
        state.ready.settle.reject(localFailure(
          'LOCAL_MODEL_MISSING',
          String(frame.error || 'MODEL_LOAD_FAILED') + ': ' + String(frame.detail || ''),
        ))
      }
      return
    }
    settlePending(frame)
  }

  /**
   * Send one image and await its frame.
   * @param data - Image bytes.
   */
  function request(data) {
    const handle = state.handle
    if (!handle || !handle.stdin) return Promise.reject(localFailure('LOCAL_UNAVAILABLE', 'the recognizer is not running'))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!state.pending || state.pending.timer !== timer) return
        state.pending = null
        reject(localFailure('LOCAL_TIMEOUT', 'the recognizer did not answer within ' + LOCAL_TIMEOUT_MS + 'ms'))
        shutdown()
      }, LOCAL_TIMEOUT_MS)
      state.pending = { resolve, reject, timer }
      try {
        handle.stdin.write(JSON.stringify({ data: data.toString('base64') }) + '\n')
      } catch (error) {
        clearTimeout(timer)
        state.pending = null
        reject(localFailure('LOCAL_FAILED', describe(error)))
      }
    })
  }

  /**
   * Settle the in-flight request with one worker frame.
   * @param frame - Response frame.
   */
  function settlePending(frame) {
    const pending = state.pending
    if (!pending) return
    state.pending = null
    clearTimeout(pending.timer)
    if (frame.ok === true && typeof frame.latex === 'string') {
      pending.resolve(wrapLocalLatex(frame.latex))
      return
    }
    pending.reject(localFailure(
      String(frame.error || 'LOCAL_FAILED'),
      String(frame.detail || ''),
    ))
  }

  /**
   * @param error - Failure for the in-flight request.
   */
  function failPending(error) {
    const pending = state.pending
    if (!pending) return
    state.pending = null
    clearTimeout(pending.timer)
    pending.reject(error)
  }

  /** Stop the worker and refuse further work. */
  function shutdown() {
    state.stopped = true
    state.starting = null
    if (state.ready) {
      state.ready.settle.reject(localFailure('LOCAL_CRASHED', 'the recognizer was stopped'))
      state.ready = null
    }
    failPending(localFailure('LOCAL_CRASHED', 'the recognizer was stopped'))
    const handle = state.handle
    state.handle = null
    state.buffer = ''
    if (!handle) return
    try {
      handle.terminate()
    } catch {
      // The process already exited; nothing else to release.
    }
  }

  return { recognize, shutdown }
}

/**
 * Interpreter the macOS install guide provisions, or '' on other platforms.
 *
 * The guide creates this venv under the app's support directory because the
 * system python3 is too old for either backend.
 * @returns Absolute path to the venv's python.
 */
function macosVenvPython() {
  if (process.platform !== 'darwin') return ''
  try {
    return join(homedir(), 'Library', 'Application Support', 'dsh-formula-ocr', 'venv', 'bin', 'python')
  } catch {
    return ''
  }
}

/**
 * Resolve the interpreter: explicit config first, then the macOS install-guide
 * venv, then PATH names.
 * @param subprocess - Host subprocess service.
 * @param configured - Configured interpreter path or name.
 */
async function resolvePython(subprocess, configured) {
  const candidates = []
  if (configured) candidates.push(configured)
  // macOS command line tools ship python3 3.9, below both backends' floor. The
  // install script provisions a 3.10+ venv at this fixed path; trying it before
  // PATH keeps `local` working without editing the row config.
  const managed = macosVenvPython()
  if (managed) candidates.push(managed)
  candidates.push('python3', 'python')
  const failures = []
  for (const candidate of candidates) {
    try {
      return await subprocess.resolveExecutable(candidate)
    } catch (error) {
      failures.push(candidate + ': ' + describe(error))
    }
  }
  throw localFailure('LOCAL_UNAVAILABLE', 'no Python interpreter found (' + failures.join('; ') + ')')
}

/**
 * @param settings - Normalized row config.
 * @returns The worker environment.
 */
function buildEnv(settings) {
  const env = {}
  if (process && process.env) {
    for (const key of Object.keys(process.env)) {
      const value = process.env[key]
      if (typeof value === 'string') env[key] = value
    }
  }
  env.PYTHONUNBUFFERED = '1'
  env.PYTHONUTF8 = '1'
  env.PYTHONIOENCODING = 'utf-8'
  if (settings.backend) env.FORMULA_OCR_BACKEND = settings.backend
  if (settings.hfEndpoint) env.HF_ENDPOINT = settings.hfEndpoint
  return env
}

/**
 * Wrap one local LaTeX body in the delimiter its shape calls for.
 * @param latex - Bare LaTeX from the worker.
 */
function wrapLocalLatex(latex) {
  const text = String(latex || '').trim()
  if (!text) return ''
  const display = /\\(frac|dfrac|tfrac|sum|prod|int|oint|lim|begin|over|binom|left|right|sqrt)/.test(text)
    || text.length > 48
  return display ? '$$' + text + '$$' : '$' + text + '$'
}

/**
 * @param promise - Work to bound.
 * @param ms - Deadline in milliseconds.
 * @param code - Failure code on expiry.
 */
function withTimeout(promise, ms, code) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(localFailure(code, 'timed out after ' + ms + 'ms')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/**
 * @param code - Stable failure code.
 * @param detail - Human-readable cause.
 */
function localFailure(code, detail) {
  const error = new Error(code)
  error.code = code
  error.detail = detail
  return error
}

/**
 * Pick the provider/model route: explicit config first, then the profile's default selection.
 * @param ctx - Host context.
 * @param settings - Normalized row config.
 */
function resolveRoute(ctx, settings) {
  let provider = settings.provider
  let model = settings.model
  if (!provider || !model) {
    const selection = readDefaultSelection(ctx)
    if (!provider) provider = selection.provider || DEFAULT_PROVIDER
    if (!model) model = selection.model || DEFAULT_MODEL
  }
  return { provider, model }
}

/**
 * Read the profile's default model selection when that optional service is mounted.
 * @param ctx - Host context.
 */
function readDefaultSelection(ctx) {
  try {
    const service = optionalService(ctx, 'agentDefaultModel')
    if (service && typeof service.currentSelection === 'function') {
      const selection = service.currentSelection()
      if (selection && typeof selection === 'object') {
        return {
          provider: isNonEmptyString(selection.provider) ? selection.provider : '',
          model: isNonEmptyString(selection.model) ? selection.model : '',
        }
      }
    }
  } catch {
    // The optional default-model service is not required for a pinned route.
  }
  return { provider: '', model: '' }
}

/**
 * Refuse early when the resolved route declares that it accepts no images.
 * @param ctx - Host context.
 * @param route - Resolved provider/model route.
 */
async function checkCapability(ctx, route) {
  try {
    const info = await ctx.llm.resolveModelInfo(route.provider, route.model)
    const modalities = info && info.inputModalities
    if (Array.isArray(modalities) && modalities.indexOf('image') < 0) {
      return { error: 'MODEL_WITHOUT_IMAGE_INPUT', detail: route.provider + '/' + route.model }
    }
  } catch {
    // An unresolved model is not a definitive refusal; let the request decide.
  }
  return {}
}

/**
 * Look up one optional Cordis service without failing when it is absent.
 * @param ctx - Host context.
 * @param name - Service key.
 */
function optionalService(ctx, name) {
  try {
    if (typeof ctx.get === 'function') return ctx.get(name)
    return ctx[name]
  } catch {
    return undefined
  }
}

/**
 * Read the advertised origin of the served page.
 * @param ctx - Host context.
 */
function readOrigin(ctx) {
  try {
    return ctx.webServer.getOrigin()
  } catch {
    return ''
  }
}

/**
 * Decide whether a request's Origin naming reaches this listener. The required
 * marker header already forces a cross-origin preflight, so this only rejects a
 * different port; another loopback spelling of the same listener still passes.
 * @param serverOrigin - Origin the server advertises.
 * @param requestOrigin - Origin header of the request.
 */
function sameServedOrigin(serverOrigin, requestOrigin) {
  if (typeof requestOrigin !== 'string' || requestOrigin.length === 0) return true
  if (typeof serverOrigin !== 'string' || serverOrigin.length === 0) return true
  try {
    return new URL(serverOrigin).port === new URL(requestOrigin).port
  } catch {
    return true
  }
}

/**
 * Read and parse one bounded JSON request body.
 * @param req - Node request.
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let settled = false
    const fail = (code) => {
      if (settled) return
      settled = true
      const error = new Error(code)
      error.code = code
      reject(error)
      req.destroy()
    }
    req.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        fail('BODY_TOO_LARGE')
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('INVALID_JSON'))
      }
    })
    req.on('error', (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
  })
}

/**
 * Write one JSON response unless the socket already ended.
 * @param res - Node response.
 * @param status - HTTP status.
 * @param payload - JSON-serializable body.
 */
function sendJson(res, status, payload) {
  if (res.writableEnded) return
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-length', String(body.length))
  res.end(body)
}

/**
 * Normalize a declared media type against the accepted raster formats.
 * @param value - Declared media type.
 */
function normalizeMediaType(value) {
  if (typeof value !== 'string') return ''
  const normalized = value.trim().toLowerCase()
  return MEDIA_TYPES.indexOf(normalized) >= 0 ? normalized : ''
}

/**
 * Decode a canonical base64 payload, rejecting malformed input.
 * @param value - Base64 text, optionally a data URL.
 */
function decodeBase64(value) {
  if (typeof value !== 'string' || value.length === 0) return undefined
  const comma = value.indexOf(',')
  const encoded = comma >= 0 && value.slice(0, comma).indexOf('base64') >= 0
    ? value.slice(comma + 1)
    : value
  const compact = encoded.replace(/\s+/g, '')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return undefined
  try {
    return Buffer.from(compact, 'base64')
  } catch {
    return undefined
  }
}

/**
 * Strip an outer code fence the model may have added despite the instruction.
 * @param raw - Model output.
 */
function cleanMarkdown(raw) {
  let text = String(raw === undefined || raw === null ? '' : raw).trim()
  const fenced = /^```[A-Za-z0-9_-]*[ \t]*\r?\n([\s\S]*?)\r?\n?```$/.exec(text)
  if (fenced) text = fenced[1].trim()
  return text
}

/**
 * @param error - Caught value.
 * @returns Stable failure code when the error carries one.
 */
function errorCode(error, fallback) {
  if (error && typeof error.code === 'string' && error.code) return error.code
  return fallback
}

/**
 * Render a short diagnostic for an unknown failure.
 * @param error - Caught value.
 */
function describe(error) {
  if (error instanceof Error) {
    const detail = error.detail && typeof error.detail === 'string' ? error.detail : ''
    return detail || error.message
  }
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return ''
  }
}

/**
 * @param value - Candidate.
 * @returns Whether the value is a non-empty string.
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}
