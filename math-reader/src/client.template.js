/**
 * @local/dsh-math-reader — client half.
 *
 * Adds a "∑ formulas" bar to the tail of every completed Turn. The bar lists
 * the math the reply contains and typesets each entry with KaTeX, including the
 * TeX the model wrote inside backticks, which the Chat Markdown view shows as
 * monospaced source. Expansion defaults to on only when the reply kept math in
 * a code span, so a reply that already renders inline math stays quiet.
 *
 * KaTeX is inlined below (MIT, https://katex.org); the shell already ships the
 * matching KaTeX stylesheet and fonts, so this bundle adds no stylesheet and no
 * network request. Nothing here reads or writes the DOM of another view: the
 * component renders inside the slot the Chat view reserves and copies with the
 * async Clipboard API only.
 */
var __dshMathReaderKatex = (function () {
  try {
    var module = { exports: {} };
    var exports = module.exports;
    /*__KATEX__*/
    return module.exports;
  } catch (error) {
    // A failed KaTeX initialization leaves the bar showing TeX source only.
    if (typeof console !== 'undefined') console.error('[math-reader] KaTeX initialization failed', error);
    return undefined;
  }
})();

window.__ModuleLoader__.load({
  id: '__DSH_PACKAGE_NAME__',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this plugin. */
    const NS = 'mathReader';

    /** Simplified Chinese copy. */
    const zh = {
      'shelf.title': '公式 {count}',
      'shelf.expand': '展开公式排版',
      'shelf.collapse': '收起公式排版',
      'card.source': '显示 TeX 源码',
      'card.rendered': '显示排版结果',
      'card.copy': '复制 LaTeX',
      'card.copied': '已复制',
      'card.copyFailed': '复制失败',
      'card.fromCode': '原文写在代码里',
      'card.copyLabel': '复制第 {index} 个公式的 LaTeX',
      'card.sourceLabel': '显示第 {index} 个公式的 TeX 源码',
      'card.mathLabel': '第 {index} 个公式',
      'shelf.truncated': '共 {total} 个公式，仅显示前 {shown} 个',
    };

    /** English copy. */
    const en = {
      'shelf.title': 'Formulas {count}',
      'shelf.expand': 'Show typeset formulas',
      'shelf.collapse': 'Hide typeset formulas',
      'card.source': 'Show TeX source',
      'card.rendered': 'Show typeset formula',
      'card.copy': 'Copy LaTeX',
      'card.copied': 'Copied',
      'card.copyFailed': 'Copy failed',
      'card.fromCode': 'written inside code',
      'card.copyLabel': 'Copy LaTeX of formula {index}',
      'card.sourceLabel': 'Show TeX source of formula {index}',
      'card.mathLabel': 'Formula {index}',
      'shelf.truncated': '{total} formulas found, showing the first {shown}',
    };

    /** Panel styles; theme tokens only, so light and dark both resolve. */
    const STYLES = `
.dsh-math-reader { display: flex; flex-direction: column; gap: 6px; margin: 2px 0 10px; font-size: 13px; color: var(--dsw-alias-label-primary); }
.dsh-math-reader__toggle { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; max-width: 100%; padding: 2px 9px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; line-height: 20px; cursor: pointer; }
.dsh-math-reader__toggle:hover { border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); }
.dsh-math-reader__toggle:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dsh-math-reader__sigma { font-family: ui-serif, Georgia, serif; font-size: 15px; line-height: 1; color: var(--dsw-alias-brand-primary); }
.dsh-math-reader__caret { font-size: 10px; }
.dsh-math-reader__panel { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); max-height: min(62vh, 560px); overflow-y: auto; }
.dsh-math-reader__card { display: flex; flex-direction: column; gap: 2px; padding: 8px 0; border-top: 1px solid var(--dsw-alias-border-l1); }
.dsh-math-reader__card:first-child { border-top: none; padding-top: 2px; }
.dsh-math-reader__row { display: flex; align-items: flex-start; gap: 8px; }
.dsh-math-reader__math { flex: 1 1 auto; min-width: 0; overflow-x: auto; overflow-y: hidden; padding: 1px 0; font-size: 14px; }
.dsh-math-reader__math .katex-display { margin: 0.2em 0; text-align: left; }
.dsh-math-reader__math .katex-display > .katex { text-align: left; }
.dsh-math-reader__tools { display: flex; flex: 0 0 auto; gap: 4px; }
.dsh-math-reader__button { padding: 1px 6px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11px; line-height: 18px; cursor: pointer; }
.dsh-math-reader__button:hover { border-color: var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); }
.dsh-math-reader__button:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dsh-math-reader__source { margin: 2px 0 0; padding: 5px 8px; border-radius: 6px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 18px; white-space: pre-wrap; word-break: break-word; }
.dsh-math-reader__context { padding-right: 4px; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
.dsh-math-reader__note { padding-top: 2px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dsh-math-reader__sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
`;

    /** Delimiter rules; a longer delimiter is listed before the shorter one it contains. */
    const RULES = [
      { pattern: /```[ \t]*(?:math|latex|tex)[^\n]*\n([\s\S]*?)```/gu, display: true, origin: 'fence' },
      { pattern: /\$\$([\s\S]+?)\$\$/gu, display: true, origin: 'dollar', dollar: true },
      { pattern: /\\\[([\s\S]+?)\\\]/gu, display: true, origin: 'bracket' },
      { pattern: /\\\(([\s\S]+?)\\\)/gu, display: false, origin: 'paren' },
      { pattern: /`([^`\n]+)`/gu, display: false, origin: 'code' },
      { pattern: /\$([^$\n]+?)\$/gu, display: false, origin: 'dollar', dollar: true, inline: true },
    ];

    /** A TeX command such as \frac or \kappa. */
    const TEX_COMMAND = /\\[a-zA-Z]{2,}/u;

    /** A braced script or a caret script, which plain identifiers do not use. */
    const TEX_SCRIPT = /\^\{|_\{|\^[\d{(A-Za-z]/u;

    /** A digit subscript such as x_1; identifier words usually keep letters after the underscore. */
    const TEX_SUBSCRIPT = /_[\p{N}]/u;

    /** A symbol that only occurs in mathematical notation. */
    const TEX_SYMBOL = /[±×÷·≤≥≠≈∞∑∏∫√∂→←↦∪∩⊆∈∉]/u;

    /** Longest prose excerpt shown as each formula's context. */
    const CONTEXT_LENGTH = 72;

    /** Largest formula accepted in the panel; longer spans stay source. */
    const MAX_TEX_LENGTH = 1200;

    /** Largest number of formulas listed for one Turn. */
    const MAX_FORMULAS = 40;

    /**
     * Decide whether a code span holds math rather than an identifier or path.
     * @param source - the span's text.
     * @returns whether the text carries a TeX-specific signal.
     */
    function looksLikeTex(source) {
      if (source.length > MAX_TEX_LENGTH) return false;
      return TEX_COMMAND.test(source) || TEX_SCRIPT.test(source) || TEX_SUBSCRIPT.test(source)
        || TEX_SYMBOL.test(source);
    }

    /** An operator that a currency amount does not carry between dollars. */
    const DOLLAR_OPERATOR = /[=+\-*/<>^_|\\{}]/u;

    /**
     * Decide whether a single-dollar span is math rather than a currency amount.
     * A TeX signal, a lone letter, an operator, or a Greek letter counts;
     * "5 and " from "costs $5 and $10" does not.
     * @param tex - the span's text between the dollars.
     * @returns whether the span should be typeset.
     */
    function looksLikeDollarMath(tex) {
      if (looksLikeTex(tex)) return true;
      if (tex.length > 120) return false;
      if (/^[A-Za-z]$/u.test(tex)) return true;
      if (DOLLAR_OPERATOR.test(tex)) return true;
      return tex.length <= 40 && /[\p{Script=Greek}]/u.test(tex);
    }

    /**
     * Take the prose just before a formula so a detached list keeps its bearings.
     * @param text - the whole reply text.
     * @param index - the formula's offset in that text.
     * @returns one whitespace-collapsed excerpt, with a leading ellipsis when cut.
     */
    function contextBefore(text, index) {
      const excerpt = text.slice(Math.max(0, index - CONTEXT_LENGTH * 2), index)
        .replace(/\s+/gu, ' ')
        .replace(/^[-*>#\s]+/u, '')
        .trim();
      if (excerpt === '') return '';
      return excerpt.length > CONTEXT_LENGTH ? `…${excerpt.slice(-CONTEXT_LENGTH)}` : excerpt;
    }

    /**
     * Collect every formula in one piece of Markdown, in reading order.
     * @param text - the reply text.
     * @returns the listed formulas (capped) and the true total found.
     */
    function extractFormulas(text) {
      if (typeof text !== 'string' || text === '') return { formulas: [], total: 0 };
      const candidates = [];
      for (const rule of RULES) {
        rule.pattern.lastIndex = 0;
        for (const match of text.matchAll(rule.pattern)) {
          const source = match[1];
          if (source === undefined) continue;
          // An escaped dollar (\$) is prose, not a delimiter.
          if (rule.dollar === true && text[match.index - 1] === '\\') continue;
          const tex = source.trim();
          if (tex === '' || tex.length > MAX_TEX_LENGTH) continue;
          if (rule.origin === 'code' && !looksLikeTex(tex)) continue;
          if (rule.inline === true && !looksLikeDollarMath(tex)) continue;
          candidates.push({
            start: match.index,
            end: match.index + match[0].length,
            display: rule.display,
            origin: rule.origin,
            tex,
          });
        }
      }
      candidates.sort((left, right) => left.start - right.start || right.end - left.end);
      const accepted = [];
      const seen = new Set();
      let cursor = -1;
      for (const candidate of candidates) {
        if (candidate.start < cursor) continue;
        const identity = (candidate.display ? 'D' : 'I') + candidate.tex;
        if (seen.has(identity)) continue;
        seen.add(identity);
        accepted.push({ ...candidate, context: contextBefore(text, candidate.start) });
        cursor = candidate.end;
      }
      return { formulas: accepted.slice(0, MAX_FORMULAS), total: accepted.length };
    }

    /**
     * Read the closing Assistant text of one completed Turn.
     * @param turn - the Turn the tail reports.
     * @returns its text, or an empty string when no reply text is available.
     */
    function closingText(turn) {
      const read = (store, key) => (store !== undefined && store !== null
        && typeof store.get === 'function' ? store.get(key) : undefined);
      const tail = turn === undefined || turn === null ? undefined : read(turn.data, 'turn-tail');
      let blocks = tail === undefined || tail === null ? undefined : tail.closing?.blocks;
      if (!Array.isArray(blocks)) {
        let latest;
        for (const step of Array.isArray(turn?.steps) ? turn.steps : []) {
          const assistant = read(step?.data, 'assistant-step');
          if (assistant === undefined || assistant === null || assistant.finalNode === undefined) continue;
          if (!Array.isArray(assistant.blocks)) continue;
          const seq = typeof assistant.finalNode.seq === 'number' ? assistant.finalNode.seq : 0;
          if (latest === undefined || seq >= latest.seq) latest = { seq, blocks: assistant.blocks };
        }
        blocks = latest === undefined ? undefined : latest.blocks;
      }
      if (!Array.isArray(blocks)) return '';
      return blocks
        .filter(block => block !== null && block !== undefined && block.kind === 'text' && typeof block.text === 'string')
        .map(block => block.text)
        .join('\n\n');
    }

    /**
     * Typeset one formula; a parse failure keeps the KaTeX error styling inside
     * the panel instead of throwing through the slot.
     * @param tex - the formula source.
     * @param displayMode - whether to render display math.
     * @returns trusted KaTeX HTML, or null when the renderer is unavailable.
     */
    function renderMath(tex, displayMode) {
      const katex = __dshMathReaderKatex;
      if (katex === undefined || katex === null || typeof katex.renderToString !== 'function') return null;
      try {
        return katex.renderToString(tex, {
          displayMode,
          throwOnError: false,
          strict: 'ignore',
          trust: false,
          errorColor: 'var(--dsw-alias-state-error-primary)',
        });
      } catch {
        return null;
      }
    }

    /**
     * Copy text through the async Clipboard API.
     * @param text - the LaTeX source to place on the clipboard.
     * @returns whether the browser confirmed the write.
     */
    function copyText(text) {
      const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
      if (clipboard === undefined || typeof clipboard.writeText !== 'function') return Promise.resolve(false);
      return clipboard.writeText(text).then(() => true, () => false);
    }

    /**
     * One formula card: the typeset result, the prose it answers to, its TeX
     * source on demand, and a copy action.
     * @param props - the formula, its 1-based ordinal, and the localized seat.
     * @returns the card.
     */
    function FormulaCard({ formula, index, t }) {
      const [showSource, setShowSource] = React.useState(false);
      const [copied, setCopied] = React.useState('idle');
      const timer = React.useRef(undefined);
      React.useEffect(() => () => { if (timer.current !== undefined) clearTimeout(timer.current); }, []);
      const html = React.useMemo(() => renderMath(formula.tex, formula.display), [formula.tex, formula.display]);
      const delimited = formula.display ? `$$${formula.tex}$$` : `$${formula.tex}$`;
      const settle = state => {
        setCopied(state);
        if (timer.current !== undefined) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied('idle'), 1600);
      };
      const copy = () => {
        copyText(delimited).then(accepted => settle(accepted ? 'copied' : 'failed'));
      };
      const mathChildren = html === null
        ? h('code', { className: 'dsh-math-reader__source' }, formula.tex)
        : h('div', {
          className: 'dsh-math-reader__math',
          'data-display': formula.display ? 'true' : 'false',
          tabIndex: 0,
          role: 'group',
          'aria-label': t('card.mathLabel', { index }),
          dangerouslySetInnerHTML: { __html: html },
        });
      return h('div', { className: 'dsh-math-reader__card' }, [
        formula.context === ''
          ? null
          : h('div', { className: 'dsh-math-reader__context', key: 'context' }, formula.context),
        h('div', { className: 'dsh-math-reader__row', key: 'row' }, [
          mathChildren,
          h('div', { className: 'dsh-math-reader__tools', key: 'tools' }, [
            h('button', {
              key: 'source',
              type: 'button',
              className: 'dsh-math-reader__button',
              'aria-expanded': showSource,
              'aria-label': t('card.sourceLabel', { index }),
              title: showSource ? t('card.rendered') : t('card.source'),
              onClick: () => setShowSource(value => !value),
            }, 'TeX'),
            h('button', {
              key: 'copy',
              type: 'button',
              className: 'dsh-math-reader__button',
              'aria-label': t('card.copyLabel', { index }),
              title: t('card.copy'),
              onClick: copy,
            }, copied === 'copied' ? t('card.copied') : copied === 'failed' ? t('card.copyFailed') : t('card.copy')),
            h('span', { key: 'status', role: 'status', className: 'dsh-math-reader__sr' },
              copied === 'copied' ? t('card.copied') : copied === 'failed' ? t('card.copyFailed') : ''),
          ]),
        ]),
        formula.origin === 'code'
          ? h('div', { className: 'dsh-math-reader__note', key: 'note' }, t('card.fromCode'))
          : null,
        showSource
          ? h('pre', { className: 'dsh-math-reader__source', key: 'source' }, h('code', null, delimited))
          : null,
      ]);
    }

    /**
     * The Turn-tail entry: nothing without math, a collapsed bar otherwise.
     * The newest Turn opens by itself when it kept math in a code span, because
     * that is the reply the reader is looking at; older Turns stay collapsed.
     * @param props - the completed Turn, the Chat snapshot hook, and the localized seat.
     * @returns the formula bar, or null when the reply holds no formula.
     */
    function MathShelf(props) {
      const { turn, t, useChat } = props;
      const latestTurn = useChat(snapshot => {
        const order = snapshot.timeline.turnOrder;
        return order.length === 0 ? undefined : order[order.length - 1];
      });
      const text = React.useMemo(() => closingText(turn), [turn]);
      const { formulas, total } = React.useMemo(() => extractFormulas(text), [text]);
      const [expanded, setExpanded] = React.useState(null);
      if (formulas.length === 0) return null;
      const newest = latestTurn === undefined || latestTurn === turn.turn;
      const open = expanded === null
        ? newest && formulas.some(formula => formula.origin === 'code')
        : expanded;
      return h('div', { className: 'dsh-math-reader' }, [
        h('button', {
          key: 'toggle',
          type: 'button',
          className: 'dsh-math-reader__toggle',
          'aria-expanded': open,
          title: open ? t('shelf.collapse') : t('shelf.expand'),
          onClick: () => setExpanded(!open),
        }, [
          h('span', { key: 'sigma', className: 'dsh-math-reader__sigma', 'aria-hidden': 'true' }, '∑'),
          h('span', { key: 'label' }, t('shelf.title', { count: formulas.length })),
          h('span', { key: 'caret', className: 'dsh-math-reader__caret', 'aria-hidden': 'true' }, open ? '▴' : '▾'),
        ]),
        open
          ? h('div', { key: 'panel', className: 'dsh-math-reader__panel' }, [
            ...formulas.map((formula, index) => h(FormulaCard, { key: index, formula, index: index + 1, t })),
            total > formulas.length
              ? h('div', { className: 'dsh-math-reader__note', key: 'truncated' },
                t('shelf.truncated', { total, shown: formulas.length }))
              : null,
          ])
          : null,
      ]);
    }

    /**
     * Insert the panel stylesheet; removal follows the plugin row.
     * @returns the disposer that removes the stylesheet.
     */
    function insertStyles() {
      const style = document.createElement('style');
      style.dataset.dshMathReader = '';
      style.textContent = STYLES;
      document.head.append(style);
      return () => { style.remove(); };
    }

    /**
     * Register the dictionaries and the Turn-tail entry for the plugin lifetime.
     * @param ctx - Client plugin context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'math-reader: dictionaries');
      ctx.effect(insertStyles, 'math-reader: styles');
      ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
        name: 'conversation.chat.turnTail',
        id: 'math-reader',
        order: 40,
        locale: NS,
      }, MathShelf));
    }

    return { name: 'math-reader', inject: ['slots', 'locale'], apply };
  },
});
