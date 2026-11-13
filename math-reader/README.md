# Math reader

Typesets the formulas of a finished assistant reply with KaTeX, and asks the model to write math in delimiters the Chat view already renders in place.

## What it does

- **A formula bar per reply.** A completed Turn whose reply contains math gets a `∑ Formulas N` bar above the Turn action row. Open it to see every formula typeset, switch a formula to its TeX source, and copy the LaTeX. The newest reply opens by itself when it kept math inside a code span — the case the message itself shows as source; older replies start collapsed so a long conversation stays quiet.
- **Code-span math included.** TeX written inside backticks — `2^{-κ}/(δ(λ)·ρ(λ))·λ^{-O(1)}` — is typeset from the bar. The reply text itself is never modified.
- **A keepsake of its sentence.** Each card shows the last words of the prose before the formula, so a detached formula still reads in context, and a note marks the ones the reply kept in code.
- **A prompt section for future replies.** The Host half registers one system-prompt section (`math-reader-notation`) that asks for `$…$` inline math and `$$…$$` display math instead of TeX inside backticks, so later replies render in place through the shipped Markdown/KaTeX pipeline. It changes prompt text only: no model request, no tool, no session event.

## Recognized delimiters

`$$…$$`, `$…$`, `\[…\]`, `\(…\)`, ```` ```math ```` / ```` ```latex ```` fences, and inline code spans that carry a TeX signal (`\command`, `^{…}`, `_{…}`, `x^2`, or a math symbol such as `∑`, `≤`, `·`, `→∞`). Code spans that are identifiers, paths, or URLs stay code.

## Limitations

- The bar appears at the end of a Turn, so it covers the Turn's closing reply, not reasoning text, tool output, or a reply that is still streaming.
- Only the newest loaded Turn opens automatically; scroll to an older reply and open its bar yourself.
- The message text is not rewritten: math that the model kept in backticks still reads as source inside the message. Use the bar for those formulas.
- KaTeX-supported commands only; a LaTeX-only construct (`\begin{align}`, `\label`, `\usepackage`, …) renders as a KaTeX error marker in the bar.
- At most 40 formulas per Turn, 1200 characters each; when a reply holds more, the panel says how many it found. A long panel scrolls within 62% of the viewport height.
- The bar needs the DSH Web GUI. The prompt section belongs to the profile's system prompt, so it also shapes terminal and SDK sessions, where DSH prints the reply text as is.

## Internals

- Client bundle `client.js` inlines KaTeX 0.18.7 (MIT). The shell ships the matching KaTeX stylesheet and fonts, so the plugin loads no stylesheet and makes no network request.
- Styles use only `--dsw-alias-*` theme tokens; copy and labels go through the `mathReader` locale namespace (`zh`, `en`).
- The Client half injects into `conversation.chat.turnTail`; the Host half contributes one `systemPrompt` section and exports `inject = ['systemPrompt']`.
- `src/client.template.js` plus `vendor/katex.min.js` build `client.js` through `build.mjs`; `test/smoke.mjs` exercises the built bundle outside a browser.

## Files

| File | Role |
|---|---|
| `index.js` | Host half: the math-notation prompt section. |
| `client.js` | Client half: Turn-tail formula bar with inlined KaTeX. |
| `cordis.patch.yml` | Inserts the `math-reader` plugin row. |
| `locale/en.json`, `locale/zh.json` | Plugin title and description. |
| `icon.svg` | Plugin icon. |
| `build.mjs`, `src/client.template.js`, `vendor/` | Build inputs for `client.js`. |
| `test/smoke.mjs` | Outside-browser smoke test for the built bundle. |
