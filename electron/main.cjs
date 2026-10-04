const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron')
const fs = require('node:fs/promises'),
  path = require('node:path')
const { Store } = require('./store.cjs')
let win,
  store,
  allowClose = false,
  pngSession
// A fixed identity keeps NSIS upgrades and local data attached to one app.
app.setName('序时')
app.setPath('userData', process.env.XUSHI_TEST_DATA || path.join(app.getPath('appData'), 'Xushi'))
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
  app.whenReady().then(() => {
    store = new Store(path.join(app.getPath('userData'), 'workspace'))
    ipcMain.handle('xushi:load', () => store.load())
    ipcMain.handle('xushi:read', (_, id) => store.read(id, null))
    ipcMain.handle('xushi:save', (_, data) => store.save(data))
    ipcMain.handle('xushi:settings', (_, data) => store.settings(data))
    ipcMain.handle('xushi:remove', (_, id) => store.remove(id))
    ipcMain.handle('xushi:import-many', (_, data) => store.importMany(data))
    ipcMain.handle('xushi:version', () => app.getVersion())
    ipcMain.handle('xushi:import', async () => {
      const result = await dialog.showOpenDialog(win, {
        title: '导入时间轴或完整库',
        filters: [{ name: '序时 JSON', extensions: ['json'] }],
        properties: ['openFile'],
      })
      if (result.canceled) return null
      const file = result.filePaths[0]
      if ((await fs.stat(file)).size > 512 * 1024 * 1024)
        throw new Error('单个导入文件不能超过 512 MB，请分批导入')
      return JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
    })
    ipcMain.handle('xushi:export', async (_, data, title) => {
      const index = await store.index()
      const name = String(title || '序时备份').replace(/[<>:"/\\|?*]/g, '_') + '.json'
      const result = await dialog.showSaveDialog(win, {
        title: '导出 JSON 备份',
        defaultPath: path.join(index.settings.exportDirectory || app.getPath('downloads'), name),
        filters: [{ name: '序时 JSON', extensions: ['json'] }],
      })
      if (result.canceled) return null
      await fs.writeFile(result.filePath, JSON.stringify(data, null, 2), 'utf8')
      await store.settings({ ...index.settings, exportDirectory: path.dirname(result.filePath) })
      return result.filePath
    })
    ipcMain.handle('xushi:markdown', async (_, content, title) => {
      if (typeof content !== 'string') throw new Error('无效的 Markdown 内容')
      const index = await store.index(),
        name = String(title || '序时').replace(/[<>:"/\\|?*]/g, '_') + '.md'
      const result = await dialog.showSaveDialog(win, {
        title: '导出 Markdown',
        defaultPath: path.join(index.settings.exportDirectory || app.getPath('downloads'), name),
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })
      if (result.canceled) return null
      await fs.writeFile(result.filePath, content, 'utf8')
      await store.settings({ ...index.settings, exportDirectory: path.dirname(result.filePath) })
      return result.filePath
    })
    ipcMain.handle('xushi:png-start', async (_, count, title) => {
      if (!Number.isInteger(count) || count < 1 || count > 715) throw new Error('无效的图片页数')
      const index = await store.index(),
        name = String(title || '序时').replace(/[<>:"/\\|?*]/g, '_') + '.png'
      const result = await dialog.showSaveDialog(win, {
        title: count > 1 ? `导出 PNG（自动拆分为 ${count} 张）` : '导出 PNG',
        defaultPath: path.join(index.settings.exportDirectory || app.getPath('downloads'), name),
        filters: [{ name: 'PNG 图片', extensions: ['png'] }],
      })
      if (result.canceled) return null
      const base = result.filePath.replace(/\.png$/i, ''),
        files = Array.from({ length: count }, (_, i) =>
          count === 1 ? base + '.png' : `${base}-${String(i + 1).padStart(3, '0')}.png`,
        )
      if (count > 1) {
        let existing = 0
        for (const file of files) {
          if (
            await fs.stat(file).then(
              () => true,
              () => false,
            )
          )
            existing++
        }
        if (existing) {
          const answer = await dialog.showMessageBox(win, {
            type: 'question',
            message: `有 ${existing} 张同名图片，将覆盖这些导出文件。`,
            buttons: ['取消', '覆盖'],
            defaultId: 0,
            cancelId: 0,
          })
          if (answer.response !== 1) return null
        }
      }
      pngSession = { id: require('node:crypto').randomUUID(), files, next: 0 }
      await store.settings({ ...index.settings, exportDirectory: path.dirname(result.filePath) })
      return pngSession.id
    })
    ipcMain.handle('xushi:png-page', async (_, session, index, data) => {
      if (
        !pngSession ||
        session !== pngSession.id ||
        index !== pngSession.next ||
        index >= pngSession.files.length
      )
        throw new Error('导出会话已失效')
      const bytes = Buffer.from(data)
      if (
        bytes.length > 64 * 1024 * 1024 ||
        bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
      )
        throw new Error('无效的 PNG 图片')
      const file = pngSession.files[index]
      await fs.writeFile(file + '.tmp', bytes)
      await fs.rename(file + '.tmp', file)
      pngSession.next++
      if (pngSession.next === pngSession.files.length) pngSession = null
      return file
    })
    ipcMain.handle('xushi:close', async () => {
      await store.queue
      allowClose = true
      win.close()
    })
    ipcMain.handle('xushi:force-close', async () => {
      const answer = await dialog.showMessageBox(win, {
        type: 'warning',
        message: '未保存的内容可能丢失，仍然退出？',
        buttons: ['返回序时', '退出'],
        defaultId: 0,
        cancelId: 0,
      })
      if (answer.response === 1) {
        allowClose = true
        win.close()
      }
    })
    Menu.setApplicationMenu(null)
    win = new BrowserWindow({
      width: 1480,
      height: 960,
      minWidth: 1060,
      minHeight: 700,
      title: '序时 · 作品时间轴',
      backgroundColor: '#fafcf7',
      icon: path.join(__dirname, '../build/icon.ico'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    win.on('close', (e) => {
      if (!allowClose && !win.webContents.isDestroyed()) {
        e.preventDefault()
        win.webContents.send('xushi:closing')
      }
    })
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  })
  app.on('window-all-closed', () => app.quit())
}
