/**
 * Host half of the paper-answer bundle.
 *
 * This plugin fixes the SHAPE of an answer about a paper, never its content:
 * the first sentence answers the question asked, the length is a budget the
 * user pulls on, every claim is graded as quotation / common knowledge /
 * inference, and each new symbol is explained where it appears.
 *
 * Two contributions and nothing else: one short system-prompt contract that
 * applies without a skill load, and one skill carrying the full protocol
 * (diagnosing the confusion layer, layered explanation, the switch table for
 * "too abstract / too deep / too broad / off the question", and the optional
 * taste file). No tool, no model request, no session event.
 */

/** Prompt section owned by this plugin; unique across prompt layers. */
const SECTION_NAME = 'paper-answer:contract'

/** Placement after the tool-guidance blocks (<=3100) and before the tools SDK (5000). */
const SECTION_ORDER = 4500

/** Tunables. The row's `config` overrides them; `resolveConfig` validates. */
const DEFAULTS = Object.freeze({
  pullMode: true,
  maxSentences: 4,
  stylePath: '.dsh/paper-answer/style.md',
})

/** Keys this plugin accepts, so a typo fails loudly instead of being ignored. */
const CONFIG_KEYS = new Set(['pullMode', 'maxSentences', 'stylePath'])

/**
 * The protocol body. Registered as a runtime skill (model- and user-invocable),
 * so it is loaded on demand instead of occupying the system prompt.
 */
const SKILL_BODY = `# 讲论文

四条硬约束。先满足它们，再谈内容讲得好不好。

1. **第一句就是答案**。直接回答被问的那件事，不要用"这篇论文提出了…""首先需要了解背景"开头。答案里要出现用户问题里的关键词——同一个术语、同一个符号、同一个位置。
2. **先结论后展开**。一句可判真假的结论（≤40 字）→ 最多 4 句展开 → 一个 ≤3 项的展开菜单（"要展开：①推导 ②数值例子 ③为什么这么设计"）。深度由用户拉，不由你推。用户说"直接讲完"时取消菜单，但仍不超过 8 句。
3. **断言分三级**。原文直引（不改写）／领域常识（直接陈述）／我的推断（写明"这是我的推断"）。限定词——可能、通常、一般来说、取决于——只允许出现在第三级；前两级含糊其辞等于没说。每条回答至少给一个可判真假的断言。
4. **记号先解释**。每个新记号在同一段给出"读法 + 含义"；一次最多引入 2 个，要用的更多就先讲这 2 个，其余进展开菜单。

## 卡在哪一层

问之前先定位困惑属于哪一层，一次只锁定一层：

符号（这个记号指什么、取值范围是多少）｜前提（这一步依赖了哪个假设）｜推导（两式之间用了什么恒等式或不等式）｜意图（作者为什么要这一步）｜直觉（为什么这样设计会 work）

锁不定就问**一个**二选一问题："你是不知道这个符号指什么，还是不知道这一步为什么成立？"不要连环追问。用户贴了原文片段，就先用自己的话把这段复述一遍，再答。

## 分层讲解（顺序不许颠倒）

1. **直觉**：一句大白话 + 一个类比，并说明类比在哪里失效。
2. **形式**：符号定义、假设、这一步的式子。
3. **算例**：最小可算的例子，数字具体、维度小。
4. **边界**：反例 / 极端情形 / 去掉某个假设会怎样。

每层末尾给一句 5 秒自检，格式"你可以验一下：……"。用户只要直觉时只讲 1 和 4。

## 宽问题的正确处理

"讲讲这篇的 X"要的是一个入口，不是综述。先说出你把它收窄成了哪个具体问题（"我按'为什么要除以 √dk'来理解"），说明跳过了什么，再回答。用户不同意时一句话改方向，不用重听一遍综述。

## 收到差评就换挡

| 用户说 | 动作 |
|---|---|
| 太抽象 / 太虚 / 还是不懂 | 降一层具体度：换成具体数字或最小例子 |
| 太深 / 太快 | 删推导，只留直觉 + 一个可检验的结论 |
| 太浅 / 太干 / 没感觉 | 加一个带失效边界的类比，或引论文原话 |
| 太长 | 压到 3 句，只留一个点 |
| 太保守 / 等于没说 | 去掉限定词，给一个可判真假的断言 + 一个预测 |
| 没回答我的问题 | 重读用户原话，用他的词把问题复述一遍，只答那一句 |

同一处第二次被说"不懂"时，必须换一种表征（见讲法库）并说明为什么换——沿用上一次的讲法等于没换。

## 讲法库（换表征时选一个之前没用过的）

算例｜极端情形｜反例｜量纲与守恒｜图与轨迹｜最小可跑版本｜类比 + 失效边界

## 写作

- 中文为主；术语首次出现给中英并列：\`自注意力（self-attention）\`
- 公式用 \`$...$\`；引用原文用 \`>\` 逐字引，不改写；有页码或节号就写在句末
- 不确定就说不确定，并给出验证方法（"查第 4 页式 (1)"）
- 不写"非常重要""显著提升"这类没有指称对象的空话

## 口味档案（可选）

用户给出**长期**偏好时（"以后都先给结论""我不看推导""多给数字"），覆盖写 \`${DEFAULTS.stylePath}\`，一行一条，只记"对谁讲、怎么讲"。回答前如果这个文件存在，先读它。
当轮反馈不要写进档案——直接按上面的换挡表处理，那一轮就改。

## 不适用

用户要翻译 / 摘要 / 找引用 → 直接做；只要一个概念的定义 → 直接答，不必套用上面的分层。`

/**
 * Build the always-on contract text for one resolved configuration.
 * @param config - resolved configuration.
 * @returns the prompt section body.
 */
function sectionText(config) {
  const budget = config.pullMode
    ? `一句可判真假的结论（≤40 字）→ 最多 ${config.maxSentences} 句展开 → 一个 ≤3 项的展开菜单，深度由用户拉。`
    : '一句可判真假的结论（≤40 字）→ 最多 8 句一次讲完，不留展开菜单。'
  return [
    '## 论文问答约定',
    '',
    '问论文、教科书或技术文档里的某句话、某个式子、某个符号，或说"看不懂／没看懂／什么意思／怎么来的"时，按四条作答：',
    '',
    '- **第一句就是答案**：直接回答被问的那件事，不用背景铺垫、"这是个好问题"开头；答案里要出现用户问题中的关键词。',
    `- **先结论后展开**：${budget}`,
    '- **断言分三级**：原文直引 / 领域常识直说 / 推断写明"这是我的推断"。限定词（可能、通常、一般来说、取决于）只准出现在第三级。',
    '- **记号先解释**：每个新记号在同一段给出读法与含义，一次最多引入 2 个。',
    '',
    '完整协议见 paper-answer 技能，或直接 `/paper-answer`。',
  ].join('\n')
}

/**
 * Validate a row config and fill the defaults. No Config export means the
 * loader passes the raw object, so this is the only validator.
 * @param raw - the row's `config`, possibly absent.
 * @returns the complete configuration.
 * @throws when the config carries an unknown field or a value of the wrong shape.
 */
function resolveConfig(raw) {
  if (raw === undefined || raw === null) return { ...DEFAULTS }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('paper-answer: config must be an object')
  }
  for (const key of Object.keys(raw)) {
    if (!CONFIG_KEYS.has(key)) throw new Error(`paper-answer: unknown config field "${key}"`)
  }
  const resolved = { ...DEFAULTS }
  if (raw.pullMode !== undefined) {
    if (typeof raw.pullMode !== 'boolean') throw new Error('paper-answer: pullMode must be a boolean')
    resolved.pullMode = raw.pullMode
  }
  if (raw.maxSentences !== undefined) {
    const value = raw.maxSentences
    if (!Number.isInteger(value) || value < 1 || value > 8) {
      throw new Error('paper-answer: maxSentences must be an integer from 1 through 8')
    }
    resolved.maxSentences = value
  }
  if (raw.stylePath !== undefined) {
    if (typeof raw.stylePath !== 'string' || raw.stylePath.length === 0 || raw.stylePath.includes('\0')) {
      throw new Error('paper-answer: stylePath must be a non-empty path string')
    }
    resolved.stylePath = raw.stylePath
  }
  return resolved
}

/**
 * Register the answer contract and its protocol skill for the lifetime of the row.
 * @param ctx - Host plugin context; `systemPrompt` and `skills` are hard dependencies.
 * @param config - the row's config, validated here because no schema is exported.
 */
export function apply(ctx, config) {
  const resolved = resolveConfig(config)

  const contract = sectionText(resolved)
  ctx.effect(
    () => ctx.systemPrompt.section({ name: SECTION_NAME, order: SECTION_ORDER, text: contract }),
    'paper-answer: answer contract',
  )

  ctx.effect(
    () => ctx.skills.register({
      name: 'paper-answer',
      // `source` is required by SkillDefinition and is NOT defaulted by
      // register(); omitting it registers fine and then fails on first load
      // with a TypeError, so the smoke test asserts it.
      source: 'runtime',
      description: 'Use when the user is reading a paper, textbook, or technical document and asks what a passage, formula, symbol, or method means, or says they do not understand a part. Fixes the shape of the answer: a direct first sentence, a length budget, graded claims, and explained symbols.',
      whenToUse: 'Also load it when an answer about a paper came back too defensive, too detailed, too broad, or off the question — the skill carries the switch table and the layered explanation order.',
      content: SKILL_BODY,
      invocation: { modelInvocable: true, userInvocable: true },
    }),
    'paper-answer: protocol skill',
  )
}

/** Services this Host half needs; the row stays inactive without them. */
export const inject = ['systemPrompt', 'skills']

/** Exported for the smoke test; not read by the loader. */
export const internals = { SECTION_NAME, SECTION_ORDER, SKILL_BODY, DEFAULTS, resolveConfig, sectionText }
