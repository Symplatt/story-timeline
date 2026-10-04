import { summary, type Timeline, type Summary, type Settings } from './model'
let db: IDBDatabase
async function database() {
  if (db) return db
  db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('xushi-library', 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('timelines', { keyPath: 'id' })
      req.result.createObjectStore('metadata')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return db
}
async function transaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  action: (tx: IDBTransaction) => IDBRequest<T> | undefined,
): Promise<T> {
  const databaseInstance = await database()
  return new Promise((resolve, reject) => {
    const tx = databaseInstance.transaction(stores, mode)
    const req = action(tx)
    tx.oncomplete = () => resolve(req?.result as T)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('保存中断'))
  })
}
export const storage = {
  async load(): Promise<{
    timelines: Summary[]
    settings: Partial<Settings>
    recovered?: boolean
  }> {
    if (window.desktop) return window.desktop.load()
    const index = await transaction(['metadata'], 'readonly', (tx) =>
      tx.objectStore('metadata').get('index'),
    )
    return index || { timelines: [], settings: {} }
  },
  async read(id: string): Promise<unknown> {
    return window.desktop
      ? window.desktop.read(id)
      : transaction(['timelines'], 'readonly', (tx) => tx.objectStore('timelines').get(id))
  },
  async save(t: Timeline) {
    if (window.desktop) return window.desktop.save(t)
    await transaction(['timelines', 'metadata'], 'readwrite', (tx) => {
      tx.objectStore('timelines').put(t)
      const req = tx.objectStore('metadata').get('index')
      req.onsuccess = () => {
        const index = req.result || { timelines: [], settings: {} }
        const at = index.timelines.findIndex((x: Summary) => x.id === t.id)
        if (at < 0) {
          if (index.timelines.length >= 1000) {
            tx.abort()
            return
          }
          index.timelines.push(summary(t))
        } else index.timelines[at] = summary(t)
        tx.objectStore('metadata').put(index, 'index')
      }
      return undefined
    })
  },
  async settings(s: Settings) {
    if (window.desktop) return window.desktop.settings(s)
    await transaction(['metadata'], 'readwrite', (tx) => {
      const req = tx.objectStore('metadata').get('index')
      req.onsuccess = () => {
        const index = req.result || { timelines: [], settings: {} }
        index.settings = s
        tx.objectStore('metadata').put(index, 'index')
      }
      return undefined
    })
  },
  async remove(id: string) {
    if (window.desktop) return window.desktop.remove(id)
    await transaction(['timelines', 'metadata'], 'readwrite', (tx) => {
      tx.objectStore('timelines').delete(id)
      const req = tx.objectStore('metadata').get('index')
      req.onsuccess = () => {
        const index = req.result
        index.timelines = index.timelines.filter((s: Summary) => s.id !== id)
        tx.objectStore('metadata').put(index, 'index')
      }
      return undefined
    })
  },
  async importMany(timelines: Timeline[]) {
    if (window.desktop) return window.desktop.importMany(timelines)
    await transaction(['timelines', 'metadata'], 'readwrite', (tx) => {
      const req = tx.objectStore('metadata').get('index')
      req.onsuccess = () => {
        const index = req.result || { timelines: [], settings: {} }
        if (index.timelines.length + timelines.length > 1000) {
          tx.abort()
          return
        }
        for (const t of timelines) {
          tx.objectStore('timelines').add(t)
          index.timelines.push(summary(t))
        }
        tx.objectStore('metadata').put(index, 'index')
      }
      return undefined
    })
  },
}
