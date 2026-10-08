# Kurinji — The Last Bloom: current handoff to Claude

Updated: 8 October 2026 (Asia/Calcutta).
The user explicitly stopped Codex and asked Claude to take over. Do not interpret this file as Codex continuing the task. Coding agents have been stopped, the silent verification tab was closed, and the development server started by Codex was stopped. Another existing server on port 5173 may still belong to the earlier session; Codex did not kill unrelated processes.

## Read this first

The game has substantial new character, cinematic, UI, loading, audio and engine changes. It is NOT a finished, universally optimized game. The strongest verified results are a successful production build, nine audio regressions, character/resource tests, complete decoding of all 236 indexed media files, and a real browser check of all nine chapter preload barriers plus pause/resume and teardown. Full playthrough, production-browser testing, actual performance benchmarks and physical mobile testing remain.

The user's latest concern was serious: "the sound is so bugged ... my ears are even hurting." The audio rewrite lowers output and prevents stacked playback. Continue with a quiet volume, confirm playback audibly, and do not restore the old loud mix. The media files themselves decoded correctly; this does not prove subjective playback quality.

The original handoff is preserved as HANDOFF.previous.md. Some original engine files are backed up under .codex-backups/2026-10-08/ (Game, Audio, Actors, Physics, Input, Renderer). This directory is not a Git repository. No commits, PRs or deployments were created.

## User requirements and visual authority

- A convincing faceted low-poly 3D story/action game in South Indian hill country. The user does not want a "lame game."
- Alter/rebuild characters from the supplied visual library, improve cinematic camera angles, preserve the story and character identities.
- Prepare assets chapter by chapter before play resumes, minimizing stutter and bounding memory. Do not promise zero lag on every computer.
- Local saved ElevenLabs voices; no runtime generation/API requests.
- Local Cinzel/Cormorant fonts, chapter art/loading progress, storybook UI, graphics/audio/story/camera settings, mobile landscape/fullscreen, credits.
- Integrate and show work incrementally when the user resumes work with Claude.

Authoritative visual library supplied during this session:
C:/Users/Tarun KM/Documents/Codex/2026-10-08/cre/outputs/kurinji-visual-library/index.html

Read MODELING_GUIDE.md in that directory and then its characters/, story/, places/, interface/, lighting/, effects/, nature/ boards. Source coordinates and dimensions override incidental generated-image annotations. The collection has completed boards and separate pending-generation material; not every proposed board is a finished asset.

Compact reference preservation is now in docs/art-reference/: 108 files, approximately 13.9 MB, including modeling guide, manifest and preview boards. The preserved guide was checked against the stable library. Original docs/ART_REFERENCE.md and docs/MUSIC_BRIEF.md still apply.

Story: Aruvan, formerly Veeran the Ash-Hound, protects Kurinji, defeats Dunkan, refuses his crown, rules peacefully, and dies meditating as Kurinji blooms after twelve years.

Requested credits preserved exactly in UI:
Story & Characters by Tarun KM; Music by Gemini; Coding by Claude; Character Visualizations & Visuals by ChatGPT; Cut scenes by Stable Diffusion; Voices by ElevenLabs.

## Completed: characters

src/game/Characters.js was rebuilt using per-bone merged faceted geometry and the supplied turnarounds.

- 24 presets: aruvan, aruvanKing, aruvanOld, veeran, guru, thamarai, thamaraiOld, thamaraiChild, ilan, ilanAdult, kaali, villager, malli, soldier, captain, senthil, senthilBuilder, brute, rudhra, rudhraYoung, rudhraPenitent, rudhraOld, dunkan, dummy.
- Saffron one-shoulder robe/sash, angular faces and beards, robe folds, wrist beads/scar, hair/braids, plumes/capes, armor, hammer, flower and wooden kingfisher props; Dunkan has seven crown spikes and larger scale.
- Existing APIs preserved: root, o, sustain, play, busy, setWeapon, setTint, hitFlash, update.
- Added dispose(), dropCrown(parent, {x,y,z}), sustained 'refuse' palm pose, warmCharacterPresets(scene, renderer), CHARACTER_PRESET_NAMES.
- Dropped crown transfers ownership, survives character disposal, exposes crown.userData.dispose(). Game cleans it at new start/teardown.
- Shared cached template geometry; character tint materials are isolated. Pose updates avoid allocating a pose object each frame. Warmup includes finite villager/kid variants and weapon variants.
- Latest test maximum: 25 meshes and 1,864 triangles per character. This is a geometry bound, not an FPS claim.
- Aruvan was inspected in an actual browser character preview and compared with his reference sheet. Broader visual comparison of every model and every gameplay shot is still needed.
- Actors now dispose characters on removal/look swaps. Scripted player poses avoid world/enemy collision displacement; defeated bosses have zero velocity.

## Completed: story, world states and cameras

src/game/story.js and new src/game/cinematics.js:

- Twelve numbered reference-matched camera compositions, relative to canonical places/actors.
- Distinct story IDs story_01_thennur_burning through story_12_last_bloom_poster; use STORY_FRAMES for exact filenames.
- Chapter state restoration for Continue/chapter selection: Thennur burning/ruined/rebuilt, temple fire, storm, broken/open gate, peaceful forge, healing fortress, petals/bloom.
- Empty-throne beat: Dunkan kneels; detached crown falls onto steps; Aruvan raises refusal palm; Dunkan lunges; Aruvan gives final blow. Crown stays on floor through throne speech.
- King Aruvan shawl, adult Ilan teaching exactly five children in rebuilt Thennur, penitent/old Rudhra variants, older Thamarai, staff-free final meditation.
- Dialogue text/voice IDs were preserved; no voice API generation or credit spending.
- Camera shots call renderer.focus; leaving cinematics disables cinematic depth of field. Follow camera applies sensitivity/invert-Y and samples terrain/building obstacles to pull inward.
- World.setGate now also hides gate rubble when restoring an intact gate.

## Completed: quieter audio rewrite

src/game/Audio.js now has one active audio session per page and proper cleanup.

- Every Howl starts at zero gain; effect/voice volume is set before play, avoiding a loud initial burst from pooled sounds.
- Master output is scaled by 0.65. Lower category gains: music base multiplier 0.42, effect multiplier 0.42, spoken voice 0.65 (whispers 0.5). User sliders still apply.
- WebAudio master output uses a dynamics compressor (-12 dB threshold, 12:1 ratio, fast attack). Native music elements bypass this compressor but use the quieter capped category/master mix.
- Effects limited to six simultaneous playbacks and two instances of an individual effect, with a short cooldown.
- Ambience shares a total target budget of 0.32 times the ambience slider, with eased transitions.
- Old music players stop on cue changes so rapid changes cannot stack tracks.
- Music files download completely to Blob URLs and both reusable native HTMLAudioElement players wait for canplaythrough under the loading barrier. Two players crossfade loops without repeated creation/Howler HTML pool exhaustion.
- Only seven composed tracks exist. Later named cues use documented existing-track or synthesized fallbacks; no repeated runtime requests for nonexistent files.
- Synthesized fallbacks/bell are prepared and decoded during initial loading, not first combat use.
- Chapter voices load/decode with bounded concurrency, previous chapter voices unload, shared barks remain. Missing required clips fail loading instead of pretending success.
- say() uses already-decoded local clips and never starts a voice fetch during gameplay. No browser speech fallback. Missing/unloaded speech becomes silent text.
- Pausing stops transient effects and preserves sustained voice/ambience/music playback. Disabling voice acting during pause cannot resurrect that stopped line on resume.
- Audio.destroy unloads owned Howls, releases music/synth URLs, timers and Vue watchers. HMR/new audio sessions stop the previous session.
- Game.bark does not interrupt dialogue. Dialogue/caption progression is tied to the story clock and recorded duration.

UI defaults were reduced to master .5, music .55, voice .8, sfx .6, ambience .35. Existing saved preferences remain, so do not assume every current browser profile has those defaults. The output safeguards apply independently.

## Completed: chapter asset barrier and renderer

New src/game/assets.js:

- Explicit stable chapter keys: prologue, ch1..ch7, epilogue. DO NOT use CHAPTERS[i].name for asset lookup: production minification changes function names.
- Chapter artwork mapping: 01,03,05,06,07,08,09,11,12.
- Music manifests include battle/after/fallback cues; Chapter III now explicitly includes iron_banners.
- runTasks limits concurrent tasks to four and waits for in-flight workers before surfacing a failure. fetchAsset checks HTTP status and has a 30-second timeout.

Game.prepareChapter(i):
- Shows real progress in state.loading.
- Stops previous music/voice; releases music not needed by the incoming chapter, comparing resolved cue identities so retained aliases keep valid URLs.
- Loads/decodes artwork, chapter/shared voices, all 37 reusable SFX/ambience files, chapter music, and optional listed cutscene blobs.
- Calls renderer.warm before removing the overlay and beginning the chapter.
- Failed required media stops the transition and exposes retry. Saves chapter progress only after preparation succeeds.

Renderer changes:
- Uses supported THREE.PCFShadowMap instead of removed PCFSoftShadowMap.
- Caps pixel budget/DPR according to device/preset and uses slower adaptive-resolution recovery with hysteresis. FPS samples use real elapsed time, not the simulation-clamped delta.
- Low preset reduces bloom resolution, disables mist/cloud features as configured, and hides full-water spray; foliage density changes apply live.
- warm() temporarily includes hidden/offscreen geometry, compiles shaders, uploads vertex buffers/shadow resources via a small offscreen render, restores visibility/culling, then warms compositor passes.
- Handles context loss/restoration and renderer/composer/listener disposal.
- Maintains original AgX -> saturation/contrast ordering; moving saturation before tone mapping breaks orange/yellow colors.

Vite splits physics, Three, effects, runtime and game code. Ammo is imported asynchronously during initial loading. Last successful build produced approximately: game JS265KB, effects336KB, runtime356KB, Three577KB, physics1.97MB before gzip. Three/Ammo still trigger chunk-size warnings; this is not a compiler failure and those dependencies are inherently large.

## Completed: UI, settings and mobile

src/App.vue, src/style.css, src/game/store.js, src/game/settings.js, index.html, public/manifest.webmanifest:

- Parchment/gold storybook identity, local Cinzel/Cormorant woff2 fonts, no Google Fonts dependency.
- Esc pause/settings: presets plus render scale, shadows, AO, bloom, DoF, AA, foliage, particles/cloud/water settings, adaptive/performance display; master/music/voice/SFX/ambience; voice acting/auto-advance/subtitles/text size/speed; camera sensitivity/invert-Y/shake.
- Duration-aware dialogue typewriter; modal key handling prevents double advancement and underlying gameplay input.
- Chapter art/progress/tips/error/retry screen, memory journal, all requested credits, optional image/video cutscene overlay and skip.
- Feature-detected fullscreen + landscape lock request on first start gesture for mobile; portrait rotate overlay; larger touch controls; fullscreen/landscape PWA manifest.
- Saved settings are validated and clamped. Settings apply renderer/nature changes live.
- Mounted/init teardown guards stop stale HMR initialization publishing a previous instance.
- Desktop1280x720 and landscape844x390 settings/title layout checked; tabs/footer/scrolling/Escape focus behavior passed. Physical phones have NOT been tested.

Game/Input lifecycle:
- Pause/journal freeze simulation, GSAP story camera/fades and audio. Game.wait uses the simulation clock; visibility loss pauses play.
- Input.reset clears pressed/held/look/stick state; Input.destroy removes listeners/joystick. Gameplay ignores modals/loading/cutscenes.
- Esc from pointer lock opens pause when appropriate.
- Active-game ownership guard prevents late teardown clearing a newer session's UI callbacks/timeline. Cancelled initialization checks after awaits and cleans up when it unwinds.
- Game.destroy removes callbacks/listeners, actors, GPU resources, physics allocations and audio. Shared art-kit materials are marked for safe reuse.

Physics changes:
- Reuses Bullet vector/transform objects instead of leaking a btVector3 every player frame.
- Destroys temporary ground vertices/body construction data; releases bodies/motion states/shapes, expired boulders and world resources.
- Shares prop geometry/materials within a physics session.
- Expired boulders are removed even if physics initialization falls back.

## Optional cutscenes

public/cutscenes/index.json currently contains {}. No user-supplied movies were installed or generated.

A mapping can use e.g.:
{"story_01_thennur_burning":{"file":"story_01_thennur_burning.mp4"}}

Files must have a safe simple name and .mp4/.webp extension. Incoming chapter cutscene blobs preload under its barrier; g.cutscene(id) uses resident URLs and otherwise leaves the live 3D scene. Add files/manifest when the user supplies them. Test real video autoplay, skip, errors and audio mix before delivery.

## Verification actually performed

1. npm run build succeeded multiple times, including after the audio/physics split and main engine/UI integration. The LAST small changes (optional cutscene preloading and harness result retention) received syntax/audio/browser checks, but a new final production build after those exact changes was not run before the user stopped work. dist may lag those changes.
2. node scripts/check-characters.mjs passed:24 presets, finite geometry/poses/actions, shared-resource lifetime, isolated materials, weapon swaps, crown transfer, warmup failure cleanup.
3. node scripts/check-audio.mjs passed9/9: quiet initial gain/ambience budget; effect limits; voice ID through pause; scene cleanup; voice-off pause regression; retained fallback URLs; two-player loops; chapter voice unload/no fetch during say; required missing-line failure.
4. node scripts/check-assets.mjs --decode --all-voices passed:37 indexed SFX/ambience +192voices +7music =236 media, all fully decoded by ffmpeg. Focused signal samples showed no corrupt headers/NaN/clipping. This is not an audible playthrough test.
5. Story functions were exercised with API mocks through compassion and wrath routes: all9chapters and all12cutscene paths, preserved192voice IDs. This is not a real combat/gameplay completion test.
6. ACTUAL BROWSER tests/runtime.html completed successfully before its tab was closed:
   - Engine, physics, local-font readiness and character/world shader warmup passed.
   - prologue:24 decoded chapter/shared voices; ch1:35; ch2:30; ch3:26; ch4:30; ch5:21; ch6:22; ch7:14; epilogue:30.
   - Every chapter had all37SFX ready, cached music and GPU warmup.
   - Pause froze a pending story wait; resume resolved it.
   - Session teardown removed its renderer canvas; no background sound during this test.
   - The diagnostic showed1118GPU geometries after whole-world warmup. Its displayed "1 render call" refers to the compositor's LAST pass, NOT total scene draw calls. Do not cite that as a performance result.
7. Browser title/settings checked desktop/mobile landscape; Aruvan model preview inspected. No final full-world visual sweep or measured gameplay benchmark completed.

Reusable checks:
node scripts/check-characters.mjs
node scripts/check-audio.mjs
node scripts/check-assets.mjs
node scripts/check-assets.mjs --decode --all-voices

For real engine preload verification, npm run dev then open /tests/runtime.html and click Run chapter loading checks (silent). It also previews presets/poses. This is a development page, not the game's home page. Close it when done; return the user to /.

## Claude's next work, in priority order

1. Start at source, not dist. Run a final npm run build after the last changes and check the production preview. Avoid external APIs/credit use unless authorized; all current media are local.
2. Confirm audio audibly at low volume in actual prologue/gameplay: footsteps, impacts, overlapping fights, dialogue/manual skip/auto-advance, ambience transitions, music loops, master mute, pause/resume, voice toggle, tab visibility and HMR cleanup. Existing regressions prove behavior with adapters, not speaker quality. Do not claim the user's painful audio problem is definitively resolved until playback is confirmed.
3. Play the actual game through representative movement/interact/training/battle/boss/crown/ending sequences, then compassion/wrath branches. Mock story tests do not validate real combat AI/colliders/camera staging. Review camera obstacle sampling near temple/fortress and seated/lying actors.
4. Measure actual CPU/GPU frame times, long frames, total render passes/draw calls, triangles and memory in village, burning Thennur, storm battle, fortress boss and bloom finale. Existing compositor info is insufficient. Test low/medium/high and different hardware; target WebGL2-capable systems, not "any computer" guarantees.
5. Review chunk/instance culling and point-light cost: the whole procedural world is constructed at startup. Chapter-specific MEDIA is managed, but world geometry is NOT streamed district by district. Asset warmup is conservative (many hidden/offscreen resources) and creates1118GPU geometries. Optimize from measurements rather than simply lowering every visual.
6. Inspect characters and all12story shots against the stable library in game lighting. The procedural rebuild is not an imported finished sculpt/rig; refine silhouettes/faces/robe folds/weapons where visual comparison warrants it. Aruvan-only preview is insufficient to claim every character matches.
7. Check lifecycle/loading failure paths under slow/failed network, repeated reloads/settings changes, context loss and chapter retries. After cancellation, make sure old tasks cannot write loading/UI state for a successor. Inspect remaining native story timers/setIntervals vs pause semantics; only Game.wait was changed to simulation time.
8. Verify physical Android/iOS landscape, fullscreen, touch, orientation fallback, small screens and low-memory performance. Fullscreen/orientation lock can be rejected by browser policies; current implementation falls back gracefully but is not physical-device tested. Manifest exists; no service worker/offline install support was added.
9. Install user-supplied cutscene files in public/cutscenes and update index, then test buffering/playback/skip/volume. Optional hooks currently do nothing with the empty manifest.
10. Update README.md: its old file map/audio description is stale (still describes old World and synthesized/Web Speech audio). HANDOFF.md is the current source of session context.
11. Once those checks pass, report concrete evidence/limits to the user and only then call this a finished session. Never guarantee flawless behavior on untested machines.

## Files changed / added this session

Core: src/game/Game.js, Audio.js, Actors.js, Characters.js, Input.js, Physics.js.
Rendering/world: src/game/gfx/Renderer.js, gfx/kit.js, world/World.js.
Story: src/game/story.js; new src/game/cinematics.js.
Assets: new src/game/assets.js; new public/cutscenes/index.json.
UI: src/App.vue, src/style.css, src/game/settings.js, src/game/store.js, index.html; new public/manifest.webmanifest.
Build: vite.config.js.
Checks: scripts/check-characters.mjs, scripts/check-audio.mjs, scripts/check-assets.mjs; tests/runtime.html and tests/runtime.js.
References/backups: docs/art-reference/, .codex-backups/2026-10-08/, HANDOFF.previous.md.
Current handoff: HANDOFF.md.

No secrets were read into logs, no .env.local changes, no new voices generated, no ElevenLabs credits used. Old remaining-credit numbers in HANDOFF.previous.md are historical and unverified.
