// Generate build/icon.ico from app-icon.png (multi-resolution Windows icon).
// Run automatically before packaging via the prebuild step.
const fs = require('fs')
const path = require('path')
const pngToIco = require('png-to-ico')

const root = __dirname
const src = path.join(root, '..', 'app-icon.png')
const outDir = path.join(root, '..', 'build')
const outIco = path.join(outDir, 'icon.ico')

if (!fs.existsSync(src)) {
  console.error(`[icons] source not found: ${src}`)
  process.exit(1)
}
fs.mkdirSync(outDir, { recursive: true })

pngToIco(src)
  .then((buf) => {
    fs.writeFileSync(outIco, buf)
    fs.copyFileSync(src, path.join(outDir, 'icon.png'))
    console.log(`[icons] wrote ${outIco} (${(buf.length / 1024).toFixed(1)} KB)`)
  })
  .catch((err) => {
    console.error('[icons] failed:', err)
    process.exit(1)
  })
