# Markdown live preview

Renders the composer draft as formatted Markdown — including KaTeX math — in a card directly
above the input card, updating on every keystroke.

## What it renders

- ATX headings (`#` … `######`) and setext headings (`===`, `---` under a line)
- Bold, italic, bold-italic, strikethrough, and inline code
- Fenced code blocks with a language label and a copy button; indented blocks stay plain text
- Bullet and numbered lists, nested lists, and task lists (`- [ ]` / `- [x]`)
- Blockquotes, horizontal rules, and tables with `:` alignment
- Links (`[label](target)` and `<https://…>`), images (`![alt](src)`), and hard line breaks
- **Math**: `$x$` inline, `$$…$$` display, and ```` ```math ```` fences, typeset with the same
  KaTeX build the Harness shell already styles. A currency amount such as `$5 and $10` stays
  prose instead of turning into math.

## Using it

The eye button in the composer tool row — left of the model selector — turns the preview on and
off; the eye is blue while the preview is on. The preview is on by default and is remembered per
browser. Typing Markdown makes a headed card appear directly above the input card; its × button
turns the preview off from the card itself. Clicking the preview keeps the caret in the input, so
typing continues without clicking back. The card follows the line you are typing until you scroll
it up. A draft longer than about 20,000 characters renders only its beginning, cut at a line
boundary, with a note at the top of the card.

## Limits and data

The preview reads the draft that this browser already holds through the composer's published
input state. It stores only the on/off preference in `localStorage` under
`dsh.md-live-preview.enabled`; it writes no session events, sends nothing to the Host, and leaves
the draft you send unchanged. The renderer covers the common Markdown a chat draft uses, not the
whole CommonMark specification: reference links, footnotes, raw HTML, and `\(…\)` / `\[…\]`
delimiters render as their literal source. Links display their target on hover and are not
clickable inside the preview, so clicking a preview never navigates the application. Because a
click on the preview is swallowed to keep the caret in the input, text cannot be selected inside
the preview; select it in the draft instead.

## Build and test

`client.js` is generated: `build.mjs` inlines the vendored KaTeX runtime (MIT, see
`THIRD-PARTY-NOTICES.md`) into `src/client.template.js`. KaTeX is a runtime dependency only —
the shell already ships the matching stylesheet and fonts, so the plugin adds no stylesheet and
no network request.

```
$env:ELECTRON_RUN_AS_NODE = '1'
& "<DSH_NODE_EXECUTABLE>" build.mjs
& "<DSH_NODE_EXECUTABLE>" test/smoke.mjs
```

The smoke test loads the built bundle against a stub loader/React/DOM and asserts the rendered
tree for math, currency, fences, tables, lists, empty drafts, and malformed input.
