import type { Chapter, Chunk } from '../pdf/types'
import type { CleanStats } from '../pdf/clean'

export interface BookRecord {
  id: string
  title: string
  author: string | null
  pageCount: number
  wordCount: number
  addedAt: number
  chunks: Chunk[]
  chapters: Chapter[]
  stats: CleanStats
}

export interface ProgressRecord {
  bookId: string
  chunkIndex: number
  updatedAt: number
}

export interface AudioRecord {
  key: string
  blob: Blob
  createdAt: number
}

const DB_NAME = 'audiobook-reader'
const DB_VERSION = 1

export const STORES = {
  books: 'books',
  files: 'files',
  progress: 'progress',
  audio: 'audio',
  settings: 'settings',
} as const

let dbPromise: Promise<IDBDatabase> | null = null

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORES.books)) db.createObjectStore(STORES.books, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORES.files)) db.createObjectStore(STORES.files)
      if (!db.objectStoreNames.contains(STORES.progress)) {
        db.createObjectStore(STORES.progress, { keyPath: 'bookId' })
      }
      if (!db.objectStoreNames.contains(STORES.audio)) db.createObjectStore(STORES.audio, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(STORES.settings)) db.createObjectStore(STORES.settings)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open the local database'))
  })
  return dbPromise
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode)
        const request = action(transaction.objectStore(store))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error(`${store} request failed`))
      }),
  )
}

export const idb = {
  get: <T>(store: string, key: IDBValidKey) => run<T | undefined>(store, 'readonly', (s) => s.get(key)),
  getAll: <T>(store: string) => run<T[]>(store, 'readonly', (s) => s.getAll()),
  put: <T>(store: string, value: T, key?: IDBValidKey) =>
    run<IDBValidKey>(store, 'readwrite', (s) => (key === undefined ? s.put(value) : s.put(value, key))),
  delete: (store: string, key: IDBValidKey) => run<undefined>(store, 'readwrite', (s) => s.delete(key)),
  clear: (store: string) => run<undefined>(store, 'readwrite', (s) => s.clear()),
}

export async function listBooks(): Promise<BookRecord[]> {
  const books = await idb.getAll<BookRecord>(STORES.books)
  return books.sort((a, b) => b.addedAt - a.addedAt)
}

export async function saveBook(book: BookRecord, file: Blob): Promise<void> {
  await idb.put(STORES.books, book)
  await idb.put(STORES.files, file, book.id)
}

export async function deleteBook(id: string): Promise<void> {
  await idb.delete(STORES.books, id)
  await idb.delete(STORES.files, id)
  await idb.delete(STORES.progress, id)
  await deleteAudioForBook(id)
}

export function getBook(id: string): Promise<BookRecord | undefined> {
  return idb.get<BookRecord>(STORES.books, id)
}

export function getProgress(bookId: string): Promise<ProgressRecord | undefined> {
  return idb.get<ProgressRecord>(STORES.progress, bookId)
}

export function saveProgress(bookId: string, chunkIndex: number): Promise<IDBValidKey> {
  return idb.put<ProgressRecord>(STORES.progress, { bookId, chunkIndex, updatedAt: Date.now() })
}

export function getSetting<T>(key: string): Promise<T | undefined> {
  return idb.get<T>(STORES.settings, key)
}

export function setSetting<T>(key: string, value: T): Promise<IDBValidKey> {
  return idb.put(STORES.settings, value, key)
}

/** Cached synthesized audio is keyed by book so it can be evicted with the book. */
export async function deleteAudioForBook(bookId: string): Promise<void> {
  const records = await idb.getAll<AudioRecord>(STORES.audio)
  await Promise.all(
    records.filter((record) => record.key.startsWith(`${bookId}:`)).map((record) => idb.delete(STORES.audio, record.key)),
  )
}

export async function audioCacheSize(): Promise<number> {
  const records = await idb.getAll<AudioRecord>(STORES.audio)
  return records.reduce((total, record) => total + record.blob.size, 0)
}

export async function listProgress(): Promise<Record<string, ProgressRecord>> {
  const records = await idb.getAll<ProgressRecord>(STORES.progress)
  return Object.fromEntries(records.map((record) => [record.bookId, record]))
}
