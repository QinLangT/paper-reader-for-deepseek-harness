/**
 * Headless smoke test for the built Client bundle.
 *
 * Loads `client.js` with a stub module loader, React, and DOM, then exercises the
 * dock component against real drafts. Run with the DSH runtime:
 *   $env:ELECTRON_RUN_AS_NODE = '1'; & "<DSH_NODE_EXECUTABLE>" test/smoke.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.dirname(here)
const failures = []
const notes = []

/** Fail one check. */
function check(label, condition, detail) {
  if (condition) {
    notes.push(`ok   ${label}`)
    return
  }
  failures.push(`${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

/* --- stub browser globals the bundle touches ------------------------------- */
let captured
const storage = new Map()
globalThis.window = {
  __ModuleLoader__: {
    load(spec) {
      captured = spec
    },
  },
  localStorage: {
    getItem: key => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
  },
  setTimeout,
  clearTimeout,
}
// Node 24 exposes a read-only `navigator`; the bundle only reads `clipboard`.
Object.defineProperty(globalThis, 'navigator', {
  value: { clipboard: undefined },
  configurable: true,
  writable: true,
})
globalThis.document = {
  compatMode: 'CSS1Compat',
  createElement: () => ({ style: {}, select() {}, setAttribute() {} }),
  body: { appendChild() {}, removeChild() {} },
  execCommand: () => true,
}

/* --- stub React ------------------------------------------------------------ */
function createElement(type, props, ...children) {
  const flat = []
  const push = (value) => {
    if (value === null || value === undefined || value === false) return
    if (Array.isArray(value)) value.forEach(push)
    else flat.push(value)
  }
  children.forEach(push)
  return { type, props: props ?? {}, children: flat }
}

const React = {
  createElement,
  Fragment: 'Fragment',
  useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useLayoutEffect: () => {},
  useMemo: fn => fn(),
  useRef: value => ({ current: value === undefined ? null : value }),
}

/** Load the built bundle and return its plugin definition. */
function loadPlugin() {
  const source = fs.readFileSync(path.join(root, 'client.js'), 'utf8')
  vm.runInThisContext(source, { filename: 'client.js' })
  return captured.factory(name => (name === 'react' ? React : (() => { throw new Error(`unexpected request ${name}`) })()))
}

const registrations = []
const slots = {
  inject: (key, callback) => callback(),
  register: (options, component) => {
    registrations.push({ options, component })
    return () => {}
  },
}
const locale = { register: () => () => {} }
const ctx = {
  get: name => (name === 'slots' ? slots : (name === 'locale' ? locale : undefined)),
  effect: fn => fn(),
}

const plugin = loadPlugin()
check('module id is the package name', captured.id === '@local/md-live-preview', captured.id)
check('plugin exports inject and apply', Array.isArray(plugin.inject) && typeof plugin.apply === 'function')
plugin.apply(ctx)

const dock = registrations.find(item => item.options.name === 'conversation.input.dock')
const toggle = registrations.find(item => item.options.name === 'conversation.input.right')
check('dock entry registered', dock !== undefined)
check('toggle entry registered', toggle !== undefined)
check('dock locale namespace declared', dock?.options.locale === 'mdLivePreview')
check('toggle renders a button', toggle?.component({ t: key => key }).children.some(child => child?.type === 'button'))

const preview = draft => dock.component({ useInput: selector => selector({ draft }), t: key => key })

/**
 * Render one element; a function component is expanded by calling it, which the
 * stub hooks above tolerate (no state, no effects).
 * @param node - element or primitive.
 * @returns the rendered tree.
 */
function expand(node) {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return node
  return typeof node.type === 'function' ? expand(node.type(node.props)) : node
}

/** Walk a rendered tree, expanding function components. */
function walk(tree, visit) {
  const node = expand(tree)
  if (node === null || node === undefined || node === false) return
  if (Array.isArray(node)) {
    node.forEach(child => walk(child, visit))
    return
  }
  if (typeof node !== 'object') return
  visit(node)
  node.children.forEach(child => walk(child, visit))
}

/** Collect the KaTeX fragments in a tree. */
function katexOf(tree) {
  const found = []
  walk(tree, (node) => {
    const html = node.props?.dangerouslySetInnerHTML?.__html
    if (typeof html === 'string' && html.includes('katex')) found.push(node)
  })
  return found
}

/** Flatten the text of a rendered tree. */
function textOf(tree) {
  let text = ''
  walk(tree, (node) => {})
  const read = (value) => {
    const node = expand(value)
    if (node === null || node === undefined || node === false) return
    if (Array.isArray(node)) return node.forEach(read)
    if (typeof node === 'string') {
      text += node
      return
    }
    if (typeof node === 'object') node.children.forEach(read)
  }
  read(tree)
  return text
}

/* --- inline math ----------------------------------------------------------- */
const inline = preview('参数 $\\epsilon$ 与 $\\alpha_1$ 都渲染。')
check('inline math typeset', katexOf(inline).length === 2, String(katexOf(inline).length))
check('inline math keeps LaTeX in KaTeX output', katexOf(inline)[0]?.props.dangerouslySetInnerHTML.__html.includes('katex'))

/* --- currency is prose ----------------------------------------------------- */
const money = preview('It costs $5 and $10 today.')
check('currency stays literal', katexOf(money).length === 0, String(katexOf(money).length))
check('currency text preserved', textOf(money).includes('$5 and $10'), textOf(money))

/* --- display math ---------------------------------------------------------- */
const display = preview('公式：\n\n$$\n\\frac{a}{b} = c\n$$\n\n结束。')
check('display math typeset', katexOf(display).length === 1, String(katexOf(display).length))
check('display math uses katex-display', katexOf(display)[0]?.props.dangerouslySetInnerHTML.__html.includes('katex-display'))

const fence = preview('```math\n\\sum_{i=1}^{n} i\n```')
check('math fence typeset', katexOf(fence).length === 1, String(katexOf(fence).length))

const sameLine = preview('$$E = mc^2$$')
check('single-line display math typeset', katexOf(sameLine).length === 1)

/* --- unclosed math does not swallow the rest ------------------------------- */
const unclosed = preview('$$\n\\epsilon')
check('unclosed $$ stays literal', katexOf(unclosed).length === 0, String(katexOf(unclosed).length))
check('unclosed $$ keeps text', textOf(unclosed).includes('\\epsilon'), textOf(unclosed))

/* --- code spans win over math --------------------------------------------- */
const code = preview('use `$x$` literally')
check('code span is not math', katexOf(code).length === 0, String(katexOf(code).length))

/* --- ordinary Markdown still renders --------------------------------------- */
const markdown = preview('# 标题\n\n**粗体** 与 `code`\n\n- 一\n- [x] 二\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n```js\nconst a = 1\n```\n\n> 引用\n\n---\n\n[标签](https://example.com)')
const kinds = []
walk(markdown, (node) => { if (typeof node.type === 'string') kinds.push(node.type) })
for (const tag of ['h1', 'p', 'strong', 'ul', 'li', 'table', 'thead', 'tbody', 'blockquote', 'hr', 'span']) {
  check(`markdown renders <${tag}>`, kinds.includes(tag), kinds.join(','))
}
check('task checkbox rendered', kinds.includes('input'))
check('code fence rendered', kinds.includes('pre'))
check('link target kept as tooltip', textOf(markdown).includes('标签'))

/* --- empty drafts ---------------------------------------------------------- */
for (const draft of ['', '   ', '#', '##', '\n\n']) {
  check(`empty draft ${JSON.stringify(draft)} renders nothing`, preview(draft) === null)
}

/* --- hostile / malformed input does not throw ------------------------------ */
const corpus = [
  '$', '$$', '\\$5', '**unclosed', '`unclosed', '- ', '| a |', '> ', '***x***',
  'snake_case_word', '<https://auto.example.com>', '![alt](pic.png)', 'a  \nb',
  '####### seven', 'text\n---', 'text\n===', '$$$$', '$ $', '$x', 'x$',
  '$\\frac{1}{', '$\\def\\x{1}$', '```math\nunclosed fence', '$$a$$b$$c$$',
]
let thrown
for (const draft of corpus) {
  try {
    preview(draft)
  } catch (error) {
    thrown = `${JSON.stringify(draft)}: ${error.message}`
    break
  }
}
check('malformed drafts do not throw', thrown === undefined, thrown)

/* --- report ---------------------------------------------------------------- */
if (failures.length === 0) {
  console.log(`smoke: ${notes.length} checks passed`)
} else {
  console.log(`smoke: ${failures.length} FAILED of ${notes.length + failures.length}`)
  for (const failure of failures) console.log(`  FAIL ${failure}`)
  process.exitCode = 1
}
