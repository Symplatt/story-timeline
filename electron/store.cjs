const fs = require('node:fs/promises')
const path = require('node:path')
const validId = (id) => typeof id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(id)

class Store {
  constructor(directory) {
    this.directory = directory
    this.queue = Promise.resolve()
    this.blocked = new Set()
  }
  file(key) {
    if (!validId(key)) throw new Error('无效的数据标识')
    return path.join(this.directory, key + '.json')
  }
  async read(key, fallback) {
    const file = this.file(key)
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT') return fallback
      // Never replace a corrupt original with an empty library. Restore only a
      // parseable backup and report recovery to the renderer.
      try {
        const recovered = JSON.parse(await fs.readFile(file + '.bak', 'utf8'))
        await fs.copyFile(file, file + '.damaged-' + Date.now())
        await fs.copyFile(file + '.bak', file)
        this.recovered = true
        return recovered
      } catch {
        this.blocked.add(key)
        throw new Error('本地文件损坏，原文件已保留。请从 JSON 备份恢复。')
      }
    }
  }
  async write(key, value) {
    if (this.blocked.has(key)) throw new Error('损坏文件已锁定，未覆盖原始数据')
    await fs.mkdir(this.directory, { recursive: true })
    const file = this.file(key),
      temp = file + '.tmp'
    const handle = await fs.open(temp, 'w')
    try {
      await handle.writeFile(JSON.stringify(value), 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    try {
      await fs.copyFile(file, file + '.bak')
    } catch (e) {
      if (e.code !== 'ENOENT') throw e
    }
    await fs.rename(temp, file)
  }
  serial(operation) {
    const result = this.queue.catch(() => {}).then(operation)
    this.queue = result
    return result
  }
  async index() {
    return await this.read('index', { timelines: [], settings: {} })
  }
  async load() {
    const index = await this.index()
    if (!Array.isArray(index.timelines) || index.timelines.length > 1000 || !index.settings)
      throw new Error('本地目录格式错误，未覆盖数据')
    // A crash between a new document and its catalog write can leave an orphan.
    // Recover just those documents instead of reading every 10,000-node file.
    const files = await fs.readdir(this.directory).catch((e) => {
      if (e.code === 'ENOENT') return []
      throw e
    })
    for (const file of files.filter((x) => x.endsWith('.json') && x !== 'index.json')) {
      const id = file.slice(0, -5)
      if (validId(id) && !index.timelines.some((t) => t.id === id)) {
        const t = await this.read(id, null)
        if (t && Array.isArray(t.nodes) && index.timelines.length < 1000)
          index.timelines.push(this.summary(t))
      }
    }
    return { ...index, recovered: !!this.recovered }
  }
  summary(t) {
    return { id: t.id, title: t.title, count: t.nodes.length, updatedAt: t.updatedAt }
  }
  check(t) {
    if (
      !t ||
      !validId(t.id) ||
      !t.title ||
      !Array.isArray(t.nodes) ||
      t.nodes.length > 10000 ||
      !Array.isArray(t.characters)
    )
      throw new Error('无效的时间轴或超过 10000 个节点')
    const ids = new Set()
    for (const n of t.nodes) {
      if (
        !validId(n.id) ||
        ids.has(n.id) ||
        !Array.isArray(n.event) ||
        !n.event
          .map((r) => (typeof r.text === 'string' ? r.text : ''))
          .join('')
          .trim()
      )
        throw new Error('节点标识或事件内容无效')
      ids.add(n.id)
      for (const key of ['time', 'location', 'organization'])
        if (
          !Array.isArray(n[key]) ||
          n[key].length !== 5 ||
          n[key].some((x) => typeof x !== 'string')
        )
          throw new Error('层级格式无效')
    }
  }
  save(t) {
    return this.serial(async () => {
      this.check(t)
      const index = await this.index(),
        pos = index.timelines.findIndex((x) => x.id === t.id)
      if (pos < 0 && index.timelines.length >= 1000) throw new Error('最多保存 1000 条时间轴')
      await this.write(t.id, t)
      if (pos < 0) index.timelines.push(this.summary(t))
      else index.timelines[pos] = this.summary(t)
      await this.write('index', index)
    })
  }
  settings(settings) {
    return this.serial(async () => {
      const index = await this.index()
      index.settings = {
        ...settings,
        exportDirectory: settings.exportDirectory || index.settings.exportDirectory,
      }
      await this.write('index', index)
    })
  }
  remove(id) {
    return this.serial(async () => {
      const index = await this.index()
      if (!index.timelines.some((x) => x.id === id)) throw new Error('时间轴不存在')
      // Rename first so an interrupted catalog update never resurrects deletion.
      await fs.rename(this.file(id), this.file(id) + '.deleted')
      index.timelines = index.timelines.filter((x) => x.id !== id)
      try {
        await this.write('index', index)
      } catch (e) {
        await fs.rename(this.file(id) + '.deleted', this.file(id))
        throw e
      }
    })
  }
  importMany(timelines) {
    return this.serial(async () => {
      const index = await this.index(),
        allIds = new Set(index.timelines.map((t) => t.id))
      if (!Array.isArray(timelines) || index.timelines.length + timelines.length > 1000)
        throw new Error('导入后超过 1000 条时间轴')
      for (const t of timelines) {
        this.check(t)
        if (allIds.has(t.id)) throw new Error('导入标识重复')
        allIds.add(t.id)
      }
      const written = []
      try {
        for (const t of timelines) {
          await this.write(t.id, t)
          written.push(t.id)
        }
        index.timelines.push(...timelines.map((t) => this.summary(t)))
        await this.write('index', index)
      } catch (error) {
        for (const id of written) await fs.rm(this.file(id), { force: true })
        throw error
      }
    })
  }
}
module.exports = { Store }
