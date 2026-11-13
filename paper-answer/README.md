# Paper answers

Fixes the shape of an answer about a paper — a direct first sentence, a length budget the user pulls on, graded claims, and symbols explained where they appear — instead of leaving it to the model's instinct to cover every angle.

## What it does

- **One prompt contract, always on.** A 347-character (roughly 230-token) system-prompt section scoped to "when the user asks about a paper or technical text": the first sentence answers the question asked, one falsifiable conclusion of at most 40 characters, at most 4 expanding sentences, and a menu of at most 3 items.
- **One skill, loaded on demand.** `paper-answer` carries the full protocol: the five confusion layers, the layered explanation order (intuition → form → worked example → boundary), the narrow-a-broad-question rule, and the switch table for "too abstract / too deep / too broad / off the question". Also reachable as `/paper-answer`.
- **One optional taste file.** A lasting preference ("always conclude first", "skip derivations") is written to `.dsh/paper-answer/style.md` and read before answering; a reaction in the moment changes the next answer instead.
- **No tool, no model request, no session event.** Prompt and skill text only.

## Files

| File | Role |
|---|---|
| `index.js` | Host half: the contract section, the protocol skill, and config validation. |
| `cordis.patch.yml` | Inserts the `paper-answer` row with its documented config. |
| `locale/en.json`, `locale/zh.json` | Plugin title, description, and the detail-document path. |
| `docs/DETAIL.md` | The plugin's detail page. |
| `icon.svg` | Plugin icon. |
| `test/smoke.mjs` | Outside-the-Harness check of both registrations and the config validator. |

## Limitations

- Prompt-level constraint, not enforcement: the model can still ignore it. Judge it by behavior on a wide question and on a "too abstract" follow-up.
- It supplies no paper text. Off-question answers caused by missing context are the job of a reader plugin's locate/anchor capability, not this one.
- The section is profile-wide; its wording limits it to paper questions, but it is visible to every session and costs roughly 230 tokens.
- The taste file is overwrite-only: it records current state, not history.

## Override the protocol

Put `.dsh/skills/paper-answer/SKILL.md` (with YAML frontmatter) in a workspace. Project skills outrank a plugin's runtime-registered skill of the same name, so no repack is needed.
