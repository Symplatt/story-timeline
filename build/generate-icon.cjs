// Render the vector source, then embed PNG frames in the Windows icon container.
const { app, BrowserWindow, nativeImage } = require('electron')
const fs = require('node:fs'), path = require('node:path')
app.setPath('userData', path.resolve(__dirname, '../output/icon-render-profile'))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 256, height: 256, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html,<html></html>')
  const source = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8'))
  const dataUrl = await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => { const canvas=document.createElement('canvas');canvas.width=canvas.height=256;canvas.getContext('2d').drawImage(image,0,0);resolve(canvas.toDataURL('image/png')); };image.onerror=reject;image.src=${JSON.stringify(source)};
  })`)
  const image = nativeImage.createFromDataURL(dataUrl)
  if (image.isEmpty()) throw new Error('Icon render is empty')
  fs.writeFileSync(path.join(__dirname, 'icon.png'), image.toPNG())
  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const frames = sizes.map(size => nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: size, height: size, quality: 'best' }).toPNG())
  const header = Buffer.alloc(6 + sizes.length * 16)
  header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4)
  let offset = header.length
  frames.forEach((png, i) => {
    const pos = 6 + i * 16
    header[pos] = header[pos + 1] = sizes[i] % 256
    header.writeUInt16LE(1, pos + 4); header.writeUInt16LE(32, pos + 6)
    header.writeUInt32LE(png.length, pos + 8); header.writeUInt32LE(offset, pos + 12)
    offset += png.length
  })
  fs.writeFileSync(path.join(__dirname, 'icon.ico'), Buffer.concat([header, ...frames]))
  win.destroy(); app.quit()
}).catch(error => { console.error(error); app.exit(1) })
