type StoredRecord = {
  key: string
  value: unknown
  updatedAt: number
}

const DB_NAME = 'ps2'
const DB_VERSION = 1
const STORE_NAME = 'kv'

function isBrowser() {
  return typeof window !== 'undefined'
}

function canUseIndexedDb() {
  return isBrowser() && typeof indexedDB !== 'undefined'
}

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function openDb(): Promise<IDBDatabase> {
  return await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<unknown>,
): Promise<T> {
  const db = await openDb()
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode)
    const store = tx.objectStore(STORE_NAME)
    const request = fn(store)
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
    tx.onerror = () => {
      reject(tx.error ?? request.error)
      db.close()
    }
  })
}

async function idbGet<T>(key: string): Promise<T | null> {
  const record = await withStore<StoredRecord | undefined>('readonly', (store) =>
    store.get(key) as unknown as IDBRequest<unknown>,
  )
  return (record?.value as T) ?? null
}

async function idbSet(key: string, value: unknown): Promise<void> {
  await withStore<IDBValidKey>('readwrite', (store) =>
    store.put({ key, value, updatedAt: Date.now() } satisfies StoredRecord) as unknown as IDBRequest<unknown>,
  )
}

async function idbRemove(key: string): Promise<void> {
  await withStore<undefined>('readwrite', (store) => store.delete(key) as unknown as IDBRequest<unknown>)
}

async function idbClear(): Promise<void> {
  await withStore<undefined>('readwrite', (store) => store.clear() as unknown as IDBRequest<unknown>)
}

async function idbExportAll(): Promise<Record<string, unknown>> {
  const db = await openDb()
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()
    request.onsuccess = () => {
      const rows = (request.result as StoredRecord[]) ?? []
      const out: Record<string, unknown> = {}
      for (const row of rows) out[row.key] = row.value
      resolve(out)
    }
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
    tx.onerror = () => {
      reject(tx.error ?? request.error)
      db.close()
    }
  })
}

function lsGet<T>(key: string): T | null {
  if (!isBrowser()) return null
  return safeJsonParse<T>(window.localStorage.getItem(key))
}

function lsSet(key: string, value: unknown) {
  if (!isBrowser()) return
  window.localStorage.setItem(key, JSON.stringify(value))
}

function lsRemove(key: string) {
  if (!isBrowser()) return
  window.localStorage.removeItem(key)
}

function lsExportAll(prefix: string): Record<string, unknown> {
  if (!isBrowser()) return {}
  const out: Record<string, unknown> = {}
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i)
    if (!k) continue
    if (!k.startsWith(prefix)) continue
    out[k] = safeJsonParse(window.localStorage.getItem(k))
  }
  return out
}

const LS_PREFIX = 'ps2:'

export async function storageGet<T>(key: string, fallback: T): Promise<T> {
  const fullKey = `${LS_PREFIX}${key}`
  if (!isBrowser()) return fallback

  if (canUseIndexedDb()) {
    try {
      const v = await idbGet<T>(fullKey)
      return v ?? fallback
    } catch {
      const v = lsGet<T>(fullKey)
      return v ?? fallback
    }
  }

  const v = lsGet<T>(fullKey)
  return v ?? fallback
}

export async function storageSet<T>(key: string, value: T): Promise<void> {
  const fullKey = `${LS_PREFIX}${key}`
  if (!isBrowser()) return

  if (canUseIndexedDb()) {
    try {
      await idbSet(fullKey, value)
      return
    } catch {
      lsSet(fullKey, value)
      return
    }
  }

  lsSet(fullKey, value)
}

export async function storageRemove(key: string): Promise<void> {
  const fullKey = `${LS_PREFIX}${key}`
  if (!isBrowser()) return

  if (canUseIndexedDb()) {
    try {
      await idbRemove(fullKey)
    } catch {
      lsRemove(fullKey)
    }
    return
  }

  lsRemove(fullKey)
}

export async function storageClearAll(): Promise<void> {
  if (!isBrowser()) return

  if (canUseIndexedDb()) {
    try {
      await idbClear()
    } catch {
      await Promise.resolve()
    }
  }

  const keys: string[] = []
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i)
    if (k && k.startsWith(LS_PREFIX)) keys.push(k)
  }
  for (const k of keys) window.localStorage.removeItem(k)
}

export async function storageExportAll(): Promise<Record<string, unknown>> {
  if (!isBrowser()) return {}
  const out: Record<string, unknown> = {}

  if (canUseIndexedDb()) {
    try {
      const idb = await idbExportAll()
      for (const [k, v] of Object.entries(idb)) {
        if (k.startsWith(LS_PREFIX)) out[k.slice(LS_PREFIX.length)] = v
      }
      return out
    } catch {
      await Promise.resolve()
    }
  }

  const ls = lsExportAll(LS_PREFIX)
  for (const [k, v] of Object.entries(ls)) out[k.slice(LS_PREFIX.length)] = v
  return out
}
