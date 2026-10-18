import type { PoseTrack, Section } from './track'

/**
 * Tutorials and progress are stored in the browser (IndexedDB) on this device only.
 * Uploaded videos are kept so a tutorial can be reopened later; YouTube tutorials
 * store only the video id and the analysed poses.
 */

export type TutorialSource = { kind: 'file' } | { kind: 'youtube'; videoId: string }

export interface SectionProgress {
  /** Best "follow along" score. */
  follow?: number
  /** Best "from memory" score. */
  memory?: number
}

export interface Tutorial {
  id: string
  name: string
  createdAt: number
  source: TutorialSource
  track: PoseTrack
  sections: Section[]
  /** Show the teacher video mirrored. */
  flipped: boolean
  progress: Record<number, SectionProgress>
  /** Small JPEG data URL. */
  thumbnail?: string
}

/** Memory score at which a section counts as learned. */
export const MASTERED = 70

const DB = 'dancetrainer'
const TUTORIALS = 'tutorials'
const VIDEOS = 'videos'

let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(TUTORIALS, { keyPath: 'id' })
      req.result.createObjectStore(VIDEOS)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function run<T>(store: string, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const tx = (await db()).transaction(store, mode)
  const req = op(tx.objectStore(store))
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(req.result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function listTutorials(): Promise<Tutorial[]> {
  const all = await run<Tutorial[]>(TUTORIALS, 'readonly', (s) => s.getAll())
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

export const getTutorial = (id: string) => run<Tutorial | undefined>(TUTORIALS, 'readonly', (s) => s.get(id))

export async function saveTutorial(t: Tutorial, video?: Blob): Promise<void> {
  // Ask the browser not to evict our data under storage pressure (best effort).
  navigator.storage?.persist?.().catch(() => {})
  if (video) await run(VIDEOS, 'readwrite', (s) => s.put(video, t.id))
  await run(TUTORIALS, 'readwrite', (s) => s.put(structuredClone(t)))
}

export const getVideo = (id: string) => run<Blob | undefined>(VIDEOS, 'readonly', (s) => s.get(id))

export async function deleteTutorial(id: string): Promise<void> {
  await run(VIDEOS, 'readwrite', (s) => s.delete(id))
  await run(TUTORIALS, 'readwrite', (s) => s.delete(id))
}

/** Records a score if it beats the previous best. Returns the updated tutorial. */
export async function recordScore(
  t: Tutorial,
  section: number,
  mode: keyof SectionProgress,
  score: number,
): Promise<Tutorial> {
  const prev = t.progress[section]?.[mode] ?? 0
  if (score <= prev) return t
  const updated: Tutorial = { ...t, progress: { ...t.progress, [section]: { ...t.progress[section], [mode]: score } } }
  await run(TUTORIALS, 'readwrite', (s) => s.put(structuredClone(updated)))
  return updated
}

export const isMastered = (t: Tutorial, section: number) => (t.progress[section]?.memory ?? 0) >= MASTERED

export function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
