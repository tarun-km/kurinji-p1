// Contact sheet: node scripts/sheet.mjs <dir> <out.jpg> [cols=4] [tileW=400] [frames=f001,f003,…]
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
const [dir, out, colsArg, wArg, pick] = process.argv.slice(2)
const cols = +(colsArg || 4), tw = +(wArg || 400), th = Math.round(tw * 9 / 16)
let files = fs.readdirSync(dir).filter(f => /\.(jpg|png)$/.test(f)).sort()
if (pick) files = pick.split(',').map(p => files.find(f => f.startsWith(p))).filter(Boolean)
const rows = Math.ceil(files.length / cols)
const tiles = await Promise.all(files.map(async (f, i) => ({
  input: await sharp(path.join(dir, f)).resize(tw, th).composite([{ input: Buffer.from(`<svg width="${tw}" height="22"><rect width="60" height="22" fill="black" opacity=".6"/><text x="5" y="16" font-size="14" fill="white" font-family="sans-serif">${f.replace(/\.\w+$/, '')}</text></svg>`), top: 0, left: 0 }]).toBuffer(),
  left: (i % cols) * tw, top: Math.floor(i / cols) * th,
})))
await sharp({ create: { width: cols * tw, height: rows * th, channels: 3, background: '#111' } }).composite(tiles).jpeg({ quality: 80 }).toFile(out)
console.log(out, files.length)
