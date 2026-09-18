import { STORES, getSetting, idb, setSetting } from './db'

/**
 * A book's own voice lives in the settings store under one key per book rather
 * than in an object store of its own: the value is a single voice id, and the
 * settings store already accepts arbitrary keys, so this needs no schema change.
 */
const KEY_PREFIX = 'voice:'

interface BookVoiceRecord {
  voiceId: string
  /** Kept so a future cleanup pass can tell an abandoned record from a live one. */
  updatedAt: number
}

export function bookVoiceKey(bookId: string): string {
  return `${KEY_PREFIX}${bookId}`
}

/** The voice this book was last read in, or null when it has never had one of its own. */
export async function readBookVoice(bookId: string): Promise<string | null> {
  const stored = await getSetting<unknown>(bookVoiceKey(bookId))
  return isBookVoiceRecord(stored) ? stored.voiceId : null
}

export async function writeBookVoice(bookId: string, voiceId: string): Promise<void> {
  await setSetting<BookVoiceRecord>(bookVoiceKey(bookId), { voiceId, updatedAt: Date.now() })
}

/** Drops the book's own voice, so it follows the default again. */
export async function clearBookVoice(bookId: string): Promise<void> {
  await idb.delete(STORES.settings, bookVoiceKey(bookId))
}

// Records written by an older build — or a key a user's data has outlived — are
// treated as "no voice" rather than trusted into the player.
function isBookVoiceRecord(value: unknown): value is BookVoiceRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { voiceId?: unknown }).voiceId === 'string'
  )
}
