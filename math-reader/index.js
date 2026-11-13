/**
 * Host half of the math reader bundle.
 *
 * The browser half renders the formulas of a finished reply with KaTeX. This
 * half removes the usual cause of unrendered math: the model writes TeX inside
 * backticks, which the Chat view shows as source. One system-prompt section
 * asks for dollar delimiters, which the shipped renderer already typesets.
 */

/** Prompt section name owned by this plugin; unique across prompt layers. */
const SECTION_NAME = 'math-reader-notation'

/** Placement after deliverable references and before structured output. */
const SECTION_ORDER = 9100

/** Notation rules the Chat Markdown renderer and the browser half can typeset. */
const SECTION_TEXT = `## Math notation

Mathematical answers are read in a Markdown view that typesets TeX in dollar delimiters and in \`math\`-tagged code fences; it does not typeset TeX inside backticks or ordinary code fences.

- Write inline math between single dollar signs on one line, for example $2^{-\\kappa}/(\\delta(\\lambda)\\cdot\\rho(\\lambda))\\cdot\\lambda^{-O(1)}$.
- Put a standalone formula between double dollar signs on its own lines.
- Never put TeX in backticks or in a code fence other than one tagged \`math\`; backticks are for code, paths, and identifiers, and TeX there stays monospaced source.
- Keep the surrounding prose, including Chinese text and punctuation, outside the delimiters.
- Use KaTeX-supported commands such as \\frac, \\sum, \\prod, \\sqrt, \\mathcal, \\mathbb, \\operatorname, and \\begin{aligned}...\\end{aligned}. Avoid LaTeX-only constructs such as \\begin{align}, \\label, \\ref, \\newcommand, and \\usepackage.`

/**
 * Register the notation section for the lifetime of the plugin row.
 * @param ctx - Host plugin context; `systemPrompt` is a hard dependency.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.systemPrompt.section({
    name: SECTION_NAME,
    order: SECTION_ORDER,
    text: SECTION_TEXT,
  }), 'math-reader: notation section')
}

/** Services this Host half needs; the row stays inactive without them. */
export const inject = ['systemPrompt']
