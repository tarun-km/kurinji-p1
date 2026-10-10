/** Chapter-local assets: nothing is downloaded during a fight. */
export const CHAPTER_ASSETS = [
  { title: 'The Ash-Hound', art: '01', music: ['ash', 'lullaby', 'main_theme', 'sorrow', 'mountain'] },
  { title: 'The Mountain Remembers', art: '03', music: ['main_theme', 'mountain'] },
  { title: 'The Iron Envoy', art: '05', music: ['iron_banners', 'battle', 'mountain', 'sorrow'] },
  { title: 'The Bell Falls Silent', art: '06', music: ['mountain', 'battle', 'sorrow', 'iron_banners'] },
  { title: 'The Broken Gate', art: '07', music: ['iron_banners', 'battle', 'mountain'] },
  { title: 'A Flower in the Ash', art: '08', music: ['mountain', 'lullaby', 'rudhra', 'iron_banners', 'battle', 'sorrow'] },
  { title: 'The Empty Throne', art: '09', music: ['iron_banners', 'battle', 'dunkan', 'dunkan_rage', 'sorrow', 'reign', 'mountain'] },
  { title: "The King's Road", art: '11', music: ['mountain', 'reign', 'main_theme'], key: 'explore1' },
  { title: 'Seeds of the Bloom', art: '03', music: ['mountain', 'lullaby', 'main_theme'], key: 'explore2' },
  { title: 'The Peaceful Reign', art: '11', music: ['reign', 'mountain'] },
  { title: 'The Last Bloom', art: '12', music: ['bloom', 'lullaby', 'last_breath', 'credits', 'mountain'] },
]
// Function.name is minified in production; asset IDs must stay explicit.
const KEYS = ['prologue', 'ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'explore1', 'explore2', 'ch7', 'epilogue']
CHAPTER_ASSETS.forEach((chapter, i) => { chapter.key = KEYS[i] })
const CHAPTER_FRAMES = [[1, 2], [3, 4], [5], [6], [7], [8], [9, 10], [11], [3], [11], [12]]
CHAPTER_ASSETS.forEach((chapter, i) => { chapter.frames = CHAPTER_FRAMES[i] })

export const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()))

/** Bounded downloads and decodes protect low-memory devices during loading. */
export async function runTasks(tasks, progress = () => {}, concurrency = 4) {
  let next = 0, complete = 0
  let failure = null
  progress(0, tasks.length, 'Preparing the chapter')
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (!failure && next < tasks.length) {
      const task = tasks[next++]
      try { await task.run(); progress(++complete, tasks.length, task.label) }
      catch (error) { failure ||= error }
    }
  }))
  if (failure) throw failure
}

export async function fetchAsset(path, type = 'blob') {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${path}`, { signal: controller.signal })
    if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`)
    return await response[type]()
  } finally { clearTimeout(timer) }
}

export async function loadArtwork(number) {
  const image = new Image()
  image.src = `${import.meta.env.BASE_URL}art/story${number}.webp`
  await image.decode()
  return image
}
