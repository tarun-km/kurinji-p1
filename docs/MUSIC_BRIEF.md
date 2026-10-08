# Kurinji — The Last Bloom · Music Brief

**13 music tracks (14 files).** Only **2 need lyrics**: *Malli's Lullaby* and the end-credits song. Draft lyrics are at the bottom. Everything else is instrumental, because characters talk over it and sung words would fight the dialogue. Wordless voices (humming, "aah" choir) are fine wherever noted.

Until a track arrives, the game keeps using its current built-in placeholder music, so you can send tracks one at a time.

---

## 1. The musical identity

### The Kurinji motif (use it everywhere)
One short melody ties the whole game together. It's already in the current placeholder theme:

```
D – E – F♯ – A … F♯ – E – D … B – D
(Sa  Re  Ga  Pa   Ga  Re  Sa   Dha  Sa)
```

- It's the **D major pentatonic** scale, which is **Raga Mohanam** in Carnatic music: hopeful, open, mountain air.
- Use it in the **main theme**, as the melody of **Malli's lullaby**, as the opening of the **credits song** chorus, and as the **single flute line** at Aruvan's death.
- For the players, this is the emotional payoff: the lullaby a dying child hummed in the prologue comes back as the last thing they hear.
- For sad versions, bend it toward a minor or **Raga Sivaranjani** feel (S R2 G2 P D2, a classic sound of pathos).

### Instrument palette
| Mood | Instruments |
|---|---|
| Sacred / peaceful | **Bansuri** (bamboo flute), **tanpura** drone, **veena**, soft strings, light **mridangam**, wordless female voice |
| Village / warm | Bansuri, veena, hand percussion (kanjira, ghatam), plucked strings |
| War / Dunkan | Big drums (**thavil**, taiko-style), **nadaswaram** (loud reed), low brass, anvil and metal hits, deep male choir |
| Grief | Solo bansuri, cello / low strings, sparse tanpura |

**Vibe references** for feel only, not to copy: Austin Wintory's *Journey*, the *Ghost of Tsushima* soundtrack, and the flute-led pastoral film scores of Ilaiyaraaja.

---

## 2. The track list

**Loop** means the track repeats seamlessly in the background for as long as the scene lasts. **One-shot** plays once and ends naturally.

| # | File name | Title | Where it plays | Type | Length | Lyrics |
|---|---|---|---|---|---|---|
| 1 | `music_01_main_theme` | **The Last Bloom** | Title screen, Ch. I dawn on the rock, training | Loop | 2:30–3:00 | No (wordless voice OK) |
| 2 | `music_02_mountain` | **Kurinji Morning** | Exploring: temple, village, roads, walking between objectives | Loop | 3:00–4:00 | No |
| 3 | `music_03_ash` | **Thennur Burns** | Prologue: the burning village | Loop | 2:00 | No (wordless choir OK) |
| 4 | `music_04_lullaby` | **Malli's Lullaby** | Malli's death; echo at her bush (Ch. V); returns at the end | One-shot | 0:50–1:15 | **YES** (2 versions) |
| 5 | `music_05_iron_banners` | **Iron Banners** | Tension: the envoy arrives (Ch. II), entering the fortress, Dunkan on his throne | Loop | 1:30–2:00 | No |
| 6 | `music_06_battle` | **Staff and Stone** | All regular fights (Ch. II, III, IV, VI) | Loop | 2:00–2:30 | No (shouts / chants OK) |
| 7 | `music_07_rudhra` | **Brothers of Ash** | Boss: Rudhra in the ruins of Thennur | Loop | 2:30 | No |
| 8a | `music_08a_dunkan` | **The Iron King** | Boss: Dunkan, phase 1 | Loop | 2:30 | No (choir syllables OK) |
| 8b | `music_08b_dunkan_rage` | **The Iron King (Rage)** | Boss: Dunkan, phase 2 (night, falling boulders) | Loop | 2:30 | No |
| 9 | `music_09_sorrow` | **Protect What Blooms** | The Guru's death, after Malli dies, sparing or killing Rudhra | Loop | 2:00–2:30 | No |
| 10 | `music_10_reign` | **A Chair, Not a Throne** | After Dunkan falls, the empty-throne speech, the Ch. VII montage | One-shot | 2:00–2:30 | No |
| 11 | `music_11_bloom` | **When the Kurinji Blooms** | Epilogue: the last walk, the bell, the goodbyes on the rock | Loop | 3:00–4:00 | No |
| 12 | `music_12_last_breath` | **…It Bloomed** | After the final breath, as the camera rises over the blue mountain | One-shot | 1:15–1:45 | No (soft wordless choir OK) |
| 13 | `music_13_credits` | **Wait for Me, Kurinji** | End credits | One-shot song | 3:30–4:00 | **YES** |

### Priority order, if you can't make all of them at once
1. **Core (the game needs these):** 1 Main Theme · 2 Mountain · 6 Battle · 9 Sorrow · 11 Bloom
2. **Emotional peaks:** 4 Lullaby · 12 Last Breath · 13 Credits Song · 8a/8b Dunkan
3. **Polish:** 3 Ash · 5 Iron Banners · 7 Rudhra · 10 Reign

---

## 3. How each track should sound

### 1 · The Last Bloom (main theme)
- **Feeling:** wonder, peace, a hint of sadness underneath. The sound of mist lifting off a mountain at dawn.
- **Build:** start with a tanpura drone and a solo bansuri playing the **Kurinji motif**. Veena and soft strings join, light mridangam enters halfway, and a wordless female voice can carry the second half.
- **Tempo / key:** about 70 BPM, D major pentatonic (Mohanam).
- This is the "sound of the game." Make it memorable enough that someone could hum it.

### 2 · Kurinji Morning (exploration)
- **Feeling:** calm, warm, lived-in. It must never get tiring, because players hear it the most.
- **Build:** very sparse. A tanpura drone with occasional short bansuri or veena phrases and plenty of space between them, plus soft plucked strings. Avoid a constant melody. Fragments of the motif are welcome.
- **Tempo / key:** free-flowing or about 60 BPM, D major.
- **Important:** dialogue happens over this track, so keep the voice range (roughly 300 Hz to 3 kHz) uncluttered.

### 3 · Thennur Burns (prologue)
- **Feeling:** horror, guilt, a nightmare. Something terrible is being done, and the player is the one doing it.
- **Build:** low string clusters, a distant slow war drum like a heartbeat, a dark wordless choir, a nadaswaram wailing far away. No clear melody. Near the end, one fragile bansuri note hints at the motif (Malli is near).
- **Tempo / key:** slow, about 50 BPM, B minor or ambiguous.
- **Don't** add fire sounds; the game plays them separately.

### 4 · Malli's Lullaby — needs lyrics
- **Feeling:** innocent, tender, heartbreaking.
- **Melody:** built on the **Kurinji motif**. Very simple, like something a village mother sings at bedtime.
- **Make two versions:**
  - **4a `music_04a_lullaby_sung`:** a solo voice, ideally a woman's (Malli's mother) or a child's, with only a soft veena or kalimba. Played once, in the prologue, as Malli dies.
  - **4b `music_04b_lullaby_hummed`:** the same melody **hummed, no words**. Used in Ch. V at her bush, and quietly during the final breaths.
- **Tempo / key:** about 60 BPM, D major, 3/4 or 6/8 (rocking feel).

### 5 · Iron Banners (tension)
- **Feeling:** a threat is arriving, and nobody has drawn a sword yet.
- **Build:** a steady low drum pulse, low brass, distant war horns, metal scrapes. The soundtrack of Dunkan's power. Restrained and menacing, not a battle.
- **Tempo / key:** about 80 BPM, B minor or D minor.
- Plays under dialogue, so leave room for voices.

### 6 · Staff and Stone (battle)
- **Feeling:** exciting, rhythmic, determined. A monk fighting with discipline, not rage.
- **Build:** driving thavil and taiko-style drums, mridangam rolls, a fast bansuri or nadaswaram lead, strings, hand claps or konnakol vocal rhythms (spoken drum syllables) are welcome. The motif can appear heroically in the middle.
- **Tempo / key:** 130–140 BPM, B minor.
- **Must loop perfectly**, because fights can last a long time.

### 7 · Brothers of Ash (Rudhra boss)
- **Feeling:** personal, tragic, fast. Two men who were brothers, fighting in the village they burned together.
- **Build:** like the battle track, but faster, with a **minor-key version of the motif** colliding with an aggressive theme for Rudhra. Strings and drums, maybe a hint of the Thennur choir.
- **Tempo / key:** about 150 BPM, B minor.

### 8a / 8b · The Iron King (Dunkan boss)
- **Feeling:** a final boss. Heavy, epic, oppressive. Iron grinding against nature.
- **8a, phase 1:** huge drums, low brass, **anvil and metal percussion** (iron is his symbol), a deep male choir chanting wordless syllables.
- **8b, phase 2:** the same piece, more intense. Faster-feeling rhythm, louder choir, the motif fighting back on bansuri over the chaos, like the flowers resisting.
- **Important:** 8a and 8b must have the **same tempo, key and loop length**, so the game can switch between them at any moment without a jump.
- **Tempo / key:** about 120 BPM, D minor or B minor.

### 9 · Protect What Blooms (sorrow)
- **Feeling:** grief, loss, quiet.
- **Build:** solo bansuri, cello or low strings, very sparse tanpura. A sad (Sivaranjani-colored) version of the motif. Silence is part of the music.
- **Tempo / key:** about 55 BPM, B minor.
- Plays under the Guru's last words, so keep it soft.

### 10 · A Chair, Not a Throne (the reign)
- **Feeling:** relief, hope, healing. Years passing, villages rebuilt, children laughing.
- **Build:** starts gentle after the battle, then grows warm and full. A major-key version of the motif with strings, veena and light percussion. A gentle swell at the end.
- **Tempo / key:** about 80 BPM, D major.

### 11 · When the Kurinji Blooms (epilogue)
- **Feeling:** peaceful acceptance. Bittersweet, beautiful, slow. An old man walking his last mile.
- **Build:** the main theme, slower and softer. Bansuri and strings, a gentle tanpura drone. It should feel like the end of a long day.
- **Tempo / key:** about 60 BPM, D major.
- Plays under the final goodbyes, so keep it soft.

### 12 · …It Bloomed (last breath)
- **Feeling:** the emotional climax of the whole game.
- **Structure:**
  - **0:00–0:15:** near-silence, only a faint tanpura drone. Aruvan has just died.
  - **0:15–0:40:** **a single bansuri plays the Kurinji motif, slowly and alone** (the lullaby returns).
  - **0:40–1:20:** strings and a wordless choir rise as the camera lifts and the whole mountain turns blue. A big but gentle swell.
  - **Final 20 s:** resolves softly into silence.
- **Tempo / key:** free / rubato, D major.

### 13 · Wait for Me, Kurinji (credits song) — needs lyrics
- **Feeling:** a farewell ballad that tells Aruvan's whole life. Players should feel it in their chest.
- **Build:** a bansuri intro with the motif, then a vocal (male or female) with veena and piano. Strings build through the choruses; the bridge quotes the lullaby; it ends with solo voice and one soft bell.
- **Tempo / key:** about 72 BPM, D major. The chorus melody should start with the motif.
- **Language:** the drafts below are in English. A **Tamil version** would suit the setting beautifully; keep the word "Kurinji" either way.

---

## 4. Lyrics (drafts you can change or translate)

### Malli's Lullaby
```
Kurinji, Kurinji, sleeping blue,
twelve long winters I'll wait for you.
Rain on the mountain, frost on the stone,
little flower, you're not alone.

Close your eyes now, close them slow,
under the snow the roots still grow.
Every winter, a little more kind —
leave the angry wind behind.

Kurinji, Kurinji, wake for me,
blue as the sky, blue as the sea.
```

### Wait for Me, Kurinji (credits song)
```
[Verse 1]
I was a fire with a soldier's name,
I learned to burn before I learned my shame.
A little hand held out a flower to me —
"Wait for it," she said, "and you'll be free."

[Chorus]
So I'll wait, I'll wait, through the long white years,
let the river wear the stones down from my fears,
and when the slopes turn blue as the evening sky,
I'll sit with you, Kurinji, and learn to say goodbye.

[Verse 2]
An old man gave me water, never asked my name,
he said the smoke can rise and leave the flame.
I held a staff for balance, not for blood,
until the iron came to burn the hills I loved.

[Chorus]
So I'll wait, I'll wait, through the long white years,
let the river wear the stones down from my fears,
and when the slopes turn blue as the evening sky,
I'll sit with you, Kurinji, and learn to say goodbye.

[Bridge — softly, the lullaby melody]
(Kurinji, Kurinji, sleeping blue,
twelve long winters I'll wait for you.)
I never wanted the crown — I left it on the floor.
I only wanted to be gentle. Nothing more.

[Final Chorus]
Now I've waited, waited, all the long white years,
and the river carried every stone of all my fears,
and the slopes are blue as the evening sky —
I'm here, Kurinji. Now I can say goodbye.
```

---

## 5. File specs

1. **Format:** `.ogg` (preferred) or `.mp3` at 320 kbps, 44.1 kHz, stereo. Please keep the WAV masters too.
2. **Loops must be seamless:** no fade-in or fade-out at the edges, cut on a bar line, and mix the reverb tail from the end back into the start. Tell me the BPM; I'll handle crossfades between tracks.
3. **Volume:** master every track to about **−16 LUFS integrated**, peaks below −1 dBTP, so battle music isn't much louder than exploration music. The songs (4 and 13) can go to about −14 LUFS.
4. **No sound effects baked in.** The game already plays fire, the temple bell, war horns, swords and heartbeats separately. (Lullaby instruments are fine.)
5. **Leave room for dialogue** in tracks 2, 5, 9 and 11: no lyrics, no busy lead melody in the voice range.
6. **Stay in the D major / B minor family**, as listed per track, so crossfades between tracks sound smooth.
7. **8a and 8b** must match exactly in tempo, key and loop length.
8. **Use the file names above.** Drop the files into `public/audio/` in the project, or just send them and I'll put them in place and wire each one to its scene.

### Optional extras (not songs)
If you also want to replace the built-in synthesized ambience, these loops (30–60 s each) would help a lot: mountain wind, village morning (birds, distant chatter, goats), night insects, rain and thunder, a crackling fire, and fortress wind with clanking chains. Just let me know if you'd like a full sound-effects list as well.
