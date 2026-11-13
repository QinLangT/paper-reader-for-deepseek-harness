/**
 * Smoke test for the built client bundle, run outside a browser:
 * initializes the inlined KaTeX, captures the module registration, applies the
 * plugin against a fake Client context, and renders the Turn-tail component for
 * a sample reply copied from the reported conversation.
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.join(here, '../client.js'), 'utf8')

const loads = []
const sandbox = {
  window: { __ModuleLoader__: { load: (entry) => { loads.push(entry) } } },
  document: {
    createElement: () => ({ dataset: {}, style: {}, textContent: '', remove() {} }),
    head: { append() {} },
    compatMode: 'CSS1Compat',
  },
  navigator: { clipboard: { writeText: async () => {} } },
  console,
  setTimeout,
  clearTimeout,
}
vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: 'client.js' })

const assert = (condition, message) => {
  if (!condition) throw new Error(`assertion failed: ${message}`)
  console.log(`  ok  ${message}`)
}

console.log('bundle registration')
assert(loads.length === 1, 'registers exactly one module')
assert(loads[0].id === '@local/dsh-math-reader', 'module id is the package name')

const React = {
  createElement: (type, props, ...children) => ({ type, props, children: children.flat(Infinity).filter(child => child !== null) }),
  useMemo: factory => factory(),
  useState: initial => [initial, () => {}],
  useEffect: () => {},
  useRef: value => ({ current: value }),
}
const plugin = loads[0].factory(() => React)

console.log('plugin shape')
assert(typeof plugin.apply === 'function', 'exports apply()')
assert(JSON.stringify(plugin.inject) === JSON.stringify(['slots', 'locale']), 'injects slots and locale')

const captured = { locale: [], slots: [], injected: [] }
const ctx = {
  effect: (callback) => { callback(); return () => {} },
  locale: { register: (ns, dicts) => { captured.locale.push({ ns, dicts }); return () => {} } },
  slots: {
    inject: (key, callback) => { captured.injected.push(key); callback(); return () => {} },
    register: (options, component) => { captured.slots.push({ options, component }); return () => {} },
  },
}
plugin.apply(ctx)

console.log('registrations')
assert(captured.locale.length === 1, 'registers one locale namespace')
assert(captured.locale[0].ns === 'mathReader', 'namespace is mathReader')
assert(captured.locale[0].dicts.zh !== undefined && captured.locale[0].dicts.en !== undefined, 'registers zh and en')
assert(captured.injected[0] === 'conversation.chat.turnTail', 'injects into the Turn-tail slot')
assert(captured.slots[0].options.id === 'math-reader', 'entry id is math-reader')
assert(captured.slots[0].options.locale === 'mathReader', 'entry binds the locale namespace')

const dict = captured.locale[0].dicts.zh
const t = (key, params) => (dict[key] ?? key).replace(/\{(\w+)\}/gu, (_, name) => String(params?.[name] ?? ''))

const sample = [
  '约的目标是指数级的密钥恢复，本质上不是标准 game-based 假设。',
  '',
  '- 代价：CRS 是 Õ(n) 而非 polylog（要 polylog 需 subexp 时间对手的近最优安全性，脚注 32）；只对 log-space uniform NC；',
  '',
  'Thm 3.11 里那条界，PDF 上排成了 `2^{−κ}/(δ(λ)·ρ(λ))·λ^{−O(1)}`（分子分母分三层）。但按证明最后一行的推导——KDM 优势 ≥ ε/(ρ·2^κ·poly)——正确的界应当是 `2^κ·δ·ρ·λ^{−O(1)}`；否则再用 Assumption 1 的 δ = 2^{−κ}·poly 代入，界会大于 1，定理就空洞了。',
  '',
  'Also $\\Pr[\\mathcal{A}^{\\mathcal{O}}(1^{\\lambda})=1] \\le \\mathsf{negl}(\\lambda)$ and',
  '',
  '$$\\mathrm{Adv}^{\\mathsf{KDM}}_{\\mathcal{A}}(\\lambda) = \\bigl|\\Pr[\\mathcal{A}(\\kappa)=1]-\\Pr[\\mathcal{A}(\\kappa)=1]\\bigr|$$',
  '',
  'A code span `my_var_name` and a path `src/index.ts` stay code.',
].join('\n')

const useChat = selector => selector({ timeline: { turnOrder: [1], turns: new Map() } })
const turn = {
  turn: 1,
  data: { get: key => (key === 'turn-tail' ? { closing: { blocks: [{ kind: 'text', text: sample }] } } : undefined) },
  steps: [],
}
const tree = captured.slots[0].component({ turn, t, useChat })
assert(tree !== null, 'renders a bar for a reply that contains math')

const render = node => {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(render).join('')
  // Function components: call them with their props, as React would.
  if (typeof node.type === 'function') return render(node.type({ ...node.props, children: node.children }))
  const props = node.props ?? {}
  const attributes = [
    typeof props.className === 'string' ? `class="${props.className}" ` : '',
    typeof props['aria-label'] === 'string' ? `aria-label="${props['aria-label']}" ` : '',
    props.tabIndex === 0 ? 'tabindex="0" ' : '',
  ].join('')
  const html = typeof props.dangerouslySetInnerHTML?.__html === 'string' ? `[[${props.dangerouslySetInnerHTML.__html}]]` : ''
  return attributes + render(node.children) + html
}
const text = render(tree)
assert(text.includes('公式 4'), 'bar counts the four formulas (two backticked, one inline TeX, one display TeX)')
assert((text.match(/class="katex"/gu) ?? []).length >= 4, 'inlines KaTeX output for every formula')
assert(!text.includes('katex-error'), 'every extracted formula parses, including the unicode-minus TeX from the report')
assert(!text.includes('my_var_name') && !text.includes('src/index.ts'), 'identifier and path code spans are not formulas')

const collapsed = captured.slots[0].component({ turn: { turn: 1, data: { get: () => ({ closing: { blocks: [{ kind: 'text', text: 'Plain prose with $a+b$ only.' }] } }) } }, t, useChat })
assert(collapsed !== null && render(collapsed).includes('公式 1'), 'renders for a reply with only inline TeX')

const older = captured.slots[0].component({ turn: { ...turn, turn: 7 }, t, useChat })
assert(older !== null && !render(older).includes('dsh-math-reader__panel'), 'an older Turn stays collapsed even with code-span math')
const notNewest = captured.slots[0].component({ turn, t, useChat: selector => selector({ timeline: { turnOrder: [1, 2], turns: new Map() } }) })
assert(notNewest !== null && !render(notNewest).includes('dsh-math-reader__panel'), 'a Turn that is no longer newest starts collapsed')

const shelf = text => captured.slots[0].component({
  turn: { turn: 1, data: { get: () => ({ closing: { blocks: [{ kind: 'text', text }] } }) } },
  t,
  useChat,
})
const empty = shelf('No math here at all.')
assert(empty === null, 'renders nothing without math')
assert(shelf('It costs $5 and $10 in total.') === null, 'currency amounts are not formulas')
assert(shelf('Use \\$5 and \\$10 literally.') === null, 'escaped dollars are not formulas')
assert(render(shelf('A subscript `λ_1` and an identifier `my_var_name`.')).includes('公式 1'), 'digit subscripts count while identifier underscores do not')
assert(render(shelf('A subscript `λ_1` and an identifier `my_var_name`.')).includes('my_var_name') === false, 'identifier stays out of the panel')

const many = Array.from({ length: 45 }, (_, i) => `Formula \`x_{${i}}\` here.`).join('\n\n')
assert(render(shelf(many)).includes('共 45 个公式'), 'reports the true total when the list is capped')
assert((render(shelf(many)).match(/dsh-math-reader__card/gu) ?? []).length === 40, 'lists at most 40 formulas')

const contextText = 'Thm 3.11 的界写成了 `2^{-\\kappa}` 这里。'
assert(render(shelf(contextText)).includes('Thm 3.11 的界写成了'), 'shows the prose excerpt beside the formula')
assert(render(shelf(contextText)).includes('原文写在代码里'), 'marks a formula that the reply kept in code')
assert(render(shelf(contextText)).includes('aria-label="复制第 1 个公式的 LaTeX"'), 'gives the copy action an ordinal label')
console.log('all smoke assertions passed')
