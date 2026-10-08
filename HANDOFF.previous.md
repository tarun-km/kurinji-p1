# Kurinji — The Last Bloom · Handoff for the next agent (Codex)

## What this is
A story-driven 3D action game that runs in the browser. Aruvan is a monk who was once Veeran, King Dunkan's champion called "the Ash-Hound". He defends the mountain village of Kurinji, kills the Iron King Dunkan, rules in peace, and dies meditating while the Kurinji flower blooms (it blooms once every 12 years).
Credits the user asked for: **Story & Characters by Tarun KM · Music by Gemini · Coding by Claude · Character Visualizations & Visuals by ChatGPT · Cut scenes by Stable Diffusion (the user is still making these) · Voices by ElevenLabs.**

Stack: three.js r186, `postprocessing` + `n8ao`, Bullet3 (`ammojs-typed`), GSAP, Vue 3, Vite 5, Howler, nippleJS, Tweakpane.
Run: `npm install`, then `npm run dev` (http://localhost:5173). Build: `npx vite build`.

## The user's requirements (all still apply)
1. Graphics, colours and elements must match the reference art: the faceted low-poly "polygon" style with painterly light, set in South Indian hill country.
2. Cinematic camera angles, matched to the 12 story frames.
3. New sound effects.
4. New loading screens, using the fonts Cinzel and Cormorant Garamond.
5. **Preload everything on the client before each chapter**, so play is seamless with no lag.
6. **ElevenLabs voices for every line, saved as local files.** Done: never call the API at runtime.
7. A settings menu.
8. Mobile optimisation in **landscape** with **fullscreen**.
9. The credits listed above.
10. **Integrate changes one at a time** so the user can watch the game being built live in the browser.

Reference art library (concept boards, 3840×2160 PNGs plus `*-preview.webp`): `C:\Users\Tarun KM\AppData\Local\Temp\`. Key files:
- `MODELING_GUIDE.html`: exact coordinates and dimensions. **These govern over the art.**
- `manifest.json`
- `char_*`, `env_*`, `props_*`, `nature_*`, `fx_*`, `lighting_*` and `story_01..12` boards.

`docs/ART_REFERENCE.md` and `docs/MUSIC_BRIEF.md` are the original briefs.

## File map
```
src/main.js, src/App.vue (title/HUD/dialogue/journal/credits UI), src/style.css
src/game/
  Game.js        engine loop, cameras, story API (say/bark/whisper/caption/choose/shot/battle/goTo/talkTo/interact), ambience+footsteps
  story.js       the whole script: SPEAKERS, PETALS (12 memories), 9 chapters (prologue, ch1..ch7, epilogue)
  Actors.js      Player combat, NPC, Enemy/boss AI      Characters.js  OLD procedural humanoid (to be rebuilt)
  Audio.js       NEW: music crossfade engine + category volumes + voice clips + SFX files + ambience layers
  settings.js    NEW reactive settings (quality presets low/medium/high/ultra, volumes, autoAdvance, subtitles...) persisted to localStorage
  voiceKey.js    shared line→file key: voice/<speaker>_<fnv1a hash>.mp3
  store.js, Input.js, Physics.js, World.old.js (old world, unused — can delete)
  gfx/Renderer.js  NEW pipeline: N8AO, DoF (cinematic), bloom, AgX tone map → saturation/contrast (must stay AFTER tone mapping, HDR bug), vignette, grain, SMAA, height fog via patched ShaderChunks, adaptive resolution, grades per lighting preset
  gfx/kit.js       Builder: merges faceted geometry with per-face colour jitter into one mesh per material; mat(key): std/stone/metal/gold/glow/cloth/leaf/grass/tree (wind)
  world/terrain.js heightAt(), PLACES (canonical coords), stream spline, eastern drop, waterfall cliff, fortress gorge, mine pit, bloom/ash terrain shader
  world/sky.js     sky dome, sun/moon/stars, faceted clouds, mountain ring, mist layers
  world/nature.js  instanced conifer/cypress/eucalyptus/shola/palm/broadleaf/rocks/grass/wildflowers, Kurinji shrubs + bloom wave (setBloom)
  world/water.js   stream, waterfalls, gorge river, spray
  world/props.js   prop kit from the 14 prop boards
  world/buildings.js house kit (states normal/burning/ruined), temple + gopuram, bell tower, palisade, fortress walls/towers
  world/fx.js      fire/embers/smoke, bursts, Kurinji Breath crystals, rings, ground warnings, petals, fireflies, rain, marker
  world/fauna.js   chickens, goats, birds
  world/World.js   places everything; TIMES lighting presets; setTime/setBloom/setThennur/setTemple/setFortress/setForge/setGate/setPetals; point-light pool; lightning
scripts/voice-lines.mjs  extracts spoken lines from story.js → public/voice/lines.json
scripts/gen-voices.mjs   ElevenLabs TTS → public/voice/*.mp3 (needs .env.local ELEVENLABS_API_KEY; only renders missing lines)
scripts/gen-sfx.mjs      ElevenLabs sound effects → public/sfx/*.mp3
public/audio  7 composed tracks (music_01..07)   public/voice 192 clips + index.json + lines.json
public/sfx    37 effects + 7 ambience loops (loudness-normalised)   public/fonts Cinzel/Cormorant woff2 + OFL
public/art    story01..12.webp (+ -sm) for loading screens
.env.local    ElevenLabs key (gitignored, never ship it). ~990 credits left, resets ~11 Oct 2026.
```

## State when this handoff was written
- The new world and renderer are **live**, and the game runs. On-screen checks of the meditation rock, temple, village and colours look right.
- **Just applied, not yet tested in the browser:** the new `Audio.js` class, plus the Game.js wiring for voiced `say()` with auto-advance, `bark()`, `whisper()`, the narrator voicing `caption()`, per-chapter `audio.loadVoices(CHAPTERS[i].name)`, `updateAmbience()` and footsteps.
  - **First step:** run `npx vite build`, fix any errors, then play the prologue and check the voices.
  - `App.vue` line ~109 still binds `state.voice`; switch it to `settings.voiceActing`.
  - In `App.vue`, make the typewriter speed follow `state.dialogue.duration`.
- `story.js` already calls `g.bark(...)`, `g.whisper(...)` and the `soldierBark(g)` onWave hooks, and uses the `ilanAdult` speaker.

## Remaining work (in order; integrate each step live)
1. **Test the audio.** Make sure every music/SFX/voice call works. The old `audio.ambience('fire', ...)` calls map to `amb_fire`.
2. **Use the new world-state APIs in the story.** Prologue: `world.setThennur('burning')` (then 'ruined'), Ch. III: `setTemple('burning')`, Ch. IV: `setTime('storm')` with `world.setGate(true, 0.6, true)` for the breach, Ch. VII: `setThennur('rebuilt')`, `setFortress('healing')` and `setForge('peaceful')`.
3. **Characters:** rebuild `Characters.js` to the turnaround boards (`char_*-preview.webp`). Faceted heads and beards, the monk's one-shoulder saffron robe (#D9822B) and sash (#B8661D), Veeran's armour with red plume and cape, Dunkan at 1.25× with the 7-spike gold crown and greatsword, the Guru's cream robes and white beard, Thamarai's green top and plum wrap with braid, Kaali's leather apron and hammer, Rudhra's dark armour with purple cape, Malli in a beige dress, Ilan in a yellow shirt, soldiers with red plumes, captains with gold plumes and a short cape, brutes. Use `gfx/kit.js` Builder per bone. Keep the existing pose system API (`sustain`, `play()`, `setWeapon`). The 'dummy' enemy can use `world.makeDummy()`.
4. **Loading screens and preload.** A per-chapter screen with the matching `public/art/storyNN.webp` (prologue→01, ch1→03, ch2→05, ch3→06, ch4→07, ch5→08, ch6→09, ch7→11, epilogue→12), chapter title in Cinzel, a real progress bar and tips. Before the chapter starts, preload its voices, music and SFX, then call `renderer.warm()`. Switch the CSS to the local fonts with `@font-face` from `/fonts/*.woff2` and remove the Google Fonts link.
5. **Settings and pause menu** (Esc): graphics preset plus each option (render scale, shadows, AO, bloom, DoF, AA, foliage), audio sliders (master/music/voice/sfx/ambience), auto-advance, subtitles, text size, camera sensitivity, invert Y, camera shake. When settings change, call `renderer.apply()` and `world.nature.applyDensity()`.
6. **Storybook UI** to match `ui_storybook_system` (parchment and gold palette #E8B46A/#F0A54A/#A494FF/#F4EAD8/#0D0A08/#C8402A).
7. **Mobile:** a fullscreen request plus `screen.orientation.lock('landscape')` on the first tap, a rotate-device overlay in portrait, a PWA `manifest.webmanifest` (display: fullscreen, orientation: landscape), quality auto-set to low or medium, larger touch buttons.
8. **Credits and title screen attribution** (names above).
9. **Cutscene hook:** `g.cutscene(id)` plays `/cutscenes/<id>.(mp4|webp)` if it's listed in `/cutscenes/index.json`, and otherwise does nothing.
10. **Cinematic shots** matched to the 12 story frames, using `renderer.focus(target)` for depth of field.
    - Ch. VI must match `story_10_empty_throne`: Dunkan kneels, his crown has fallen onto the steps, Aruvan raises his palm to refuse it, then Dunkan lunges and Aruvan strikes the final blow.
    - New lines need new voices. Run `node scripts/voice-lines.mjs`, then `node --env-file=.env.local scripts/gen-voices.mjs`.
11. **Performance pass:** mobile preset, instance counts, draw calls.

## Gotchas
- Postprocessing `HueSaturationEffect` must come after `ToneMappingEffect`, otherwise orange and yellow render black.
- Builder Euler order is XYZ. For "yaw then tilt", use `b.push(at, [0, yaw, 0])` and then `b.add(..., { rot: [tilt, 0, 0] })`.
- The terrain bloom shader uses `smoothstep` with edge0 < edge1 only.
- Don't use `THREE.Sprite`: the patched `fog_vertex` needs `transformed`.
- Dev helper in the browser console: `__view([x,y,z],[lookX,lookY,lookZ],'dawn'|'day'|...)` frames a shot and hides the title. `__game` is the Game instance.
- The title screen sets bloom to 0.75. Call `__game.world.setBloom(0)` when checking normal scenes.
