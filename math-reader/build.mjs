/**
 * Build `client.js` by inlining the vendored KaTeX runtime into the client template.
 *
 * Run with the DSH runtime (the packaged Electron binary in Node mode):
 *   ELECTRON_RUN_AS_NODE=1 "<DSH_NODE_EXECUTABLE>" build.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const templatePath = path.join(here, 'src/client.template.js')
const katexPath = path.join(here, 'vendor/katex.min.js')
const katexManifestPath = path.join(here, 'vendor/package.json')
const outputPath = path.join(here, 'client.js')

const manifest = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8'))
const template = fs.readFileSync(templatePath, 'utf8')
const katex = fs.readFileSync(katexPath, 'utf8')
const katexVersion = JSON.parse(fs.readFileSync(katexManifestPath, 'utf8')).version

const marker = '    /*__KATEX__*/'
if (template.split(marker).length !== 2) throw new Error(`template must contain exactly one "${marker.trim()}" marker`)
// The module id must equal the package name: the Client module graph keys bundles by it.
const nameMarker = '__DSH_PACKAGE_NAME__'
if (!template.includes(nameMarker)) throw new Error(`template must contain the ${nameMarker} marker`)

const inline = [
  `    /*! KaTeX v${katexVersion} | MIT License | https://katex.org */`,
  '    /* This UMD build takes its CommonJS branch because the enclosing function declares module and exports. */',
  indent(katex, 4),
].join('\n')

const output = template.replace(marker, inline).split(nameMarker).join(manifest.name)
fs.writeFileSync(outputPath, output)
console.log(`client.js written for ${manifest.name} (${(fs.statSync(outputPath).size / 1024).toFixed(0)} KiB, KaTeX ${katexVersion} inlined)`)

/**
 * Indent every non-empty line of a block.
 * @param text - the source block.
 * @param spaces - indentation width.
 * @returns the indented block.
 */
function indent(text, spaces) {
  const padding = ' '.repeat(spaces)
  return text.split('\n').map(line => (line === '' ? line : padding + line)).join('\n')
}
