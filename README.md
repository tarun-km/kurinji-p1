# Kurinji — The Last Bloom

A story-driven 3D action game in the browser. Aruvan is a monk who was once Veeran, "the Ash-Hound" and champion of King Dunkan. He comes down from the mountain to protect the village of Kurinji. He kills the Iron King, rules in peace, and dies meditating on the day the Kurinji flower blooms (it blooms once every twelve years).

**Made with** three.js · Bullet3 (ammo.js) · GSAP · Vue · Vite · Howler.js · nippleJS · Tweakpane

## Run

```bash
npm install
npm run dev
```

## Controls

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Move / run | WASD / Shift | left stick |
| Camera | click the screen, then move the mouse (Z / C also rotate) | drag on the right side |
| Strike (3-hit chain) | Left click / J | STRIKE |
| Heavy blow | Right click / K | HEAVY |
| Evade (perfect timing → slow-mo "Still Mind") | Space | EVADE |
| Kurinji Breath (when the ring is full) | F / Q | BREATH |
| Interact / talk | E | E |
| Dialogue / choices | Space, E, click / keys 1–3 | tap |
| Memory journal | Tab | — |
| Debug panel (Tweakpane) | ` | — |

## Story

| # | Chapter | Beat |
|---|---|---|
| 0 | **Ash** | Veeran burns Thennur on Dunkan's orders. Malli, a dying child, gives him a Kurinji flower: "Will you wait for it?" |
| I | **The Quiet Mountain** | Twelve years later. Meditation, the temple bell, the villagers, training. |
| II | **The Iron Envoy** | Commander Rudhra, his old brother-in-arms, exposes his past. Aruvan fights but refuses to kill. |
| III | **The Guru's Last Lesson** | "A blade is only a question. Who holds it is the answer." The temple is raided and the Guru is murdered. |
| IV | **The Gate of Kurinji** | The village stands together at the gate. A conscripted boy begs for his life. |
| V | **Ashes of Thennur** | One Kurinji bush blooms where Malli died. Boss fight with Rudhra, then spare him or kill him. |
| VI | **The Iron Throne** | Two-phase boss fight with Dunkan. The final blow. The throne becomes "only a chair." |
| — | **Interlude: The Years Between** | Inside the prologue: the climb in the rain, the Guru's water, the first winter of breathing, the hundred steps, and the naming at the bell. |
| VII | **The Peaceful Reign** | A montage of the years of peace. |
| — | **When the Kurinji Blooms** | Old Aruvan walks to the meditation rock. The player presses to take his last five breaths as the mountain turns blue. |

**What keeps players coming back:** a compassion/wrath karma system that changes dialogue and the ending, 12 hidden memory petals that reveal backstory and add +5 vitality each, combo chains with hit-stop and screen shake, perfect-evade slow motion, boss phases, autosave with Continue and chapter select, and fights that retry automatically from a checkpoint.

## Code map

- `src/game/story.js`: the whole script (dialogue, choices, staging, chapters, petals, village life)
- `src/game/cinematics.js`: the twelve story-board camera compositions and optional cutscene hooks
- `src/game/Game.js`: engine loop, cinematic camera (lens, handheld, dialogue coverage, occlusion-safe shots), story API (`say`, `choose`, `shot`, `battle`, `walkTo`…), villager talk
- `src/game/world/`: terrain, sky/clouds/mist, buildings, props (temple Buddha, shrines), instanced nature (chunked and distance-culled), water, FX, fauna; walkable floors and stairs (`groundAt`)
- `src/game/gfx/`: renderer and post-processing (N8AO, DOF, bloom, ACES, SMAA, grain, adaptive resolution) and the faceted art kit
- `src/game/Characters.js`: skinned low-poly characters, hair styles, cloth (skirt/cape) dynamics, poses, activities
- `src/game/Actors.js`: player combat, NPCs, enemy and boss AI
- `src/game/Audio.js`: Howler music, SFX, ambience and voice playback with per-chapter preloading
- `src/game/assets.js` and `settings.js`: chapter preload barrier, graphics/audio/control settings
- `src/App.vue`: title, loading screens, HUD, dialogue, settings, journal, finale, credits

## Media

- `public/audio`: the seven music tracks
- `public/voice`: 204 ElevenLabs voice lines, `public/sfx`: SFX and ambience. Everything is generated offline and loudness-normalised. **The game never calls ElevenLabs at runtime.**
- `public/art`: story-board stills used on the loading screens
- `public/cutscenes/index.json`: map a story frame id (see `cinematics.js`) to a video file to replace that live scene with a pre-rendered cutscene

To regenerate voices after a script edit, put `ELEVENLABS_API_KEY=...` in `.env.local` (gitignored, never bundled) and run:

```bash
node scripts/voice-lines.mjs
```

```bash
node --env-file=.env.local scripts/gen-voices.mjs
```

The second command renders only missing lines.

## Modes

- **Story**: prologue (with the interlude), seven chapters, epilogue. Continue and chapter select use the saved progress.
- **Free Roam**: unlocks after the ending. The peaceful-reign world with villagers to talk to, petals to find and a slow day cycle. Pause → Return to title to leave.

## Mobile

Floating joystick (push fully to run), drag anywhere else to look, Strike / Heavy / Evade / Breath buttons, a contextual Talk button and a Memories button. Touch look speed, button size and vibration are under Settings → Camera. The title shows a landscape + fullscreen notice and an **Install the game** button (Android install prompt, or Add to Home Screen steps on iPhone). A service worker keeps music, voices and art on the device after the first play.

Put the loading-screen painting at `public/art/loading.jpg` (or `.webp`/`.png`); every loading screen uses it automatically.

## Deploy to Vercel

Import the repository in Vercel. `vercel.json` already sets the Vite build (`npm run build` → `dist`) and cache headers. No environment variables are needed: the ElevenLabs key is only for regenerating voices offline and must never be added to Vercel.

## Production

```bash
npm run build
```

```bash
node scripts/check-assets.mjs
```

```bash
node scripts/check-characters.mjs
```

Camera audit (dev server console): `const m = await import('/tests/cinematic-audit.js'); await m.run(0); m.report()` lists every dialogue line whose speaker is not well framed.

Deploy `dist/` to any static host. Settings offer Low/Medium/High/Ultra presets, and adaptive resolution keeps frame rate steady. On phones the game asks for landscape and fullscreen and shows touch controls.

## Credits

Story developed by Tarun KM, Characters by Tarun KM, Music By Gemini, Coding By Claude, Character Visualizations & Visuals By ChatGPT, And Stable Diffusion for Cut Scenes
