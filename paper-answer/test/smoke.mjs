/**
 * Outside-the-Harness smoke test: both registrations happen, the contract text
 * says the four things it must say, and the config validator fails loudly.
 *
 * Run: ELECTRON_RUN_AS_NODE=1 "<electron>" test/smoke.mjs
 */
import assert from 'node:assert/strict'
import { apply, inject, internals } from '../index.js'

/** Minimal Cordis stand-in: `effect` runs the registration and keeps its disposer. */
function fakeContext() {
  const captured = { sections: [], skills: [], disposers: [] }
  return {
    captured,
    effect(register, label) {
      const dispose = register()
      captured.disposers.push({ label, dispose })
      return dispose
    },
    systemPrompt: {
      section(section) {
        captured.sections.push(section)
        return () => {}
      },
    },
    skills: {
      register(skill) {
        captured.skills.push(skill)
        return () => {}
      },
    },
  }
}

// --- both services are declared, so the row stays inactive rather than throwing
assert.deepEqual([...inject].sort(), ['skills', 'systemPrompt'])

// --- registrations
const ctx = fakeContext()
apply(ctx, undefined)
assert.equal(ctx.captured.sections.length, 1, 'registers exactly one prompt section')
assert.equal(ctx.captured.skills.length, 1, 'registers exactly one skill')

const [section] = ctx.captured.sections
assert.equal(section.name, internals.SECTION_NAME)
assert.equal(section.order, internals.SECTION_ORDER)
assert.ok(typeof section.text === 'string' && section.text.length > 200, 'contract text is present')

// The four constraints the plugin exists for must survive edits to the wording.
for (const phrase of ['第一句就是答案', '可判真假的结论', '限定词', '记号', '≤3 项']) {
  assert.ok(section.text.includes(phrase), `contract mentions ${phrase}`)
}

const [skill] = ctx.captured.skills
assert.equal(skill.name, 'paper-answer')
// register() defaults invocation and provider but NOT source; a missing source
// passes registration and throws on the first load, so pin it here.
assert.equal(typeof skill.source, 'string')
assert.ok(skill.source.length > 0, 'source is set, otherwise the first load throws')
assert.equal(skill.invocation.modelInvocable, true, 'model may load it')
assert.equal(skill.invocation.userInvocable, true, '/paper-answer works')
assert.ok(skill.description.length < 500, 'catalog description stays short')
assert.ok(skill.content.includes('收到差评就换挡'), 'protocol carries the switch table')
for (const phrase of ['太抽象', '太深', '太长', '太保守', '没回答我的问题']) {
  assert.ok(skill.content.includes(phrase), `switch table covers ${phrase}`)
}
assert.ok(!skill.content.includes('${'), 'no unexpanded template placeholder in the skill body')
assert.ok(!skill.content.includes('undefined'), 'no missing interpolation in the skill body')
assert.ok(skill.content.includes(internals.DEFAULTS.stylePath), 'taste path is interpolated')

// --- config: defaults, overrides, and loud rejection
assert.deepEqual(internals.resolveConfig(undefined), { ...internals.DEFAULTS })
assert.equal(internals.resolveConfig({ pullMode: false }).pullMode, false)
const noMenu = internals.sectionText(internals.resolveConfig({ pullMode: false }))
assert.ok(noMenu.includes('一次讲完'), 'pullMode=false changes the contract text')
assert.ok(!noMenu.includes('展开菜单，深度由用户拉'), 'pullMode=false drops the menu')

for (const bad of [
  { pullMode: 'yes' },
  { maxSentences: 0 },
  { maxSentences: 9 },
  { maxSentences: 2.5 },
  { stylePath: '' },
  { maxSentence: 4 },
]) {
  assert.throws(() => internals.resolveConfig(bad), undefined, `rejects ${JSON.stringify(bad)}`)
}

// --- teardown: every registration can be disposed
for (const { label, dispose } of ctx.captured.disposers) {
  assert.equal(typeof dispose, 'function', `${label} is disposable`)
  dispose()
}

console.log('paper-answer smoke: ok — 1 section, 1 skill, config validated, teardown clean')
