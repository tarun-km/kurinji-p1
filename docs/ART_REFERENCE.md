# Kurinji — The Last Bloom · Visual Reference

This guide covers every place, character, building, prop and effect in the game, so you can make reference art. Everything matches the game's real layout and scale, so your images will fit the world when the graphics are upgraded.

- **Hex colors** (like `#d9822b`) are the colors used in the game right now. Keep them for consistency, or change them; your reference images win.
- **Scale:** an adult is about 1.9 m tall in the game. All distances are in meters.
- **"Current build"** notes describe today's low-poly placeholder. **"Reference target"** is what we're aiming for.

---

## 0. Three decisions to make first

### A. Art style (pick one and use it in every image)
| Option | Feels like | Notes |
|---|---|---|
| **1. Stylized painterly (recommended)** | *Journey*, *Sky: Children of the Light*, *Firewatch* | Soft gradients, simple shapes, strong silhouettes, glowing light. Runs fast in a browser and is the easiest step up from what we have. |
| 2. Anime / cel-shaded | *Genshin Impact*, *Zelda: Breath of the Wild* | Outlined characters, bright colors. Expressive faces suit the emotional scenes. |
| 3. Stylized realism | *Ghost of Tsushima* | The most beautiful, but needs detailed 3D models and is heavy for a browser. |

### B. Cultural setting
The names (Aruvan, Thamarai, Ilan, Kaali, Nilakantha, Malli) are Tamil. The Kurinji flower (*Strobilanthes kunthiana*, which really does bloom once every 12 years) grows in the **Western Ghats / Nilgiris** of South India, around places like Munnar and Ooty. "Kurinji" is also the Tamil Sangam-poetry name for mountain country.

- **Recommended:** South Indian hill country. Rolling grassy mountains, pockets of dark shola forest, mist, tea-hill greens, Dravidian-style stone temple details, saffron monk robes.
- The current build mixes in **Himalayan** touches: tiered pagoda roofs and Tibetan prayer flags. Keep them for a fantasy blend, or replace them with South Indian equivalents: a gopuram-style stepped tower, brass oil lamps, mango-leaf garlands (*thoranam*) instead of flags.

### C. Overall color story
- **North (temple, rock):** sacred, cool, misty, blue-violet flowers, gold accents.
- **South (fortress):** iron, black stone, crimson banners, smoke, firelight.
- **Kurinji violet** (`#8a7cf0`) is the emotional color of the whole game. It shows up only on the flowers, the memory petals, Malli's flower and the player's special attack.

---

## 1. World map (one long mountain valley, high north to low south)

```
NORTH — high, cold, sacred                                  elevation
 ┌─ Meditation Rock ......... cliff edge, (20, -90)          ~51 m
 │
 ├─ Mountain Temple + Bell Tower ...... (0, -72) / (9, -66)  ~42 m
 │     │  winding dirt path, 6 stone lanterns
 │     │  hillsides covered in Kurinji shrubs
 ├─ KURINJI VILLAGE (square) .......... (0, 0)               ~30 m
 │     forge to the west (-13, 8) · training ground to the east (14, 10)
 │     │
 ├─ Palisade Gate ..................... (0, 46)              ~25 m
 │     │  open valley road, pine forest on both sides
 ├─ Ruins of THENNUR .................. (-8, 98)             ~18 m
 │     Malli's beam (-12, 104)
 │     │
 └─ DUNKAN'S FORTRESS ................. (0, 158)             ~14 m
       iron throne at the back wall (0, 170); mine pit in the east courtyard
SOUTH — low, warm, iron, smoke
```

- **Length:** about 260 m from the rock to the throne. The road drops about 37 m along the way.
- **Valley floor:** about 45 m wide. A dirt path snakes down the middle in gentle S-curves (about 7 m side to side).
- **Valley walls:** grassy slopes turn to grey rock, rising up to 70 m above the floor. Snow starts at roughly 62 to 76 m.
- **Horizon:** a ring of 26 huge distant peaks (90 to 210 m tall), blue-grey (`#5a6680`) with white snow caps, visible in every direction.

---

## 2. Landscape and nature

| Element | Reference target | Current build |
|---|---|---|
| **Grass** | Lush highland grass in two greens with soft wind ripple. Wildflowers near the village. | Flat-shaded `#5f8a3a` / `#3f6a2a` |
| **Dirt path** | Packed red-brown earth with stones and footprints, about 3 m wide, widening into plazas. | `#8a6a44` |
| **Rock** | Grey granite outcrops on the steep slopes, mossy at the base. | `#6e6a64` |
| **Snow** | Only on the high ridges, wind-swept. | `#eef2f6` |
| **Pine forest** | About 700 tall conifers (3 to 6 m) in clusters on the slopes. Kept clear of the path, buildings and the meditation rock. For the South Indian look, mix in eucalyptus and shola trees. | Cone trees, trunk `#4a3020` |
| **Grass tufts** | Thousands of small clumps everywhere. | `#7a9a44` |
| **Kurinji shrubs** | About 4,500 waist-high shrubs in big patches on the slopes between the temple and Thennur. **Two states:** (1) *Waiting*: dark green bushes with small closed violet buds. (2) *Bloom*: covered in blue-violet flower clusters, so whole hillsides turn blue-purple like a carpet. The bloom spreads outward from the meditation rock. | Shrub `#3a5a30`, flower `#8a7cf0` with a glow `#3a2a9a` |

### Sky, time of day and lighting
| Preset | Sky top | Horizon | Fog | Sunlight | Used in |
|---|---|---|---|---|---|
| **Dawn** | `#5b7fb8` | `#f3b98a` peach | `#e8c3a8` | warm `#ffc48a`, low sun | Ch. I opening |
| **Day** | `#3f7fd0` | `#bfdcf0` | `#c8dcea` | `#fff2dd`, high sun | Ch. I village, Ch. VII |
| **Dusk** | `#2b2550` violet | `#e0703a` orange | `#b0705a` | `#ff7a3a`, long shadows | Ch. II, Ch. V |
| **Night** | `#050818` | `#1a2440` | `#141c30` | moonlight `#9fb4ff`, fireflies | Ch. III, Dunkan phase 2 |
| **Memory** (prologue) | `#1a0505` | `#8a2a10` blood-red | `#4a1408` | fire `#ff5a20` | Prologue |
| **Storm** | `#2a2e38` | `#6a6a70` | `#5a5e66` | cold `#c8ccd8`, rain | Ch. IV, Ch. VI |
| **Bloom** | `#6a8fd8` | `#f7d2e8` pink | `#e6d6f0` lavender | `#fff0d8` | Epilogue, title screen |

---

## 3. Places

### 3.1 The Meditation Rock — the heart of the game
- **Where:** a cliff edge northeast of the temple, high above the valley. Trees are cleared within 18 m so the view is open.
- **Story:** Aruvan meditates here at dawn in Ch. I, and dies here at the end while the mountain blooms.
- **Look:** a single wide, flat, weathered grey boulder (about 4 m across, under 1 m tall) on short alpine grass. Behind it, the valley falls away into mist with the temple roofs visible.
- **Ending version:** Kurinji in full bloom all around, petals drifting in the air, soft pink-lavender light, Thamarai and Ilan standing nearby.
- **Current build:** squashed grey stone `#7a7470`.

### 3.2 The Mountain Temple
- **Where:** a flat terrace at (0, -72), facing south down the valley toward the village.
- **Story:** home of Guru Nilakantha and the monks. Raided in Ch. III, where the Guru dies on its steps.
- **Layout (current build):**
  - Two-level stone platform: 18 × 14 m base, 14 × 10 m upper level, color `#9a8f80`.
  - Five wide steps up the front.
  - Eight red pillars `#8a2a1a`, 4 m tall.
  - A cream-walled shrine hall `#d8c9a8`.
  - **Three stacked red roofs** that taper upward (pagoda style), topped with a gold spire.
  - Inside: a **golden seated meditating statue** with a soft glow.
  - Two strings of **prayer flags** (blue, white, red, green, yellow) fluttering across the courtyard.
- **Reference target:** worn, mossy stone and polished wooden floors. Brass oil lamps, incense smoke, flower offerings. Optionally a small gopuram-style stepped tower in place of the stacked roofs.
- **States:** peaceful dawn; burning at night (Ch. III, fires on the roof and courtyard); rainy with a monk sweeping the steps (Ch. VII).

### 3.3 The Bell Tower
- **Where:** right beside the temple at (9, -66).
- **Story:** Aruvan rings it every dawn. Ilan is told to ring it if the gate falls. The last thing old Aruvan does is ring it.
- **Look:** two dark wooden posts (4 m) with a crossbeam and a small red pyramid roof. Hanging from it is a large **bronze bell** (about 1.5 m tall, flared, greenish-bronze `#6a5a2a`) with a wooden striker log. Keep it simple and iconic.

### 3.4 The Lantern Path
- **Where:** the winding path from the temple down to the village.
- **Look:** six **stone lanterns** (about 1.7 m tall) in a zigzag along the path. Each is a stone pillar with a glowing amber lamp box `#ffc066` and a small pyramid cap. They glow warmly at dusk and night.

### 3.5 Kurinji Village
- **Where:** a wide circular clearing at (0, 0), about 24 m across, ringed by houses.
- **Mood:** warm, lived-in, peaceful. Smoke from cooking fires, laundry lines, chickens, goats.
- **The square:**
  - **Central well**, just off center: a round stone ring (2.4 m wide), two wooden posts and a small red pyramid roof.
  - **Three market stalls** with colored awnings (red `#b03a2a`, blue `#2a6ab0`, yellow `#c9a227`) and tables of oranges, red fruit and green fruit.
  - **Lantern posts** around the square and down toward the gate.
  - **Wooden crates and barrels** you can knock around, near the stalls and the gate road.

#### The village houses (11)
All houses share one style: **single-story, about 4 to 5.5 m wide, 3.5 to 4.5 m deep, 2.6 m walls.** Plastered walls in cream, sand or ivory (`#d8c4a0`, `#c8b08a`, `#e0d0b0`). Triangular roofs in terracotta or brown (`#7a3a22`, `#6a4a2a`, `#8a5a2a`). Dark wooden door `#3a2414`, a window that glows amber at night.
For the South Indian look: clay-tiled sloping roofs, a raised front porch (*thinnai*) with a wooden pillar, kolam patterns drawn in front of the door, mango-leaf garlands.

Suggested owners give each house its own character. These are optional, but they make good reference variety:

| # | Position (x, z) | Suggested identity | Distinctive details |
|---|---|---|---|
| 1 | (-14, -10) | **Thamarai's herb house** | Bundles of drying herbs, neem branches, clay pots, mortar and pestle on the porch |
| 2 | (-17, 2) | **Kaali's home** (next to the forge) | Soot-stained wall, her father's old forge beam with a hammer hanging on it |
| 3 | (-6, -16) | **Old Murugan's house** (the elder with the cough) | Rocking stool on the porch, a walking stick, potted tulsi plant |
| 4 | (8, -15) | **Weaver's house** | Dyed cloth hanging to dry in saffron, indigo and red |
| 5 | (16, -6) | **Potter's house** | Clay pots stacked outside, a potter's wheel |
| 6 | (18, 22) | **Shepherd's house** | Goat pen, wool, a bell on the door (the shepherds spotted Dunkan's riders) |
| 7 | (-18, 18) | **Rice granary** | Larger, raised on stilts, sacks of grain |
| 8 | (-6, 20) | **Tea house** | Benches outside, a steaming kettle, village gossip spot |
| 9 | (7, 19) | **Carpenter's workshop** | Wood shavings, half-carved birds (Ilan learns here) |
| 10 | (-24, -18) | **Beekeeper's house** | Hives; Kurinji honey is famous in real life |
| 11 | (24, -16) | **Village shrine house** | Small Murugan or Ganesha shrine, oil lamps, flowers |

### 3.6 Kaali's Forge
- **Where:** west side of the village at (-13, 8).
- **Look:** an open-sided work area under a slanted wooden awning (5 × 3.5 m) on four posts.
  - A round **stone furnace** (about 2 m wide) with **glowing orange coals** on top.
  - A black iron **anvil**, tongs, buckets of quench water.
  - Racks of tools and, later, ploughs.
  - Flickering orange light and sparks.

### 3.7 The Training Ground
- **Where:** east side of the village at (14, 10).
- **Look:** a packed-dirt square with **four straw training dummies**: tan burlap bodies (`#c9a86a`) on posts, roughly human-shaped, patched and battered. Add a weapon rack with wooden staves.

### 3.8 The Palisade Gate
- **Where:** across the whole valley at z = 46, below the village.
- **Story:** the big defense battle in Ch. IV; the gate is broken by a battering ram.
- **Look:**
  - A wall of **sharpened vertical logs** (each 4 to 4.8 m tall with pointed tips) running about 68 m across the valley.
  - In the middle, **two square wooden watchtowers** (7 m tall) with red pyramid caps.
  - Between them, **double wooden doors** (each 3 m wide, 4.2 m tall) made of dark planks (`#4a2c18`) with iron bands, which swing inward.
- **Reference target:** add a walkway behind the wall, torches, and spears leaning against it. Show it intact and shattered.

### 3.9 The Valley Road (gate to Thennur)
- **Look:** the path winds down through open meadow with pine forest on both sides. Boulders, a fallen tree, maybe a small stone bridge over a stream (optional, not in the game yet). This is the "journey" stretch, and it's where several hidden memory petals sit.

### 3.10 The Ruins of Thennur
- **Where:** a lower plateau at (-8, 98), about 32 m across.
- **Story:** the village Veeran burned 24 years before the bloom. Malli died here.
- **Look:** seven ruined houses, the same shape as the Kurinji houses but **charred black** (`#2a2420`). Roofs have collapsed or slid off, walls are broken. Weeds and grass have grown back over the ash.
- **Malli's spot** (-12, 104): a **fallen black roof beam** (about 3.6 m long) lying at an angle. In Ch. V, a **single Kurinji bush blooms out of season** right where she lay, glowing violet. It's the only color in the ruins.
- **Two states:**
  1. **Burning (prologue):** every house on fire, blood-red sky, rising embers, smoke.
  2. **Ashen ruins (Ch. V):** dusk, quiet, overgrown, the one glowing bush.
- **Ch. VII:** rebuilt, with new houses, villagers and soldiers laying stones.

### 3.11 Dunkan's Fortress
- **Where:** at the bottom of the valley, (0, 158), on a slight rise.
- **Story:** courtyard battle, then the throne-room duel with Dunkan. Later turned into Thamarai's house of healing.
- **Layout (current build):**
  - **Dark stone walls**, 7 m tall (`#3a3638`) with battlements, enclosing an open courtyard about 44 m wide and 30 m deep.
  - **The gate** is an 8 m gap in the middle of the front wall, between two towers.
  - **Six round towers** (11 m tall, darker stone `#2a2628`) at the corners and the gate, with **dark red cone roofs** (`#4a0a0a`) and long **crimson banners** (`#8a0a0a`).
  - **Four iron braziers** with roaring fires in the courtyard.
  - **The mine pit** in the east courtyard: a dark, scarred hole in the ground. Dunkan's iron greed made visible.
  - **The throne dais** at the back: three dark stone steps.
  - **The Iron Throne:** black metal (`#1a1a1e`), a tall slab back (3.4 m) crowned with **five gold spikes**. Brutal, heavy, cold.
- **Reference target:** a fortress that feels like it was built to intimidate. Chains, iron spikes, slag heaps, smoke from the mines.
- **Peaceful version (Ch. VII):** banners taken down, herbs drying on the walls, gates open, sick people being cared for in the courtyard, the throne sitting empty.

---

## 4. Characters

For each character, please make a **full-body turnaround** (front, side, back) on a plain background, standing in a relaxed neutral pose. A face close-up helps a lot for the main cast.

**Relative heights:** adults about 1.9 m (1.0×) · Guru 0.94× · Thamarai 0.92× · children about 0.62× · Brute soldier 1.2× and bulky · **Dunkan 1.25× and very broad**.

### 4.1 Aruvan, the monk (protagonist)
- **Ages:** 32 as Veeran (prologue) · **44 as the monk** (Ch. I–VI) · 56 as the old king (epilogue).
- **Build:** lean, wiry, strong shoulders, upright posture. Calm, heavy eyes.
- **Skin:** warm brown `#8a5a3c`.
- **Hair:** **shaved head**, short **black beard**. The beard turns long and white in the epilogue.
- **Monk outfit (main look):**
  - **Saffron robe** `#d9822b` with a darker saffron sash `#b8661d` crossing the chest diagonally over one shoulder.
  - The robe skirt falls to the knees. Bare arms, simple sandals.
  - Maybe prayer beads around his wrist (a gift from the Guru).
- **Weapon:** a plain **wooden staff** about 2 m long (`#6e4a2a`) with **brass caps** on both ends. From Ch. IV, the caps are **iron**, made from Kaali's father's melted sword.
- **Silhouette key:** the staff held vertically, robe flaring out at the knees.
- **Variants to draw:**
  1. **Veeran, the Ash-Hound (prologue):** dark steel armor `#4a4a52` over blood-dark cloth `#3b0f0f`, a pointed helmet with a **red plume**, a **red cape** `#6b0f0f`, a sword. Hard, haunted face, younger.
  2. **Aruvan the monk:** see above.
  3. **King Aruvan (Ch. VII):** the same saffron robe, maybe a simple white shawl. **He never wears the crown.**
  4. **Old Aruvan (epilogue):** faded saffron `#c97a2e`, long white beard `#e8e4dc`, thin and slightly stooped, no staff, peaceful face.

### 4.2 Malli, the child of Thennur
- **Age:** 7.
- **Look:** small and thin. Long black hair, slightly messy. A plain undyed cotton dress `#b5a78a` (beige), barefoot. Big eyes.
- **Prop:** a **single Kurinji flower** (a small stem with a violet glowing bloom) that she gives to Veeran.
- **Key scenes:** lying under a fallen beam in the burning village; in the epilogue, a ghostly echo of her voice. A faint translucent "spirit" version could be drawn too.

### 4.3 Guru Nilakantha, the blind abbot
- **Age:** about 78.
- **Look:** small, frail, but serene and dignified. **Bald**, with a **long white beard** `#f2f2f2`. **Clouded, pale eyes** (he is blind). Skin `#7a5236`.
- **Clothing:** an **off-white / cream robe** `#e8d9b5`, simple and layered. Optionally a wooden walking stick and prayer beads.
- **Personality in pose:** hands folded, head tilted as if listening. Often seated cross-legged.

### 4.4 Thamarai, the healer
- **Age:** about 21 in the main story, about 33 in the epilogue.
- **Backstory:** washed down the flooded river as a 9-year-old girl; Aruvan caught her.
- **Look:** slim, quick, sharp-eyed, expressive. **Long black hair** in a braid. Skin `#9a6644`.
- **Clothing:** a **deep green top** `#2f7a5f` with a **plum / maroon** wrap skirt or half-sari `#7a2f4f`. Herb pouches on her belt, sleeves rolled up.
- **Props:** a woven herb basket, a satchel of bitter herbs.
- **Epilogue:** a little older, the first streaks of grey in her hair, a healer's shawl.

### 4.5 Ilan, the orphan boy
- **Age:** 9 in the main story; about 19 to 21 later.
- **Look (child):** small and energetic. Short black hair, big grin, scraped knees. **Mustard-yellow shirt** `#c9a227`, brown shorts `#4a3a2a`, barefoot.
- **Prop:** a **hand-carved wooden kingfisher** (he carves birds; his father freed songbirds from the king's gardens).
- **Look (adult, Ch. VII and epilogue):** tall and gentle, short black beard, the same yellow colors as a teacher's shawl. Surrounded by children holding wooden birds.

### 4.6 Kaali, the blacksmith
- **Age:** about 38.
- **Look:** **broad, muscular**, with burn scars on her forearms. **Long black hair** tied back. Darker skin `#6e452c`. A stern face that softens rarely.
- **Clothing:** a **rust-brown** work top `#5a2a1a`, charcoal trousers `#2a2a2a`, a heavy leather apron.
- **Weapon:** a big **war hammer** (1.7 m handle, iron head).
- **Backstory detail:** her father was hanged from his own forge beam for refusing to make Dunkan's swords.

### 4.7 Commander Rudhra, the last Hound (rival)
- **Age:** 32 in the prologue, 44 in the main story.
- **Look:** tall, lean, predatory, with a cocky half-smile. **Long black hair**, **black beard**. Skin `#8a5a3c`.
- **Clothing:** **black-blue armor** `#2c2c3a` over black cloth, a long **dark purple cape** `#3a0a4a`.
- **Weapon:** a single sword. He fights fast and lunges.
- **Variants:**
  1. **Young Rudhra (prologue):** clean-shaven, short hair, the same armor style.
  2. **Commander:** see above.
  3. **The penitent (if spared, Ch. VII):** plain brown-grey robes `#6a5a4a`, no armor or cape, sweeping the temple steps in the rain.
  4. **Old Rudhra (epilogue):** grey hair and beard, the same plain robes.

### 4.8 King Dunkan, the Iron King (final boss)
- **Age:** about 40 in the prologue, 52 in the main story.
- **Look:** **huge**: 1.25× taller and much broader than anyone else. Heavy jaw, cold eyes. **Grey hair**, **grey beard**. Paler skin `#a0785a`.
- **Clothing:** **black plate armor** `#1e1e22` over dark crimson cloth, a long **crimson cape** `#7a0a0a`.
- **Crown:** a **gold band with seven spikes**.
- **Weapon:** an enormous **greatsword** (blade about 1.5 m).
- **Personality:** contemptuous, theatrical, wounded underneath. As a boy, his father left him in the snow for crying.
- **Also draw:** seated on the Iron Throne; kneeling, defeated.

### 4.9 Senthil, the young conscript
- **Age:** 16.
- **Look:** a soldier's grey armor but **no helmet**, messy black hair, a terrified boyish face.
- **Later (Ch. VII):** a village builder in simple clothes, laying the first stone in Thennur.

### 4.10 Dunkan's army
| Type | Look | Weapon |
|---|---|---|
| **Soldier** | Grey steel armor `#55555e` over a dark tunic `#2a2a30`, a **conical helmet with a red plume** `#8b1a1a` | Sword |
| **Captain** | The soldier's armor plus a **gold plume** and a **short red cape** | Sword, more aggressive |
| **Brute** | **Massive** (1.2× and very bulky), dark armor `#3a3036`, dark helmet, slow | Big war hammer |
All soldiers share a unifying symbol, for example an iron-fist or anvil sigil on the chest and banners.

### 4.11 Villagers and children
- **Villagers** (several variations): men and women of different ages. Simple cotton clothes in **mustard, teal, plum, olive and sienna** (`#8a6f3a`, `#3a6f8a`, `#8a3a5a`, `#5a7a3a`, `#a0522d`). Some with long hair, some short.
- **Children (Ch. VII):** five kids in bright shirts (red, blue, green, yellow, purple), sitting cross-legged around adult Ilan.

---

## 5. Props and weapons
| Prop | Description |
|---|---|
| Aruvan's staff | 2 m wood, brass caps (later iron caps) |
| Veeran's / soldiers' sword | Straight steel blade, about 0.9 m, simple crossguard |
| Dunkan's greatsword | About 1.5 m blade, black hilt |
| War hammer (Kaali, Brutes) | 1.7 m handle, block-shaped iron head |
| Dunkan's crown | Gold band with 7 spikes |
| Temple bell | 1.5 m bronze bell with a wooden striker |
| Stone lantern | 1.7 m pillar, glowing lamp box, pyramid cap |
| Crates and barrels | Wooden supply crates (1 m cube) and banded barrels |
| Falling boulders | Grey rocks that rain down during Dunkan's phase 2 |
| **Memory petal (collectible)** | A small **five-petal Kurinji blossom**, violet `#a494ff` and glowing, floating and slowly spinning. 12 are hidden in the world. |
| Malli's flower | One Kurinji stem with a single glowing violet bloom |
| Wooden birds | Ilan's hand-carved birds (kingfisher, sparrow, mynah) |
| Prayer flags / mango-leaf garlands | Depending on the cultural choice in section 0 |
| Iron Throne | See 3.11 |

## 6. Effects
| Effect | Look |
|---|---|
| Fire and embers | Orange-yellow flames with sparks rising (Thennur, temple raid, braziers) |
| **Kurinji Breath** (player special) | A burst of **violet petals** and a violet shockwave ring around Aruvan |
| Dunkan's quake | An **orange-red** shockwave ring and dust, boulders falling |
| Attack warning | A **red glowing area on the ground** before enemy heavy attacks and lunges |
| Hit sparks | Short golden sparks on impact |
| Falling petals | Soft violet motes drifting through the air (epilogue, title screen) |
| Fireflies | Tiny yellow-green lights at night near the temple |
| Objective marker | A floating **gold diamond** with a faint vertical light beam |

## 7. Key moments (the most valuable reference images)
If you only make a few environment images, make these. Each sets the mood for a whole chapter.
1. **Thennur burning:** Veeran walking through fire under a red sky (prologue).
2. **Malli's last moment:** Veeran kneeling, holding the dying girl as she offers the flower.
3. **Dawn meditation:** Aruvan on the rock above a misty valley, the temple below (Ch. I).
4. **The village at morning:** the square, the well, stalls, people (Ch. I).
5. **The Iron Envoy:** Rudhra and soldiers marching into the village at dusk (Ch. II).
6. **The Guru's death:** the burning temple at night, Aruvan holding the Guru (Ch. III).
7. **Battle at the gate:** the storm, the broken palisade, villagers with staves (Ch. IV).
8. **The bush in the ruins:** ashen Thennur, a single glowing Kurinji bush (Ch. V).
9. **Dunkan on the Iron Throne:** the storm-lit fortress (Ch. VI).
10. **The empty throne:** Aruvan refusing the crown (Ch. VI end).
11. **The peaceful reign:** rebuilt Thennur, Ilan teaching children (Ch. VII).
12. **The last bloom:** the whole mountain blue-violet, old Aruvan meditating on the rock (epilogue). **This is the game's poster image.**

## 8. Interface (optional)
- **Fonts:** *Cinzel* for titles and labels, *Cormorant Garamond* for dialogue and story text.
- **Colors:** gold `#e8b46a`, saffron `#f0a54a`, Kurinji violet `#a494ff`, parchment `#f4ead8`, ink `#0d0a08`, blood red `#c8402a`.
- **Mood:** elegant and minimal, like a storybook. Dark translucent panels with thin gold lines.

---

## 9. What to send back, and how
1. **One image per character variant** (front, side and back on a plain background), named like `char_aruvan_monk.png`, `char_veeran.png`, `char_dunkan.png`.
2. **One sheet per place**: a wide establishing view plus 2 or 3 close-ups of details, named like `place_temple.png`, `place_thennur_burning.png`.
3. **A color palette swatch** for each time of day, if you change the colors.
4. **Props** on one sheet: `props.png`.
5. **Keep one style and one lighting approach** across everything, so the game looks unified.
6. Add a **height line** or a 1.9 m person next to buildings, so the scale stays right.

**Minimum set if time is short:** Aruvan (monk), Dunkan, a soldier, the temple, a village house plus the square, and the final bloom scene.
