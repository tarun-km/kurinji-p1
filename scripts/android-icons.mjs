// Android launcher icons + splash from the app artwork.
//   node scripts/android-icons.mjs [source.png]     (default public/icons/app-icon.png, else icon-512.png)
// Writes legacy + round icons, adaptive-icon foreground layers for every density, and the splash.
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
sharp.cache(false)

const src = [process.argv[2], 'public/icons/app-icon.png', 'public/icons/app-icon.jpg', 'public/icons/app-icon.webp', 'public/icons/icon-512.png'].find(p => p && fs.existsSync(p))
const RES = 'android/app/src/main/res'
const DENS = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
console.log('icon source:', src)
for (const [d, px] of Object.entries(DENS)) {
  const dir = path.join(RES, `mipmap-${d}`); fs.mkdirSync(dir, { recursive: true })
  await sharp(src).resize(px, px, { fit: 'cover' }).png().toFile(path.join(dir, 'ic_launcher.png'))
  const r = px / 2, mask = Buffer.from(`<svg width="${px}" height="${px}"><circle cx="${r}" cy="${r}" r="${r}"/></svg>`)
  await sharp(src).resize(px, px, { fit: 'cover' }).composite([{ input: mask, blend: 'dest-in' }]).png().toFile(path.join(dir, 'ic_launcher_round.png'))
  // adaptive foreground: 108dp canvas, art inside the 72dp safe zone
  const fg = Math.round(px * 108 / 48), inner = Math.round(fg * 0.72)
  const art = await sharp(src).resize(inner, inner, { fit: 'cover' }).png().toBuffer()
  await sharp({ create: { width: fg, height: fg, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: art, gravity: 'center' }]).png().toFile(path.join(dir, 'ic_launcher_foreground.png'))
}
// adaptive background colour
const vals = path.join(RES, 'values'); fs.mkdirSync(vals, { recursive: true })
fs.writeFileSync(path.join(vals, 'ic_launcher_background.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0D0A08</color>\n</resources>\n')
// splash: the art centred on the game's ink background
for (const dir of fs.readdirSync(RES).filter(d => d.startsWith('drawable'))) {
  const f = path.join(RES, dir, 'splash.png'); if (!fs.existsSync(f)) continue
  const { width, height } = await sharp(fs.readFileSync(f)).metadata(), s = Math.round(Math.min(width, height) * 0.42)
  const art = await sharp(src).resize(s, s, { fit: 'cover' }).png().toBuffer()
  fs.writeFileSync(f, await sharp({ create: { width, height, channels: 4, background: '#0d0a08' } }).composite([{ input: art, gravity: 'center' }]).png().toBuffer())
}
// the web build uses the same icon
if (!src.includes('icon-512')) {
  await sharp(src).resize(512, 512).png().toFile('public/icons/icon-512.png')
  await sharp(src).resize(192, 192).png().toFile('public/icons/icon-192.png')
}
console.log('android icons + splash written')
