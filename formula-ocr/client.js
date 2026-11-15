/**
 * Client half of the formula OCR plugin.
 *
 * Three compact buttons in the composer tool row: a screen capture with a drag
 * to select the formula, the clipboard image, and an image file. All of them
 * send the picture to the package's own Host route and insert the returned
 * Markdown math at the caret through the composer's `inputActions` prop.
 */

window.__ModuleLoader__.load({
  id: '@local/formula-ocr',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'formula-ocr'
    const SLOT = 'conversation.input.left'
    const ENDPOINT = '/_formula-ocr/recognize'
    const CAPTURE_ENDPOINT = '/_formula-ocr/capture'
    const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
    const REQUEST_TIMEOUT_MS = 360000
    const MIN_CAPTURE_PX = 12

    const STYLE = [
      '.dsh-focr-bar{display:inline-flex;align-items:center;gap:4px;min-width:0;}',
      '.dsh-focr-file{display:none;}',
      '.dsh-focr-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;',
      'padding:0;margin:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);',
      'cursor:pointer;transition:background-color .15s ease,color .15s ease;}',
      '.dsh-focr-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2));',
      'color:var(--dsw-alias-label-primary);}',
      '.dsh-focr-btn:disabled{cursor:default;opacity:.5;}',
      '.dsh-focr-btn[data-busy="true"]{opacity:1;}',
      '.dsh-focr-note{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
      'font-size:12px;line-height:1.25;color:var(--dsw-alias-state-error-primary);}',
      '.dsh-focr-spin{animation:dsh-focr-spin .9s linear infinite;}',
      '@keyframes dsh-focr-spin{to{transform:rotate(360deg);}}',
      '@media (prefers-reduced-motion: reduce){.dsh-focr-spin{animation-duration:3s;}}',
      '.dsh-focr-shot{margin:0;padding:0;border:0;max-width:none;max-height:none;background:transparent;}',
      '.dsh-focr-shot[open]{display:flex;align-items:center;justify-content:center;}',
      '.dsh-focr-shot::backdrop{background:rgba(0,0,0,.78);}',
      '.dsh-focr-shot-body{display:flex;flex-direction:column;align-items:center;gap:10px;max-width:96vw;max-height:94vh;}',
      '.dsh-focr-shot-hint{font:400 13px/1.4 system-ui,sans-serif;color:rgba(255,255,255,.82);}',
      '.dsh-focr-shot-frame{position:relative;display:inline-block;line-height:0;cursor:crosshair;',
      'max-width:96vw;max-height:88vh;}',
      '.dsh-focr-shot-img{display:block;max-width:96vw;max-height:88vh;border-radius:6px;',
      'user-select:none;-webkit-user-drag:none;}',
      '.dsh-focr-sel{position:absolute;pointer-events:none;border:1px solid #fff;',
      'background:rgba(255,255,255,.14);box-shadow:0 0 0 9999px rgba(0,0,0,.42);}',
    ].join('')

    const DICTS = {
      en: {
        'action.capture': 'Screenshot a formula region',
        'action.clipboard': 'Formula from clipboard image',
        'action.file': 'Formula from image file',
        'busy': 'Recognizing formula…',
        'shot.hint': 'Drag to select the formula — Esc to cancel',
        'error.network': 'Recognition service unreachable.',
        'error.http': 'Recognition failed ({status}).',
        'error.locked': 'Composer busy — not inserted.',
        'error.clipboardUnavailable': 'Clipboard images unavailable.',
        'error.clipboardDenied': 'Clipboard access denied.',
        'error.clipboardEmpty': 'No image in the clipboard.',
        'error.captureUnsupported': 'Screen capture unavailable here.',
        'error.captureFailed': 'Screen capture failed.',
        'error.modelNoImage': 'Model cannot read images.',
        'error.imageRejected': 'Image not accepted.',
        'error.emptyResult': 'No formula recognized.',
        'error.provider': 'Model failed to answer.',
        'error.localUnavailable': 'Local recognition unavailable.',
        'error.localStart': 'Local recognizer did not start.',
        'error.localModel': 'Local model is not ready.',
        'error.localTimeout': 'Local recognition timed out.',
        'error.localCrash': 'Local recognizer stopped.',
        'error.localFailed': 'Local recognition failed.',
        'error.unreliable': 'Result looked unreliable — discarded.',
        'error.read': 'Image could not be read.',
        'error.unknown': 'Recognition failed.',
      },
      zh: {
        'action.capture': '截图并识别公式',
        'action.clipboard': '从剪贴板截图识别公式',
        'action.file': '从图片文件识别公式',
        'busy': '正在识别公式…',
        'shot.hint': '拖动框选公式区域，按 Esc 取消',
        'error.network': '无法连接识别服务。',
        'error.http': '识别失败（{status}）。',
        'error.locked': '输入框正忙，未插入。',
        'error.clipboardUnavailable': '剪贴板图片不可用。',
        'error.clipboardDenied': '剪贴板访问被拒绝。',
        'error.clipboardEmpty': '剪贴板里没有图片。',
        'error.captureUnsupported': '当前环境不支持屏幕截图。',
        'error.captureFailed': '屏幕截图失败。',
        'error.modelNoImage': '模型不支持图片。',
        'error.imageRejected': '图片未被接受。',
        'error.emptyResult': '未识别出公式。',
        'error.provider': '模型未能返回结果。',
        'error.localUnavailable': '本地识别不可用。',
        'error.localStart': '本地识别进程未启动。',
        'error.localModel': '本地模型尚未就绪。',
        'error.localTimeout': '本地识别超时。',
        'error.localCrash': '本地识别进程已退出。',
        'error.localFailed': '本地识别失败。',
        'error.unreliable': '识别结果不可靠，已丢弃。',
        'error.read': '图片读取失败。',
        'error.unknown': '公式识别失败。',
      },
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        registerDictionaries(ctx)
        const Component = createComposerButtons(ctx)
        ctx.effect(
          () => ctx.slots.inject(SLOT, () => ctx.slots.register({ name: SLOT, id: 'formula-ocr', order: 10 }, Component)),
          'formula-ocr: composer buttons',
        )
      },
    }

    /**
     * Register this plugin's own locale dictionaries as owned effects.
     * @param ctx - Client context.
     */
    function registerDictionaries(ctx) {
      const locale = safeGet(ctx, 'locale')
      if (!locale || typeof locale.register !== 'function') return
      for (const id of Object.keys(DICTS)) {
        try {
          ctx.effect(() => locale.register(NS, id, DICTS[id]), 'formula-ocr: ' + id + ' dictionary')
        } catch (error) {
          // A missing dictionary degrades to the inline copy below, never a crash.
          console.error('formula-ocr: locale dictionary registration failed', error)
        }
      }
    }

    /**
     * Build the composer component bound to the Client context.
     * @param ctx - Client context.
     */
    function createComposerButtons(ctx) {
      return function ComposerFormulaButtons(props) {
        const inputActions = props && props.inputActions
        const fileRef = React.useRef(null)
        const dialogRef = React.useRef(null)
        const frameRef = React.useRef(null)
        const pendingRef = React.useRef(null)
        const [busy, setBusy] = React.useState(null)
        const [note, setNote] = React.useState(null)
        const [shot, setShot] = React.useState(null)
        const [drag, setDrag] = React.useState(null)
        const [, setLocaleTick] = React.useState(0)

        React.useEffect(() => {
          const locale = safeGet(ctx, 'locale')
          if (!locale || typeof locale.subscribe !== 'function') return undefined
          return locale.subscribe(() => setLocaleTick((value) => value + 1))
        }, [])

        React.useEffect(() => {
          if (!note) return undefined
          const timer = window.setTimeout(() => setNote(null), 9000)
          return () => window.clearTimeout(timer)
        }, [note])

        React.useEffect(() => {
          const dialog = dialogRef.current
          if (!dialog) return
          if (shot && !dialog.open) {
            try {
              dialog.showModal()
            } catch {
              dialog.setAttribute('open', '')
            }
          } else if (!shot && dialog.open) {
            try {
              dialog.close()
            } catch {
              dialog.removeAttribute('open')
            }
          }
        }, [shot])

        const t = makeTranslator(safeGet(ctx, 'locale'))

        const start = async (source, load) => {
          if (busy) return
          setBusy(source)
          setNote(null)
          try {
            const blob = await load()
            await insertRecognized(inputActions, blob)
          } catch (failure) {
            if (!failure || failure.code !== 'cancelled') setNote(messageFor(failure, t))
          } finally {
            setBusy(null)
          }
        }

        const fromScreen = () => start('capture', async () => {
          const frame = await captureFrame()
          return pickRegion(frame)
        })

        const fromClipboard = () => start('clipboard', readClipboardImage)

        const fromFile = () => {
          if (busy) return
          const input = fileRef.current
          if (!input) return
          input.value = ''
          input.click()
        }

        const onFileChange = (event) => {
          const target = event && event.target
          const file = target && target.files && target.files.length > 0 ? target.files[0] : null
          if (!file) return
          start('file', () => Promise.resolve(file))
        }

        const keepFocus = (event) => {
          // The composer editor keeps focus: the same rule the host's own tool-row buttons follow.
          event.preventDefault()
        }

        // ---- region selection -------------------------------------------

        const pickRegion = (frame) => new Promise((resolve, reject) => {
          pendingRef.current = { resolve, reject, frame }
          setDrag(null)
          setShot(frame)
        })

        const settleRegion = (box) => {
          const pending = pendingRef.current
          pendingRef.current = null
          setShot(null)
          setDrag(null)
          if (!pending) return
          if (!box) {
            pending.reject(fail('cancelled'))
            return
          }
          try {
            const canvas = cropFrame(pending.frame, box)
            canvas.toBlob((blob) => {
              if (blob) pending.resolve(blob)
              else pending.reject(fail('read'))
            }, 'image/png')
          } catch (error) {
            pending.reject(fail('read'))
          }
        }

        const cancelRegion = () => {
          if (!pendingRef.current) return
          settleRegion(null)
        }

        const onShotPointerDown = (event) => {
          const image = frameRef.current
          if (!image || !shot) return
          const rect = image.getBoundingClientRect()
          const x = clamp(event.clientX - rect.left, 0, rect.width)
          const y = clamp(event.clientY - rect.top, 0, rect.height)
          setDrag({ x0: x, y0: y, x1: x, y1: y, width: rect.width, height: rect.height })
          if (typeof event.currentTarget.setPointerCapture === 'function') {
            try {
              event.currentTarget.setPointerCapture(event.pointerId)
            } catch {
              // Pointer capture is an optimization only.
            }
          }
        }

        const onShotPointerMove = (event) => {
          if (!drag) return
          const rect = frameRef.current ? frameRef.current.getBoundingClientRect() : null
          if (!rect) return
          setDrag({
            ...drag,
            x1: clamp(event.clientX - rect.left, 0, rect.width),
            y1: clamp(event.clientY - rect.top, 0, rect.height),
          })
        }

        const onShotPointerUp = () => {
          if (!drag || !shot) return
          const x = Math.min(drag.x0, drag.x1)
          const y = Math.min(drag.y0, drag.y1)
          const displayWidth = Math.max(Math.abs(drag.x1 - drag.x0), 0)
          const displayHeight = Math.max(Math.abs(drag.y1 - drag.y0), 0)
          const scaleX = shot.width / Math.max(drag.width, 1)
          const scaleY = shot.height / Math.max(drag.height, 1)
          if (displayWidth * scaleX < MIN_CAPTURE_PX || displayHeight * scaleY < MIN_CAPTURE_PX) {
            setDrag(null)
            return
          }
          settleRegion({
            x: x * scaleX,
            y: y * scaleY,
            width: displayWidth * scaleX,
            height: displayHeight * scaleY,
          })
        }

        const selection = drag
          ? {
            left: Math.min(drag.x0, drag.x1) + 'px',
            top: Math.min(drag.y0, drag.y1) + 'px',
            width: Math.abs(drag.x1 - drag.x0) + 'px',
            height: Math.abs(drag.y1 - drag.y0) + 'px',
          }
          : null

        const clipboardLabel = busy ? t('busy') : t('action.clipboard')
        const fileLabel = busy ? t('busy') : t('action.file')
        const captureLabel = busy ? t('busy') : t('action.capture')

        return h('span', { className: 'dsh-focr-bar', 'aria-busy': busy ? 'true' : 'false' }, [
          h('style', { key: 'style' }, STYLE),
          h('input', {
            key: 'file',
            ref: fileRef,
            type: 'file',
            accept: ACCEPTED.join(','),
            className: 'dsh-focr-file',
            tabIndex: -1,
            'aria-hidden': true,
            onChange: onFileChange,
          }),
          h('button', {
            key: 'capture',
            type: 'button',
            className: 'dsh-focr-btn',
            title: captureLabel,
            'aria-label': captureLabel,
            'data-busy': busy === 'capture' ? 'true' : 'false',
            disabled: Boolean(busy),
            onMouseDown: keepFocus,
            onClick: fromScreen,
          }, busy === 'capture' ? spinner() : captureGlyph()),
          h('button', {
            key: 'clipboard',
            type: 'button',
            className: 'dsh-focr-btn',
            title: clipboardLabel,
            'aria-label': clipboardLabel,
            'data-busy': busy === 'clipboard' ? 'true' : 'false',
            disabled: Boolean(busy),
            onMouseDown: keepFocus,
            onClick: fromClipboard,
          }, busy === 'clipboard' ? spinner() : clipboardGlyph()),
          h('button', {
            key: 'file-button',
            type: 'button',
            className: 'dsh-focr-btn',
            title: fileLabel,
            'aria-label': fileLabel,
            'data-busy': busy === 'file' ? 'true' : 'false',
            disabled: Boolean(busy),
            onMouseDown: keepFocus,
            onClick: fromFile,
          }, busy === 'file' ? spinner() : pictureFormulaGlyph()),
          note
            ? h('span', {
              key: 'note',
              className: 'dsh-focr-note',
              role: 'alert',
              title: note.detail ? note.text + ' ' + note.detail : note.text,
            }, note.text)
            : null,
          h('dialog', {
            key: 'shot',
            ref: dialogRef,
            className: 'dsh-focr-shot',
            onClose: cancelRegion,
          }, shot
            ? h('div', { className: 'dsh-focr-shot-body' }, [
              h('div', { key: 'hint', className: 'dsh-focr-shot-hint' }, t('shot.hint')),
              h('div', {
                key: 'frame',
                className: 'dsh-focr-shot-frame',
                onPointerDown: onShotPointerDown,
                onPointerMove: onShotPointerMove,
                onPointerUp: onShotPointerUp,
              }, [
                h('img', {
                  key: 'img',
                  ref: frameRef,
                  src: shot.url,
                  alt: '',
                  className: 'dsh-focr-shot-img',
                  draggable: false,
                }),
                selection ? h('div', { key: 'sel', className: 'dsh-focr-sel', style: selection }) : null,
              ]),
            ])
            : null),
        ])
      }
    }

    /**
     * Ask the Host for a fresh desktop screenshot, decoded and ready to crop.
     * No browser display-capture prompt is involved: the Host owns the pixels.
     * @returns { canvas: HTMLCanvasElement, url: string, width: number, height: number }
     */
    async function captureFrame() {
      let response
      try {
        response = await fetch(CAPTURE_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-dsh-formula-ocr': '1' },
          body: '{}',
          signal: timeoutSignal(),
        })
      } catch {
        throw fail('network')
      }
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (!response.ok) throw fail('http', { status: String(response.status) })
      if (!payload || payload.ok !== true || typeof payload.data !== 'string') {
        const code = payload && typeof payload.error === 'string' ? payload.error : ''
        throw fail(
          code === 'CAPTURE_UNAVAILABLE' ? 'captureUnsupported' : 'captureFailed',
          { detail: payload && typeof payload.detail === 'string' ? payload.detail : '' },
        )
      }
      const url = 'data:' + (payload.mediaType || 'image/png') + ';base64,' + payload.data
      const image = await loadImage(url)
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth || image.width
      canvas.height = image.naturalHeight || image.height
      canvas.getContext('2d').drawImage(image, 0, 0)
      return { canvas, url, width: canvas.width, height: canvas.height }
    }

    /**
     * @param url - Image URL.
     * @returns The decoded image element.
     */
    function loadImage(url) {
      return new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(fail('captureFailed'))
        image.src = url
      })
    }

    /**
     * Cut one natural-pixel box out of the captured frame.
     * @param frame - Captured frame.
     * @param box - Natural-pixel selection.
     */
    function cropFrame(frame, box) {
      const width = Math.max(1, Math.round(box.width))
      const height = Math.max(1, Math.round(box.height))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(
        frame.canvas,
        Math.round(box.x), Math.round(box.y), width, height,
        0, 0, width, height,
      )
      return canvas
    }

    /**
     * Send one image to the recognition route and insert the result at the caret.
     * @param inputActions - Composer action face from the slot's standard props.
     * @param blob - Image bytes.
     */
    async function insertRecognized(inputActions, blob) {
      if (!inputActions
        || typeof inputActions.insertText !== 'function'
        || typeof inputActions.captureInsertion !== 'function') {
        throw fail('locked')
      }
      const anchor = captureInsertion(inputActions)
      const base64 = await blobToBase64(blob)
      const mediaType = sniffMediaType(base64, pickMediaType(blob))
      const markdown = await requestRecognition(base64, mediaType, blobName(blob))
      // Anchor first so a caret move during recognition still lands the text where
      // the user asked; a draft edit invalidates it, then insert at the live caret.
      let inserted = insertText(inputActions, markdown, anchor)
      if (!inserted) inserted = insertText(inputActions, markdown, captureInsertion(inputActions))
      if (!inserted) throw fail('locked')
    }

    /**
     * @param inputActions - Composer action face.
     * @returns A revision-guarded insertion point, or undefined when unavailable.
     */
    function captureInsertion(inputActions) {
      try {
        return inputActions.captureInsertion()
      } catch {
        return undefined
      }
    }

    /**
     * @param inputActions - Composer action face.
     * @param text - Text to insert.
     * @param span - Captured insertion point.
     * @returns Whether the editor accepted the insertion.
     */
    function insertText(inputActions, text, span) {
      if (!span) return false
      try {
        return inputActions.insertText(text, span) === true
      } catch {
        return false
      }
    }

    /**
     * POST one image and read back Markdown math.
     * @param base64 - Encoded image bytes.
     * @param mediaType - Declared media type.
     * @param name - Optional display name.
     */
    async function requestRecognition(base64, mediaType, name) {
      let response
      try {
        response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-dsh-formula-ocr': '1' },
          body: JSON.stringify({ data: base64, mediaType, name }),
          signal: timeoutSignal(),
        })
      } catch {
        throw fail('network')
      }
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (!response.ok) throw fail('http', { status: String(response.status) })
      if (payload && payload.ok === true && typeof payload.markdown === 'string') {
        return payload.markdown.trim()
      }
      const code = payload && typeof payload.error === 'string' ? payload.error : ''
      throw fail(mapServerError(code), { detail: payload && typeof payload.detail === 'string' ? payload.detail : '' })
    }

    /**
     * @returns A cancellation signal with a bounded wait, when the browser has one.
     */
    function timeoutSignal() {
      try {
        return AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      } catch {
        return undefined
      }
    }

    /**
     * Read the first image of the clipboard.
     */
    async function readClipboardImage() {
      const clipboard = navigator.clipboard
      if (!clipboard || typeof clipboard.read !== 'function') throw fail('clipboardUnavailable')
      let items
      try {
        items = await clipboard.read()
      } catch {
        throw fail('clipboardDenied')
      }
      for (const item of items || []) {
        const types = item && item.types ? item.types : []
        const match = types.filter((type) => typeof type === 'string' && type.indexOf('image/') === 0)[0]
        if (!match) continue
        const blob = await item.getType(match)
        if (blob) return blob
      }
      throw fail('clipboardEmpty')
    }

    /**
     * @param blob - Image bytes.
     * @returns Canonical base64 without the data-URL prefix.
     */
    function blobToBase64(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(fail('read'))
        reader.onload = () => {
          const result = String(reader.result || '')
          const comma = result.indexOf(',')
          resolve(comma >= 0 ? result.slice(comma + 1) : result)
        }
        reader.readAsDataURL(blob)
      })
    }

    /**
     * Normalize the media type the browser reported.
     * @param blob - Image bytes.
     */
    function pickMediaType(blob) {
      const declared = blob && typeof blob.type === 'string' ? blob.type.toLowerCase() : ''
      return ACCEPTED.indexOf(declared) >= 0 ? declared : 'image/png'
    }

    /**
     * Correct an unknown declared type from the payload's magic bytes.
     * @param base64 - Encoded image bytes.
     * @param fallback - Type to keep when the prefix is not recognized.
     */
    function sniffMediaType(base64, fallback) {
      if (base64.indexOf('iVBOR') === 0) return 'image/png'
      if (base64.indexOf('/9j/') === 0) return 'image/jpeg'
      if (base64.indexOf('R0lGOD') === 0) return 'image/gif'
      if (base64.indexOf('UklGR') === 0) return 'image/webp'
      return fallback
    }

    /**
     * @param blob - Image bytes.
     * @returns The file's display name when it has one.
     */
    function blobName(blob) {
      return blob && typeof blob.name === 'string' && blob.name ? blob.name : undefined
    }

    /**
     * Group Host error codes into the user-facing messages above.
     * @param code - Host error code.
     */
    function mapServerError(code) {
      if (code === 'MODEL_WITHOUT_IMAGE_INPUT') return 'modelNoImage'
      if (code === 'UNSUPPORTED_MEDIA_TYPE' || code === 'EMPTY_IMAGE' || code === 'IMAGE_REJECTED') return 'imageRejected'
      if (code === 'EMPTY_RESULT') return 'emptyResult'
      if (code === 'LOCAL_UNAVAILABLE') return 'localUnavailable'
      if (code === 'NO_BACKEND') return 'localUnavailable'
      if (code === 'LOCAL_START_FAILED') return 'localStart'
      if (code === 'LOCAL_MODEL_MISSING') return 'localModel'
      if (code === 'LOCAL_TIMEOUT') return 'localTimeout'
      if (code === 'LOCAL_CRASHED') return 'localCrash'
      if (code === 'LOCAL_FAILED') return 'localFailed'
      if (code === 'DEGENERATE') return 'unreliable'
      return 'provider'
    }

    /**
     * Build a bound translator over the registered dictionaries.
     * @param locale - Client locale service, when mounted.
     */
    function makeTranslator(locale) {
      let bound
      if (locale && typeof locale.bind === 'function') {
        try {
          bound = locale.bind(NS)
        } catch {
          bound = undefined
        }
      }
      let active = 'en'
      try {
        const snapshot = locale && typeof locale.getLocale === 'function' ? locale.getLocale() : undefined
        if (snapshot && typeof snapshot.active === 'string') active = snapshot.active
      } catch {
        active = 'en'
      }
      const primary = DICTS[active] || DICTS[active.split('-')[0]] || DICTS.en
      return (key, params) => {
        let text
        if (bound) {
          try {
            const value = bound(key)
            if (typeof value === 'string' && value && value !== key) text = value
          } catch {
            text = undefined
          }
        }
        if (!text) text = primary[key] || DICTS.en[key] || key
        return applyParams(text, params)
      }
    }

    /**
     * Substitute `{name}` placeholders.
     * @param text - Template string.
     * @param params - Named values.
     */
    function applyParams(text, params) {
      if (!params) return text
      return String(text).replace(/\{(\w+)\}/g, (match, name) => (
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
      ))
    }

    /**
     * Read one failure as a localized note; the raw cause stays in the tooltip.
     * @param failure - Caught value.
     * @param t - Bound translator.
     */
    function messageFor(failure, t) {
      const code = failure && typeof failure.code === 'string' ? failure.code : ''
      if (!code) return { text: t('error.unknown'), detail: '' }
      const key = 'error.' + code
      const text = t(key, failure.detail)
      const detail = failure.detail && typeof failure.detail.detail === 'string' ? failure.detail.detail : ''
      return { text: text === key ? t('error.unknown') : text, detail }
    }

    /**
     * @param code - Plugin error code.
     * @param detail - Optional message parameters.
     */
    function fail(code, detail) {
      const error = new Error(code)
      error.code = code
      if (detail) error.detail = detail
      return error
    }

    /**
     * Look up one optional Cordis service without failing when it is absent.
     * @param ctx - Client context.
     * @param name - Service key.
     */
    function safeGet(ctx, name) {
      try {
        const viaGet = typeof ctx.get === 'function' ? ctx.get(name) : undefined
        if (viaGet !== undefined) return viaGet
      } catch {
        // Fall through to direct property access below.
      }
      try {
        return ctx[name]
      } catch {
        return undefined
      }
    }

    function clamp(value, low, high) {
      return Math.min(Math.max(value, low), high)
    }

    function spinner() {
      return h('svg', {
        className: 'dsh-focr-spin',
        width: 16,
        height: 16,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': true,
      }, h('circle', {
        cx: 8,
        cy: 8,
        r: 5.5,
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeDasharray: '7 12',
        strokeLinecap: 'round',
      }))
    }

    function captureGlyph() {
      return h('svg', {
        width: 16,
        height: 16,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      }, [
        h('path', { key: 'tl', d: 'M3 6.2 V3 H6.2' }),
        h('path', { key: 'tr', d: 'M9.8 3 H13 V6.2' }),
        h('path', { key: 'br', d: 'M13 9.8 V13 H9.8' }),
        h('path', { key: 'bl', d: 'M6.2 13 H3 V9.8' }),
      ])
    }

    function clipboardGlyph() {
      return h('svg', {
        width: 16,
        height: 16,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      }, [
        h('rect', { key: 'body', x: 3.4, y: 3, width: 9.2, height: 11, rx: 2 }),
        h('rect', { key: 'clip', x: 5.8, y: 1.6, width: 4.4, height: 2.6, rx: 1, fill: 'currentColor', stroke: 'none' }),
      ])
    }

    function pictureFormulaGlyph() {
      return h('svg', {
        width: 16,
        height: 16,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'butt',
        strokeLinejoin: 'miter',
        'aria-hidden': true,
      }, [
        h('rect', {
          key: 'frame',
          x: 1.8,
          y: 2.6,
          width: 12.4,
          height: 10.8,
          rx: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
        // A summation mark inside the frame: this button reads a formula out of a picture.
        h('path', { key: 'sigma', d: 'M10.6 5.1 L5.9 5.1 L8.2 8 L5.9 10.9 L10.6 10.9' }),
      ])
    }
  },
})
