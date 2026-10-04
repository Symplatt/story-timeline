const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto')
const { Store } = require('../electron/store.cjs')
const timeline = () => ({
  id: randomUUID(),
  title: '合成作品',
  nodes: [],
  characters: [],
  updatedAt: new Date().toISOString(),
})
async function fixture(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xushi-test-'))
  try {
    await fn(new Store(dir), dir)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}
test('separate documents and settings persist across process-like reopen', () =>
  fixture(async (store, dir) => {
    const t = timeline()
    await store.save(t)
    await store.settings({
      theme: 'gold',
      dateFormat: 'chinese',
      visibleTime: [false, true, true, false, true],
    })
    const reopened = new Store(dir),
      loaded = await reopened.load()
    assert.equal(loaded.timelines[0].id, t.id)
    assert.equal(loaded.settings.dateFormat, 'chinese')
    assert.deepEqual(await reopened.read(t.id), t)
  }))
test('parallel saves serialize without losing documents', () =>
  fixture(async (store) => {
    await Promise.all(Array.from({ length: 30 }, () => store.save(timeline())))
    assert.equal((await store.load()).timelines.length, 30)
  }))
test('a corrupt document recovers its parseable backup and retains damaged original', () =>
  fixture(async (store, dir) => {
    const t = timeline()
    await store.save(t)
    await store.save({ ...t, title: 'new' })
    await fs.writeFile(store.file(t.id), '{broken')
    assert.equal((await store.read(t.id)).title, t.title)
    assert.ok((await fs.readdir(dir)).some((f) => f.includes('.damaged-')))
  }))
test('unrecoverable corruption blocks overwriting the original', () =>
  fixture(async (store) => {
    const t = timeline()
    await store.save(t)
    await fs.writeFile(store.file(t.id), '{broken')
    await assert.rejects(store.read(t.id))
    await assert.rejects(store.save(t))
    assert.equal(await fs.readFile(store.file(t.id), 'utf8'), '{broken')
  }))
test('an orphan document is recovered into the catalog', () =>
  fixture(async (store) => {
    const t = timeline()
    await store.write(t.id, t)
    assert.equal((await store.load()).timelines[0].id, t.id)
  }))
test('import capacity and duplicate validation happen before writes', () =>
  fixture(async (store) => {
    const ts = Array.from({ length: 1000 }, timeline)
    await store.importMany(ts)
    await assert.rejects(store.save(timeline()), /1000/)
    assert.equal((await store.load()).timelines.length, 1000)
  }))
test('delete does not resurrect from backup on reload', () =>
  fixture(async (store, dir) => {
    const t = timeline()
    await store.save(t)
    await store.save({ ...t, title: 'new' })
    await store.remove(t.id)
    assert.equal((await new Store(dir).load()).timelines.length, 0)
  }))
test('path traversal is rejected', () =>
  fixture(async (store) => {
    assert.throws(() => store.file('../evil'))
    await assert.rejects(store.save({ ...timeline(), id: '../evil' }))
  }))
