// Builds the offline Android app: web build → Capacitor sync → Gradle → release/Kurinji.apk
//   npm run android            (debug-signed APK, installable by sideloading)
// Needs Android Studio installed (its bundled JDK and SDK folder are found automatically).
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const LOCAL = process.env.LOCALAPPDATA || ''
const env = { ...process.env }
env.JAVA_HOME ||= ['C:/Program Files/Android/Android Studio/jbr', '/Applications/Android Studio.app/Contents/jbr/Contents/Home'].find(p => fs.existsSync(p))
env.ANDROID_HOME ||= [path.join(LOCAL, 'Android/Sdk'), path.join(process.env.HOME || '', 'Library/Android/sdk')].find(p => fs.existsSync(p))
// JDK 21 on Windows: its internal socket pipe fails under some TEMP paths ("Unable to establish
// loopback connection"); give Java a plain temp folder.
if (process.platform === 'win32') {
  const tmp = path.join(path.parse(process.cwd()).root, 'jtmp'); fs.mkdirSync(tmp, { recursive: true })
  env.TMP = env.TEMP = tmp
  env.JAVA_TOOL_OPTIONS = `-Djdk.net.unixdomain.tmpdir=${tmp.replace(/\\/g, '/')} -Djava.io.tmpdir=${tmp.replace(/\\/g, '/')}`
}
fs.writeFileSync('android/local.properties', `sdk.dir=${env.ANDROID_HOME.replace(/\\/g, '/')}\n`)
const run = (cmd, cwd = '.') => execSync(cmd, { stdio: 'inherit', env, cwd })
run('node scripts/android-icons.mjs')
run('npx vite build')
run('npx cap sync android')
run(`"${path.resolve('android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')}" assembleDebug --no-daemon`, 'android')
fs.mkdirSync('release', { recursive: true })
fs.copyFileSync('android/app/build/outputs/apk/debug/app-debug.apk', 'release/Kurinji.apk')
console.log(`\n✓ release/Kurinji.apk (${(fs.statSync('release/Kurinji.apk').size / 1e6).toFixed(1)} MB) — copy it to the phone and open it to install`)
