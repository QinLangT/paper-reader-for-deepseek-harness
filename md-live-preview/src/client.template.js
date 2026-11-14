/**
 * Markdown live preview — Client half.
 *
 * Two contributions to the resident composer:
 *   1. `conversation.input.right` — a small toggle that shows/hides the preview.
 *   2. `conversation.input.dock`  — the card above the input card that renders the
 *      current draft as formatted Markdown, updating on every keystroke.
 *
 * The draft arrives through the slot's standard `useInput` selector hook, so the
 * preview is a pure projection of the composer state: nothing is stored, appended
 * to the session, or sent anywhere. The parsed tree is React elements only — no
 * HTML injection — and every node is keyed, so a keystroke re-renders instead of
 * remounting the tree. The one exception is math: KaTeX produces the markup for a
 * formula, which is trusted because KaTeX renders with `trust: false`.
 *
 * KaTeX is inlined below by `build.mjs` (MIT, https://katex.org); the shell already
 * ships the matching KaTeX stylesheet and fonts, so this bundle adds no stylesheet
 * and no network request.
 */
var __dshMdPreviewKatex = (function () {
  try {
    var module = { exports: {} };
    var exports = module.exports;
    /*__KATEX__*/
    return module.exports;
  } catch (error) {
    // Without KaTeX, math keeps rendering as its source instead of failing the slot.
    if (typeof console !== 'undefined') console.error('[md-live-preview] KaTeX initialization failed', error);
    return undefined;
  }
})();

window.__ModuleLoader__.load({
  id: '__DSH_PACKAGE_NAME__',
  factory(require) {
    'use strict'

    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'mdLivePreview'
    /** Browser-local preference key; the preview is a view preference, not session data. */
    const STORAGE_KEY = 'dsh.md-live-preview.enabled'
    /** Above this many characters the preview renders a truncated head and says so. */
    const PREVIEW_LIMIT = 20000

    /* ------------------------------------------------------------------ copy */

    const zh = {
      'toggle.label': 'Markdown 实时预览',
      'toggle.show': '显示 Markdown 实时预览',
      'toggle.hide': '隐藏 Markdown 实时预览',
      'preview.title': 'Markdown 预览',
      'preview.region': 'Markdown 预览',
      'preview.truncated': '草稿过长，预览只显示开头部分：按行截断在约 20000 字符以内。',
      'copy.action': '复制',
      'copy.done': '已复制',
      'copy.failed': '复制失败',
    }

    const en = {
      'toggle.label': 'Markdown live preview',
      'toggle.show': 'Show Markdown live preview',
      'toggle.hide': 'Hide Markdown live preview',
      'preview.title': 'Markdown preview',
      'preview.region': 'Markdown preview',
      'preview.truncated': 'The draft is long; the preview shows only its beginning, cut at a line within about 20,000 characters.',
      'copy.action': 'Copy',
      'copy.done': 'Copied',
      'copy.failed': 'Copy failed',
    }

    /* ------------------------------------------------------- view preference */

    const preference = (function createPreference() {
      let current = true
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw === '1' || raw === '0') current = raw === '1'
      } catch (error) {
        // Private mode or a blocked store: the in-memory default still works.
      }
      const listeners = new Set()
      return {
        get: function get() {
          return current
        },
        set: function set(next) {
          if (current === next) return
          current = next
          try {
            window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
          } catch (error) {
            // A refused write only costs persistence across reloads.
          }
          listeners.forEach(function notify(listener) {
            try {
              listener(next)
            } catch (error) {
              // One broken subscriber must not starve the others.
            }
          })
        },
        subscribe: function subscribe(listener) {
          listeners.add(listener)
          return function unsubscribe() {
            listeners.delete(listener)
          }
        },
      }
    })()

    /** Subscribe a component to the shared view preference. */
    function usePreference() {
      const [value, setValue] = React.useState(function read() {
        return preference.get()
      })
      React.useEffect(function follow() {
        return preference.subscribe(setValue)
      }, [])
      return [value, preference.set]
    }

    /* ------------------------------------------------------------------ style */

    const CSS = `
.mdl-card {
  box-sizing: border-box;
  flex: none;
  overflow: hidden;
  margin: 0 auto;
  width: calc(100% - var(--dsh-composer-side-clearance, 16px) * 2 - var(--dsh-composer-dock-inset, 8px) * 4);
  max-width: calc(var(--dsh-composer-card-max-width, 952px) - var(--dsh-composer-dock-inset, 8px) * 4);
  border: 0;
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-specific-menu);
  backdrop-filter: var(--dsw-menu-backdrop-filter, none);
  box-shadow: var(--dsw-elevation-panel);
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
}

.mdl-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px 0 14px;
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-xs-strong-13);
}

.mdl-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mdl-close {
  display: grid;
  flex: none;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 999px;
  corner-shape: round;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  cursor: pointer;
}
@media (hover: hover) {
  .mdl-close:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); }
}
.mdl-close:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}

.mdl-body {
  box-sizing: border-box;
  max-height: min(38vh, 360px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 6px 16px 12px;
  color: var(--dsw-alias-label-primary);
  font: var(--dsw-font-markdown-base);
  overflow-wrap: anywhere;
}

.mdl-body > *:first-child { margin-top: 0; }
.mdl-body > *:last-child { margin-bottom: 0; }

.mdl-p { margin: 0 0 10px; }
.mdl-h { margin: 14px 0 8px; color: var(--dsw-alias-label-primary); }
.mdl-h1 { font: var(--dsw-font-markdown-h1); }
.mdl-h2 { font: var(--dsw-font-markdown-h2); }
.mdl-h3 { font: var(--dsw-font-markdown-h3); }
.mdl-h4 { font: var(--dsw-font-markdown-h4); }
.mdl-h5 { font: var(--dsw-font-markdown-base-strong); }
.mdl-h6 { font: var(--dsw-font-markdown-base-strong); color: var(--dsw-alias-label-secondary); }

.mdl-strong { font-weight: 600; }
.mdl-em { font-style: italic; }
.mdl-del { color: var(--dsw-alias-label-secondary); text-decoration: line-through; }

.mdl-code-inline {
  display: inline-block;
  padding: 0 5px;
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-sm);
  background-color: var(--dsw-alias-markdown-inline-code);
  font: var(--dsw-font-markdown-code);
  font-family: var(--ds-font-family-code);
  font-size: 0.875em;
}

.mdl-link {
  color: var(--dsw-alias-link, var(--dsw-alias-state-business-primary));
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: default;
}

.mdl-image {
  display: block;
  max-width: 100%;
  max-height: 240px;
  margin: 4px 0;
  border-radius: var(--dsw-radius-sm);
}

.mdl-math-display { display: block; margin: 4px 0; overflow-x: auto; overflow-y: hidden; }
.mdl-math-block { margin: 0 0 10px; overflow-x: auto; overflow-y: hidden; }
.mdl-math .katex-display, .mdl-math-block .katex-display { margin: 0.2em 0; text-align: left; }
.mdl-math-block .katex-display > .katex { text-align: left; }

.mdl-list { margin: 0 0 10px; padding-left: 22px; }
.mdl-list:has(> .mdl-li-task) { padding-left: 2px; list-style: none; }
.mdl-li { margin: 2px 0; }
.mdl-li > *:last-child { margin-bottom: 0; }
.mdl-li > .mdl-list { margin-bottom: 0; }
.mdl-li-task { display: flex; gap: 8px; align-items: flex-start; }
.mdl-checkbox { flex: none; margin: 5px 0 0; accent-color: var(--dsw-alias-state-business-primary); }
.mdl-li-task > .mdl-task-body { flex: 1; min-width: 0; }

.mdl-quote {
  margin: 0 0 10px;
  padding-left: 14px;
  border-left: 2px solid var(--dsw-alias-label-caption);
}
.mdl-quote > *:last-child { margin-bottom: 0; }

.mdl-hr {
  margin: 14px 0;
  border: none;
  border-top: 1px solid var(--dsw-alias-border-l1);
}

.mdl-code-block {
  margin: 0 0 10px;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-markdown-code-block);
  overflow: hidden;
}
.mdl-code-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 10px;
  color: var(--dsw-alias-label-secondary);
  font-family: var(--ds-font-family-code);
  font-size: 11px;
  line-height: 18px;
}
.mdl-copy {
  flex: none;
  padding: 0 4px;
  border: none;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
@media (hover: hover) {
  .mdl-copy:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); }
}
.mdl-pre {
  margin: 0;
  padding: 0 10px 10px;
  overflow-x: auto;
  color: var(--dsw-alias-label-primary);
  font: var(--dsw-font-markdown-code-block);
}
.mdl-pre > code { font: inherit; white-space: pre; }

.mdl-table-wrap { margin: 0 0 10px; overflow-x: auto; }
.mdl-table { border-collapse: collapse; width: 100%; font: var(--dsw-font-markdown-table); }
.mdl-th, .mdl-td {
  padding: 6px 10px;
  text-align: start;
  vertical-align: top;
}
.mdl-th { border-bottom: 0.5px solid var(--dsw-alias-border-l3); font: var(--dsw-font-markdown-table-head); }
.mdl-td { border-bottom: 0.5px solid var(--dsw-alias-border-l2); }

.mdl-note {
  margin: 0 0 8px;
  color: var(--dsw-alias-label-tertiary);
  font: var(--dsw-font-markdown-small);
}

.mdl-toggle {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 999px;
  corner-shape: round;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
@media (hover: hover) {
  .mdl-toggle:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); }
}
.mdl-toggle-on { color: var(--dsw-alias-state-business-primary); }
@media (hover: hover) {
  .mdl-toggle-on:hover { color: var(--dsw-alias-state-business-primary); }
}
.mdl-toggle:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}
`

    /* ------------------------------------------------------------------ math */

    /** A TeX command such as \frac or \kappa. */
    const TEX_COMMAND = /\\[a-zA-Z]{2,}/u
    /** A braced script or a caret script, which prose rarely uses. */
    const TEX_SCRIPT = /\^\{|_\{|\^[\d{(A-Za-z]/u
    /** A digit subscript such as x_1; identifier words usually keep letters after `_`. */
    const TEX_SUBSCRIPT = /_[\p{N}]/u
    /** A symbol that only occurs in mathematical notation. */
    const TEX_SYMBOL = /[±×÷·≤≥≠≈∞∑∏∫√∂→←↦∪∩⊆∈∉]/u
    /** An operator that a currency amount does not carry between dollars. */
    const DOLLAR_OPERATOR = /[=+\-*/<>^_|\\{}]/u

    /**
     * Decide whether a span carries TeX rather than an identifier or a path.
     * @param source - the span's text.
     * @returns whether the text carries a TeX-specific signal.
     */
    function looksLikeTex(source) {
      return TEX_COMMAND.test(source) || TEX_SCRIPT.test(source)
        || TEX_SUBSCRIPT.test(source) || TEX_SYMBOL.test(source)
    }

    /**
     * Decide whether a single-dollar span is math rather than a currency amount.
     * @param tex - the span's text between the dollars.
     * @returns whether the span should be typeset.
     */
    function looksLikeDollarMath(tex) {
      if (looksLikeTex(tex)) return true
      if (tex.length > 120) return false
      if (/^[A-Za-z]$/u.test(tex)) return true
      if (DOLLAR_OPERATOR.test(tex)) return true
      return tex.length <= 40 && /[\p{Script=Greek}]/u.test(tex)
    }

    /**
     * Typeset one formula; a failure falls back to the source instead of throwing.
     * @param tex - the formula source.
     * @param displayMode - whether to render display math.
     * @returns trusted KaTeX HTML, or null when the renderer is unavailable.
     */
    function renderMath(tex, displayMode) {
      const katex = __dshMdPreviewKatex
      if (katex === undefined || katex === null || typeof katex.renderToString !== 'function') return null
      try {
        return katex.renderToString(tex, {
          displayMode: displayMode,
          throwOnError: false,
          strict: 'ignore',
          trust: false,
          errorColor: 'var(--dsw-alias-state-error-primary)',
        })
      } catch (error) {
        return null
      }
    }

    /** One formula: KaTeX markup, or its delimited source when KaTeX cannot render it. */
    function MathInline(props) {
      const html = renderMath(props.tex, props.display)
      if (html === null) {
        const delimited = (props.display ? '$$' : '$') + props.tex + (props.display ? '$$' : '$')
        return h('code', { className: 'mdl-code-inline' }, delimited)
      }
      return h('span', {
        className: props.display ? 'mdl-math mdl-math-display' : 'mdl-math',
        dangerouslySetInnerHTML: { __html: html },
      })
    }

    /* --------------------------------------------------------------- inline  */

    const ESCAPABLE = '\\`*_{}[]()#+-.!~|>'
    const EYE_PATH = 'M8 3.2C4.6 3.2 1.9 5.5 1 8c.9 2.5 3.6 4.8 7 4.8s6.1-2.3 7-4.8c-.9-2.5-3.6-4.8-7-4.8Zm0 7.6A2.8 2.8 0 1 1 8 5.2a2.8 2.8 0 0 1 0 5.6Zm0-1.7a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2Z'

    /** Index of the closing backtick run of exactly `run` characters, or -1. */
    function findCodeClose(text, from, run) {
      let index = from
      while (index < text.length) {
        const at = text.indexOf('`', index)
        if (at < 0) return -1
        let length = 0
        while (text[at + length] === '`') length += 1
        if (length === run) return at
        index = at + length
      }
      return -1
    }

    /** Parse `[label](target "title")` starting at the `[` offset, or null. */
    function matchLinkAt(text, open) {
      let depth = 0
      for (let index = open; index < text.length; index += 1) {
        const char = text[index]
        if (char === '\\') {
          index += 1
          continue
        }
        if (char === '[') {
          depth += 1
          continue
        }
        if (char !== ']') continue
        depth -= 1
        if (depth > 0) continue
        if (text[index + 1] !== '(') return null
        const close = text.indexOf(')', index + 2)
        if (close < 0) return null
        const target = text.slice(index + 2, close).trim()
        const parts = /^(\S+?)(?:\s+["'](.*)["'])?$/.exec(target)
        if (parts === null) return null
        return {
          label: text.slice(open + 1, index),
          href: parts[1],
          title: parts[2] === undefined ? '' : parts[2],
          end: close + 1,
        }
      }
      return null
    }

    /** Offset of the closing emphasis marker, or -1 when none qualifies. */
    function findEmphasisClose(text, from, marker) {
      if (from >= text.length) return -1
      if (/\s/.test(text[from])) return -1
      let index = from
      while (index <= text.length - marker.length) {
        const at = text.indexOf(marker, index)
        if (at < 0) return -1
        if (at > from && !/\s/.test(text[at - 1])) return at
        index = at + marker.length
      }
      return -1
    }

    /**
     * Render one inline span as React nodes.
     * @param text - inline Markdown source.
     * @param prefix - stable key prefix for the produced elements.
     * @returns strings and keyed React elements.
     */
    function parseInline(text, prefix) {
      const out = []
      let buffer = ''
      let index = 0
      let counter = 0
      const nextKey = function nextKey() {
        counter += 1
        return prefix + ':' + String(counter)
      }
      const flush = function flush() {
        if (buffer === '') return
        out.push(buffer)
        buffer = ''
      }

      while (index < text.length) {
        const char = text[index]

        if (char === '\\' && index + 1 < text.length && ESCAPABLE.indexOf(text[index + 1]) >= 0) {
          buffer += text[index + 1]
          index += 2
          continue
        }

        if (char === '`') {
          let run = 1
          while (text[index + run] === '`') run += 1
          const close = findCodeClose(text, index + run, run)
          if (close < 0) {
            buffer += text.slice(index, index + run)
            index += run
            continue
          }
          let code = text.slice(index + run, close).replace(/\n/g, ' ')
          if (code.length > 2 && code[0] === ' ' && code[code.length - 1] === ' ' && code.trim() !== '') {
            code = code.slice(1, -1)
          }
          flush()
          out.push(h('code', { key: nextKey(), className: 'mdl-code-inline' }, code))
          index = close + run
          continue
        }

        if (char === '!' && text[index + 1] === '[') {
          const image = matchLinkAt(text, index + 1)
          if (image !== null) {
            flush()
            out.push(h('img', {
              key: nextKey(),
              className: 'mdl-image',
              src: image.href,
              alt: image.label,
              title: image.title === '' ? undefined : image.title,
            }))
            index = image.end
            continue
          }
        }

        if (char === '$') {
          const marker = text[index + 1] === '$' ? '$$' : '$'
          const close = text.indexOf(marker, index + marker.length)
          if (close > 0 && text.slice(index, close).indexOf('\n') < 0) {
            const raw = text.slice(index + marker.length, close)
            const tex = raw.trim()
            const display = marker === '$$'
            // `$5 and $10` is prose: a currency span keeps its inner whitespace.
            if (tex !== '' && raw[0] !== ' ' && raw[raw.length - 1] !== ' '
              && (display || looksLikeDollarMath(tex))) {
              flush()
              out.push(h(MathInline, { key: nextKey(), tex: tex, display: display }))
              index = close + marker.length
              continue
            }
          }
          buffer += '$'
          index += 1
          continue
        }

        if (char === '[') {
          const link = matchLinkAt(text, index)
          if (link !== null) {
            flush()
            out.push(h('span', {
              key: nextKey(),
              className: 'mdl-link',
              title: link.title === '' ? link.href : link.href + ' — ' + link.title,
            }, parseInline(link.label, nextKey())))
            index = link.end
            continue
          }
        }

        if (char === '<') {
          const auto = /^<((?:https?:\/\/|mailto:)[^\s>]+)>/.exec(text.slice(index))
          if (auto !== null) {
            flush()
            out.push(h('span', { key: nextKey(), className: 'mdl-link', title: auto[1] }, auto[1]))
            index += auto[0].length
            continue
          }
        }

        if (char === '*' || char === '_' || char === '~') {
          let run = 1
          while (text[index + run] === char) run += 1
          const intraword = char === '_' && index > 0 && /[\w\u4e00-\u9fff]/.test(text[index - 1])
          if (!intraword) {
            let strong = null
            if (char !== '~' && run >= 3) {
              // `***both***`: strong wrapping em, so the surplus marker is consumed
              // instead of leaking a literal `**` into the paragraph.
              const marker = char + char + char
              const close = findEmphasisClose(text, index + 3, marker)
              if (close >= 0) {
                strong = {
                  tag: 'strong',
                  className: 'mdl-strong',
                  inner: char,
                  content: text.slice(index + 3, close),
                  end: close + 3,
                }
              }
            }
            if (strong === null && char === '~' && run >= 2) {
              const close = findEmphasisClose(text, index + 2, '~~')
              if (close >= 0) strong = { tag: 'del', className: 'mdl-del', content: text.slice(index + 2, close), end: close + 2 }
            } else if (strong === null && char !== '~' && run >= 2) {
              const marker = char + char
              const close = findEmphasisClose(text, index + 2, marker)
              if (close >= 0) strong = { tag: 'strong', className: 'mdl-strong', content: text.slice(index + 2, close), end: close + 2 }
            }
            if (strong !== null) {
              flush()
              const inner = parseInline(strong.content, nextKey())
              out.push(h(strong.tag, { key: nextKey(), className: strong.className },
                strong.inner === undefined
                  ? inner
                  : h('em', { className: 'mdl-em' }, inner)))
              index = strong.end
              continue
            }
            if (char !== '~') {
              const close = findEmphasisClose(text, index + 1, char)
              if (close >= 0) {
                flush()
                out.push(h('em', { key: nextKey(), className: 'mdl-em' }, parseInline(text.slice(index + 1, close), nextKey())))
                index = close + 1
                continue
              }
            }
          }
          buffer += text.slice(index, index + run)
          index += run
          continue
        }

        if (char === '\n') {
          if (/ {2}$/.test(buffer) || buffer.slice(-1) === '\\') {
            buffer = buffer.replace(/ {2}$/, '').replace(/\\$/, '')
            flush()
            out.push(h('br', { key: nextKey() }))
            index += 1
            continue
          }
          buffer += ' '
          index += 1
          continue
        }

        buffer += char
        index += 1
      }

      flush()
      return out
    }

    /* ---------------------------------------------------------------- blocks */

    function isBlank(line) {
      return line.trim() === ''
    }

    function leadingSpaces(line) {
      let count = 0
      for (let index = 0; index < line.length; index += 1) {
        const char = line[index]
        if (char === ' ') count += 1
        else if (char === '\t') count += 4
        else break
      }
      return count
    }

    function isHorizontalRule(line) {
      return /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)
    }

    /** A line that begins a new block, so a running paragraph must stop. */
    function startsBlock(line) {
      if (/^ {0,3}#{1,6}(?:\s|$)/.test(line)) return true
      if (/^ {0,3}(?:`{3,}|~{3,})/.test(line)) return true
      if (/^ {0,3}>/.test(line)) return true
      if (isHorizontalRule(line)) return true
      if (/^\s*(?:[-*+]|\d{1,9}[.)])(?:\s|$)/.test(line)) return true
      if (/^\s*\|/.test(line)) return true
      return false
    }

    function matchListItem(line) {
      const match = /^(\s*)([-*+]|\d{1,9}[.)])(?:[ \t]+(.*))?$/.exec(line)
      if (match === null) return null
      return {
        indent: leadingSpaces(match[1]),
        ordered: /^\d/.test(match[2]),
        index: /^\d/.test(match[2]) ? parseInt(match[2], 10) : 1,
        text: match[3] === undefined ? '' : match[3],
      }
    }

    function splitRow(line) {
      let text = line.trim()
      if (text[0] === '|') text = text.slice(1)
      if (text[text.length - 1] === '|') text = text.slice(0, -1)
      const cells = []
      let buffer = ''
      for (let index = 0; index < text.length; index += 1) {
        const char = text[index]
        if (char === '\\' && text[index + 1] === '|') {
          buffer += '|'
          index += 1
          continue
        }
        if (char === '|') {
          cells.push(buffer.trim())
          buffer = ''
          continue
        }
        buffer += char
      }
      cells.push(buffer.trim())
      return cells
    }

    function isTableStart(lines, index) {
      if (index + 1 >= lines.length) return false
      if (lines[index].indexOf('|') < 0) return false
      return /^\s*\|?\s*:?-{1,}:?\s*(?:\|\s*:?-{1,}:?\s*)+\|?\s*$/.test(lines[index + 1])
    }

    function tableAlign(separatorCell) {
      const left = separatorCell.trim()[0] === ':'
      const right = separatorCell.trim().slice(-1) === ':'
      if (left && right) return 'center'
      if (right) return 'right'
      if (left) return 'left'
      return ''
    }

    /**
     * Parse a Markdown source into block nodes.
     * @param source - Markdown text.
     * @returns block nodes in document order.
     */
    function parseBlocks(source) {
      const lines = String(source).split('\n')
      const blocks = []
      let index = 0

      while (index < lines.length) {
        const line = lines[index]
        if (isBlank(line)) {
          index += 1
          continue
        }

        const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
        if (fence !== null) {
          const marker = fence[1]
          const char = marker[0]
          const body = []
          index += 1
          while (index < lines.length) {
            const closing = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(lines[index])
            if (closing !== null && closing[1][0] === char && closing[1].length >= marker.length) {
              index += 1
              break
            }
            body.push(lines[index])
            index += 1
          }
          const info = fence[2].trim().split(/\s+/)[0] || ''
          if (/^(?:math|latex|tex)$/i.test(info)) {
            const tex = body.join('\n').trim()
            if (tex !== '') blocks.push({ type: 'math', tex: tex })
          } else {
            blocks.push({ type: 'code', lang: info, code: body.join('\n') })
          }
          continue
        }

        const displayMath = /^ {0,3}\$\$(.*)$/.exec(line)
        if (displayMath !== null) {
          const head = displayMath[1]
          const closingHere = head.indexOf('$$')
          if (closingHere >= 0) {
            const tex = head.slice(0, closingHere).trim()
            if (tex !== '') blocks.push({ type: 'math', tex: tex })
            index += 1
            continue
          }
          const body = head.trim() === '' ? [] : [head]
          let closed = false
          index += 1
          while (index < lines.length) {
            const at = lines[index].indexOf('$$')
            if (at >= 0) {
              body.push(lines[index].slice(0, at))
              index += 1
              closed = true
              break
            }
            body.push(lines[index])
            index += 1
          }
          const tex = body.join('\n').trim()
          // An unclosed `$$` is a half-typed formula, not a block that swallows the rest.
          if (closed && tex !== '') blocks.push({ type: 'math', tex: tex })
          else blocks.push({ type: 'paragraph', text: ['$$' + head].concat(body).join('\n') })
          continue
        }

        const atx = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/.exec(line)
        if (atx !== null) {
          const text = (atx[2] === undefined ? '' : atx[2]).replace(/\s+#+\s*$/, '').trim()
          // A bare `#` is a half-typed heading, not a rendered empty line: skip it
          // so the card does not flash an empty heading while the user types.
          if (text !== '') blocks.push({ type: 'heading', level: atx[1].length, text: text })
          index += 1
          continue
        }

        if (isHorizontalRule(line)) {
          blocks.push({ type: 'hr' })
          index += 1
          continue
        }

        if (/^ {0,3}>/.test(line)) {
          const body = []
          while (index < lines.length) {
            if (/^ {0,3}>/.test(lines[index])) {
              body.push(lines[index].replace(/^ {0,3}> ?/, ''))
              index += 1
              continue
            }
            if (!isBlank(lines[index]) && body.length > 0 && !startsBlock(lines[index])) {
              body.push(lines[index])
              index += 1
              continue
            }
            break
          }
          blocks.push({ type: 'blockquote', blocks: parseBlocks(body.join('\n')) })
          continue
        }

        const firstItem = matchListItem(line)
        if (firstItem !== null) {
          const items = []
          const indent = firstItem.indent
          const ordered = firstItem.ordered
          let current = { text: firstItem.text, lines: [] }
          items.push(current)
          index += 1
          while (index < lines.length) {
            const raw = lines[index]
            if (isBlank(raw)) {
              let ahead = index + 1
              while (ahead < lines.length && isBlank(lines[ahead])) ahead += 1
              if (ahead >= lines.length) {
                index = ahead
                break
              }
              const nextItem = matchListItem(lines[ahead])
              if (nextItem !== null && nextItem.indent === indent && nextItem.ordered === ordered) {
                index = ahead
                continue
              }
              if (leadingSpaces(lines[ahead]) > indent) {
                current.lines.push('')
                index += 1
                continue
              }
              index = ahead
              break
            }
            const entry = matchListItem(raw)
            if (entry !== null && entry.indent === indent && entry.ordered === ordered) {
              current = { text: entry.text, lines: [] }
              items.push(current)
              index += 1
              continue
            }
            if (entry !== null && entry.indent < indent) break
            const rawIndent = leadingSpaces(raw)
            if (rawIndent > indent) {
              current.lines.push(raw.slice(Math.min(rawIndent, indent + 2)))
              index += 1
              continue
            }
            if (entry === null && !startsBlock(raw)) {
              current.lines.push(raw)
              index += 1
              continue
            }
            break
          }
          blocks.push({ type: 'list', ordered: ordered, start: firstItem.index, items: items })
          continue
        }

        if (isTableStart(lines, index)) {
          const header = splitRow(line)
          const separators = splitRow(lines[index + 1])
          const align = header.map(function column(_, columnIndex) {
            return tableAlign(separators[columnIndex] === undefined ? '' : separators[columnIndex])
          })
          const rows = []
          index += 2
          while (index < lines.length && !isBlank(lines[index]) && lines[index].indexOf('|') >= 0) {
            rows.push(splitRow(lines[index]))
            index += 1
          }
          blocks.push({ type: 'table', header: header, align: align, rows: rows })
          continue
        }

        if (index + 1 < lines.length && /^ {0,3}(=+|-+)\s*$/.test(lines[index + 1])) {
          const level = lines[index + 1].trim()[0] === '=' ? 1 : 2
          blocks.push({ type: 'heading', level: level, text: line.trim() })
          index += 2
          continue
        }

        const paragraph = [line]
        index += 1
        while (index < lines.length && !isBlank(lines[index]) && !startsBlock(lines[index])) {
          paragraph.push(lines[index])
          index += 1
        }
        blocks.push({ type: 'paragraph', text: paragraph.join('\n') })
      }

      return blocks
    }

    /* ---------------------------------------------------------------- render */

    /** Copy a code block, preferring the async clipboard and falling back to a selection. */
    function copyToClipboard(text) {
      const fallback = function fallback() {
        try {
          const area = document.createElement('textarea')
          area.value = text
          area.setAttribute('readonly', '')
          area.style.position = 'fixed'
          area.style.top = '-1000px'
          document.body.appendChild(area)
          area.select()
          const copied = document.execCommand('copy')
          document.body.removeChild(area)
          return copied
        } catch (error) {
          return false
        }
      }
      if (navigator.clipboard !== undefined && typeof navigator.clipboard.writeText === 'function') {
        return navigator.clipboard.writeText(text).then(function done() {
          return true
        }, function retry() {
          return fallback()
        })
      }
      return Promise.resolve(fallback())
    }

    /** One fenced block with its language label and copy affordance. */
    function CodeBlock(props) {
      const t = props.t
      const [state, setState] = React.useState('idle')
      const timer = React.useRef(null)
      React.useEffect(function cleanup() {
        return function dispose() {
          if (timer.current !== null) window.clearTimeout(timer.current)
        }
      }, [])
      const onCopy = function onCopy() {
        Promise.resolve(copyToClipboard(props.code)).then(function settle(ok) {
          setState(ok ? 'done' : 'failed')
          if (timer.current !== null) window.clearTimeout(timer.current)
          timer.current = window.setTimeout(function reset() {
            timer.current = null
            setState('idle')
          }, 1400)
        })
      }
      const label = state === 'done' ? t('copy.done') : state === 'failed' ? t('copy.failed') : t('copy.action')
      return h('div', { className: 'mdl-code-block' },
        h('div', { className: 'mdl-code-head' },
          h('span', null, props.lang === '' ? 'code' : props.lang),
          h('button', { type: 'button', className: 'mdl-copy', onClick: onCopy }, label)),
        h('pre', { className: 'mdl-pre' }, h('code', null, props.code)))
    }

    function alignStyle(align) {
      if (align === '') return undefined
      return { textAlign: align }
    }

    function renderList(block, key, t) {
      const ListTag = block.ordered ? 'ol' : 'ul'
      const listProps = { key: key, className: 'mdl-list' }
      if (block.ordered && block.start > 1) listProps.start = block.start
      const children = block.items.map(function renderItem(item, itemIndex) {
        const itemKey = key + '.' + String(itemIndex)
        const task = /^\[([ xX])\](?:\s+|$)/.exec(item.text)
        const head = task === null ? item.text : item.text.slice(task[0].length)
        const source = item.lines.length === 0 ? head : head + '\n' + item.lines.join('\n')
        const nested = parseBlocks(source)
        const simple = nested.length === 1 && nested[0].type === 'paragraph'
        const body = nested.length === 0
          ? []
          : simple
            ? parseInline(nested[0].text, itemKey)
            : renderBlocks(nested, itemKey, t)
        if (task === null) return h('li', { key: itemKey, className: 'mdl-li' }, body)
        return h('li', { key: itemKey, className: 'mdl-li mdl-li-task' },
          h('input', {
            type: 'checkbox',
            className: 'mdl-checkbox',
            checked: task[1].toLowerCase() === 'x',
            disabled: true,
            readOnly: true,
            tabIndex: -1,
          }),
          h('span', { className: 'mdl-task-body' }, body))
      })
      return h(ListTag, listProps, children)
    }

    function renderTable(block, key) {
      const head = h('thead', null, h('tr', null, block.header.map(function renderCell(cell, column) {
        return h('th', {
          key: 'h' + String(column),
          className: 'mdl-th',
          style: alignStyle(block.align[column]),
        }, parseInline(cell, key + '.h' + String(column)))
      })))
      const body = h('tbody', null, block.rows.map(function renderRow(row, rowIndex) {
        const rowKey = key + '.' + String(rowIndex)
        return h('tr', { key: rowKey }, block.header.map(function renderCell(_, column) {
          return h('td', {
            key: 'c' + String(column),
            className: 'mdl-td',
            style: alignStyle(block.align[column]),
          }, parseInline(row[column] === undefined ? '' : row[column], rowKey + '.' + String(column)))
        }))
      }))
      return h('div', { key: key, className: 'mdl-table-wrap' },
        h('table', { className: 'mdl-table' }, head, body))
    }

    /**
     * Render block nodes as React elements.
     * @param blocks - parsed block nodes.
     * @param prefix - stable key prefix.
     * @param t - namespace translate.
     * @returns keyed React elements.
     */
    function renderBlocks(blocks, prefix, t) {
      return blocks.map(function renderBlock(block, index) {
        const key = prefix + '.' + String(index)
        switch (block.type) {
          case 'heading': {
            const tag = 'h' + String(block.level)
            return h(tag, { key: key, className: 'mdl-h mdl-h' + String(block.level) }, parseInline(block.text, key))
          }
          case 'paragraph':
            return h('p', { key: key, className: 'mdl-p' }, parseInline(block.text, key))
          case 'hr':
            return h('hr', { key: key, className: 'mdl-hr' })
          case 'code':
            return h(CodeBlock, { key: key, lang: block.lang, code: block.code, t: t })
          case 'math':
            return h('div', { key: key, className: 'mdl-math-block' },
              h(MathInline, { tex: block.tex, display: true }))
          case 'blockquote':
            return h('blockquote', { key: key, className: 'mdl-quote' }, renderBlocks(block.blocks, key, t))
          case 'list':
            return renderList(block, key, t)
          case 'table':
            return renderTable(block, key)
          default:
            return null
        }
      })
    }

    /* ------------------------------------------------------------ components */

    function translateFrom(props) {
      return typeof props.t === 'function'
        ? props.t
        : function passthrough(key) {
          return String(key)
        }
    }

    /** Cut a long draft at a line boundary so a truncated preview keeps whole blocks. */
    function truncateAtLine(text, limit) {
      const head = text.slice(0, limit)
      const lastBreak = head.lastIndexOf('\n')
      return lastBreak > limit * 0.8 ? head.slice(0, lastBreak) : head
    }

    /** The card above the input card: the draft, rendered. */
    function MarkdownPreview(props) {
      const t = translateFrom(props)
      const [preferenceValue, setPreference] = usePreference()
      const useInput = props.useInput
      const draft = typeof useInput === 'function'
        ? useInput(function select(state) {
          return state === undefined ? '' : state.draft
        })
        : ''
      const source = typeof draft === 'string' ? draft : ''
      const truncated = source.length > PREVIEW_LIMIT
      const visible = truncated ? truncateAtLine(source, PREVIEW_LIMIT) : source
      const blocks = React.useMemo(function parse() {
        return parseBlocks(visible)
      }, [visible])
      const bodyRef = React.useRef(null)
      // Follow the tail while the user is at the bottom, so the line being typed
      // stays visible in a capped card; a deliberate scroll up wins until they
      // come back down. Truncated drafts keep their head in view instead.
      const followTail = React.useRef(true)
      const lastSession = React.useRef(props.sessionId)
      const lastTruncated = React.useRef(false)

      React.useLayoutEffect(function followDraft() {
        const node = bodyRef.current
        if (node === null) {
          followTail.current = true
          lastTruncated.current = false
          return
        }
        if (lastSession.current !== props.sessionId) {
          lastSession.current = props.sessionId
          followTail.current = true
        }
        if (truncated && !lastTruncated.current) node.scrollTop = 0
        lastTruncated.current = truncated
        if (truncated || !followTail.current) return
        node.scrollTop = node.scrollHeight
      })

      const onBodyScroll = function onBodyScroll() {
        const node = bodyRef.current
        if (node === null) return
        followTail.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48
      }

      if (!preferenceValue || blocks.length === 0) return null

      return h(React.Fragment, null,
        h('style', { key: 'style' }, CSS),
        h('div', {
          key: 'card',
          className: 'mdl-card',
          role: 'region',
          'aria-label': t('preview.region'),
          // A click anywhere in the preview must not move the caret out of the
          // draft editor: the card is a sibling of the composer card, so the
          // host's own refocus handler cannot cover it.
          onMouseDown: function keepDraftFocus(event) {
            event.preventDefault()
          },
        },
        h('div', { className: 'mdl-head' },
          h('span', { className: 'mdl-title' }, t('preview.title')),
          h('button', {
            type: 'button',
            className: 'mdl-close',
            'aria-label': t('toggle.hide'),
            title: t('toggle.hide'),
            onClick: function hide() {
              setPreference(false)
            },
          }, h('svg', { viewBox: '0 0 16 16', width: 12, height: 12, 'aria-hidden': true, focusable: 'false' },
            h('path', {
              d: 'M3.4 3.4 12.6 12.6M12.6 3.4 3.4 12.6',
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: 1.5,
              strokeLinecap: 'round',
            })))),
        h('div', { className: 'mdl-body', ref: bodyRef, onScroll: onBodyScroll },
          truncated ? h('p', { key: 'note', className: 'mdl-note' }, t('preview.truncated')) : null,
          renderBlocks(blocks, 'md', t))))
    }

    /** The composer tool-row toggle for the preview. */
    function PreviewToggle(props) {
      const t = translateFrom(props)
      const [enabled, setEnabled] = usePreference()
      const label = enabled ? t('toggle.hide') : t('toggle.show')
      return h(React.Fragment, null,
        h('style', { key: 'style' }, CSS),
        h('button', {
          key: 'toggle',
          type: 'button',
          className: enabled ? 'mdl-toggle mdl-toggle-on' : 'mdl-toggle',
          'aria-pressed': enabled ? 'true' : 'false',
          'aria-label': label,
          title: label,
          // Pressing the toggle must not take the caret out of the draft editor.
          onMouseDown: function keepCaret(event) {
            event.preventDefault()
          },
          onClick: function toggle() {
            setEnabled(!enabled)
          },
        }, h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true, focusable: 'false' },
          h('path', { d: EYE_PATH, fill: 'currentColor' }),
          enabled ? null : h('path', {
            d: 'M3.2 12.8 12.8 3.2',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.4,
            strokeLinecap: 'round',
          }))))
    }

    /* --------------------------------------------------------------- plugin */

    function service(ctx, name) {
      try {
        const value = ctx.get(name)
        if (value !== undefined && value !== null) return value
      } catch (error) {
        // A restricted context without the accessor falls through to the property.
      }
      try {
        return ctx[name]
      } catch (error) {
        return undefined
      }
    }

    return {
      inject: ['slots', 'locale'],
      apply: function apply(ctx) {
        const slots = service(ctx, 'slots')
        if (slots === undefined || typeof slots.inject !== 'function') return
        const locale = service(ctx, 'locale')
        if (locale !== undefined && typeof locale.register === 'function') {
          const dictionaries = { zh: zh, en: en }
          if (typeof ctx.effect === 'function') {
            ctx.effect(function registerDictionaries() {
              return locale.register(NS, dictionaries)
            }, 'md-live-preview: dictionaries')
          } else {
            locale.register(NS, dictionaries)
          }
        }
        slots.inject('conversation.input.dock', function registerPreview() {
          return slots.register({
            name: 'conversation.input.dock',
            id: 'md-live-preview',
            // Above the queue dock (order 20), which attaches itself to the input
            // card, and below the goal bar (order 10): the preview stays the card
            // closest to the input whenever nothing is queued.
            order: 15,
            locale: NS,
          }, MarkdownPreview)
        })
        slots.inject('conversation.input.right', function registerToggle() {
          return slots.register({
            name: 'conversation.input.right',
            id: 'md-live-preview.toggle',
            order: 5,
            locale: NS,
          }, PreviewToggle)
        })
      },
    }
  },
})
