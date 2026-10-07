// Preserve the supplied PNG artwork; only resize frames for the Windows ICO container.
const { app, nativeImage } = require('electron')
const fs = require('node:fs'),
  path = require('node:path')
app.setPath('userData', path.resolve(__dirname, '../output/icon-render-profile'))
app
  .whenReady()
  .then(() => {
    const image = nativeImage.createFromPath(path.join(__dirname, 'icon.png'))
    if (image.isEmpty()) throw new Error('Icon source is empty')
    const size = image.getSize()
    if (size.width !== size.height) throw new Error('Icon source must be square')
    const sizes = [16, 24, 32, 48, 64, 128, 256]
    const frames = sizes.map((size) =>
      image.resize({ width: size, height: size, quality: 'best' }).toPNG(),
    )
    const header = Buffer.alloc(6 + sizes.length * 16)
    header.writeUInt16LE(1, 2)
    header.writeUInt16LE(sizes.length, 4)
    let offset = header.length
    frames.forEach((png, i) => {
      const pos = 6 + i * 16
      header[pos] = header[pos + 1] = sizes[i] % 256
      header.writeUInt16LE(1, pos + 4)
      header.writeUInt16LE(32, pos + 6)
      header.writeUInt32LE(png.length, pos + 8)
      header.writeUInt32LE(offset, pos + 12)
      offset += png.length
    })
    fs.writeFileSync(
      path.join(__dirname, 'icon.ico'),
      Buffer.concat([header, ...frames]),
    )
    console.log(JSON.stringify({ source: size, frames: sizes }))
    app.quit()
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
