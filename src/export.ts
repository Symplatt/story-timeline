import {
  displayDate,
  timeLabels,
  preview,
  type Timeline,
  type TimelineNode,
  type Settings,
  type Run,
} from './model'
const escapeHtml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
const md = (text: string) => text.replace(/[\\`*_{}\[\]<>#+.!|~-]/g, '\\$&').replace(/\r?\n/g, ' ')
export function markdown(timeline: Timeline, nodes: TimelineNode[], settings: Settings): string {
  const lines = [
    `# ${md(timeline.title)}`,
    '',
    md(timeline.description),
    '',
    `共 ${nodes.length} 个事件`,
    '',
    '<style>.xushi-spoiler{background:#111;color:transparent!important}.xushi-spoiler:hover{background:transparent;color:inherit!important}</style>',
    '',
  ]
  nodes.forEach((n, i) => {
    lines.push(
      `## ${i + 1}. ${md(
        n.time
          .map((v, j) => (j === 3 ? displayDate(v, settings.dateFormat) : v))
          .filter(Boolean)
          .join(' · ') || '时间不确定',
      )}`,
      '',
    )
    n.time.forEach((v, j) => {
      if (v)
        lines.push(`- ${timeLabels[j]}：${md(j === 3 ? displayDate(v, settings.dateFormat) : v)}`)
    })
    for (const key of ['location', 'organization'] as const)
      n[key].forEach((v, j) => {
        if (v) lines.push(`- ${key === 'location' ? '地点' : '组织'} ${j + 1} 级：${md(v)}`)
      })
    if (n.country) lines.push(`- 国家：${md(n.country)}`)
    if (n.characters.length) lines.push(`- 角色：${n.characters.map(md).join('、')}`)
    lines.push(
      '',
      '### 事件',
      '',
      n.event
        .map((r) => {
          let text = escapeHtml(r.text).replace(/\r?\n/g, '<br>\n')
          const tags = {
            bold: 'strong',
            underline: 'u',
            italic: 'em',
            strike: 's',
            spoiler: 'span',
          }
          for (const mark of r.marks) {
            const tag = tags[mark]
            text = `<${tag}${mark === 'spoiler' ? ' class="xushi-spoiler"' : ''}>${text}</${tag}>`
          }
          return text
        })
        .join(''),
      '',
      '---',
      '',
    )
  })
  return lines.join('\n')
}
export const pngPages = (count: number) => Math.max(1, Math.ceil(count / 14))
/** Draw bounded pages directly; never screenshot the virtualized DOM or allocate
 * a multi-million-pixel canvas for a 10,000-event timeline. */
export async function pngPage(
  timeline: Timeline,
  nodes: TimelineNode[],
  settings: Settings,
  page: number,
): Promise<ArrayBuffer> {
  const group = nodes.slice(page * 14, (page + 1) * 14),
    width = 1200,
    row = 242,
    height = 220 + Math.max(1, group.length) * row
  const canvas = document.createElement('canvas')
  canvas.width = width * 2
  canvas.height = height * 2
  const ctx = canvas.getContext('2d')!
  ctx.scale(2, 2)
  const css = getComputedStyle(document.documentElement),
    color = (name: string) => css.getPropertyValue(name).trim()
  const paper = color('--paper'),
    surface = color('--surface'),
    text = color('--text'),
    accent = color('--green'),
    muted = color('--muted'),
    line = color('--line')
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = accent
  ctx.font = '600 28px "Microsoft YaHei"'
  ctx.fillText(timeline.title.slice(0, 36), 55, 60)
  ctx.fillStyle = muted
  ctx.font = '14px "Microsoft YaHei"'
  ctx.fillText(
    `序时 · ${nodes.length} 个事件 · 第 ${page + 1} / ${pngPages(nodes.length)} 张`,
    55,
    94,
  )
  ctx.font = '13px "Microsoft YaHei"'
  ctx.fillText('卡片保留前 100 字；完整事件请导出 Markdown 或 JSON。', 55, 120)
  function wrapped(value: string, x: number, y: number, maxWidth: number, maxLines: number) {
    let piece = '',
      lineNo = 0
    for (const char of Array.from(value)) {
      if (ctx.measureText(piece + char).width > maxWidth) {
        ctx.fillText(piece, x, y + lineNo * 20)
        lineNo++
        piece = ''
        if (lineNo >= maxLines) return
      }
      piece += char
    }
    if (piece) ctx.fillText(piece, x, y + lineNo * 20)
  }
  group.forEach((node, index) => {
    const y = 160 + index * row,
      cardX = 285,
      cardWidth = 860
    ctx.strokeStyle = line
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(257, y)
    ctx.lineTo(257, y + row)
    ctx.stroke()
    ctx.fillStyle = accent
    ctx.beginPath()
    ctx.arc(257, y + 30, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = surface
    ctx.beginPath()
    ctx.roundRect(cardX, y, cardWidth, row - 20, 10)
    ctx.fill()
    ctx.strokeStyle = line
    ctx.lineWidth = 1
    ctx.stroke()
    let ty = y + 25
    ctx.fillStyle = accent
    ctx.font = '13px "Microsoft YaHei"'
    node.time.forEach((v, i) => {
      if (v && settings.visibleTime[i]) {
        wrapped(
          `${timeLabels[i]}  ${i === 3 ? displayDate(v, settings.dateFormat) : v}`,
          45,
          ty,
          195,
          2,
        )
        ty += 36
      }
    })
    if (node.time.every((v) => !v)) {
      ctx.fillStyle = muted
      ctx.fillText('时间不确定', 100, y + 35)
    }
    ctx.fillStyle = accent
    ctx.font = '12px "Microsoft YaHei"'
    ctx.fillText(
      `事件 ${String(page * 14 + index + 1).padStart(2, '0')}    ${node.country.slice(0, 40)}`,
      cardX + 22,
      y + 29,
    )
    const result = preview(node.event)
    const runs: Run[] = [...result.runs]
    if (result.truncated) runs.push({ text: '…', marks: [] })
    let x = cardX + 22,
      baseline = y + 65
    for (const run of runs) {
      ctx.font = `${run.marks.includes('italic') ? 'italic ' : ''}${run.marks.includes('bold') ? '700' : '400'} 16px "Microsoft YaHei"`
      for (const raw of Array.from(run.text)) {
        const char = /\s/.test(raw) ? ' ' : raw
        const w = ctx.measureText(char).width
        if (x + w > cardX + cardWidth - 22) {
          x = cardX + 22
          baseline += 25
        }
        // Spoilers remain black in a static image; no hover state can leak them.
        if (run.marks.includes('spoiler')) {
          ctx.fillStyle = '#101010'
          ctx.fillRect(x, baseline - 17, w + 0.5, 21)
        } else {
          ctx.fillStyle = text
          ctx.fillText(char, x, baseline)
          ctx.strokeStyle = text
          ctx.lineWidth = 1
          for (const mark of run.marks) {
            if (mark === 'underline' || mark === 'strike') {
              const yy = baseline + (mark === 'underline' ? 3 : -5)
              ctx.beginPath()
              ctx.moveTo(x, yy)
              ctx.lineTo(x + w, yy)
              ctx.stroke()
            }
          }
        }
        x += w
      }
    }
    ctx.fillStyle = muted
    ctx.font = '12px "Microsoft YaHei"'
    wrapped(
      [
        node.location.filter(Boolean).join(' / '),
        node.organization.filter(Boolean).join(' / '),
        node.characters.join(' · '),
      ]
        .filter(Boolean)
        .join('  |  '),
      cardX + 22,
      y + row - 48,
      cardWidth - 44,
      1,
    )
  })
  if (!group.length) {
    ctx.fillStyle = muted
    ctx.font = '18px "Microsoft YaHei"'
    ctx.fillText('暂无符合条件的事件', 55, 200)
  }
  ctx.fillStyle = muted
  ctx.font = '11px "Microsoft YaHei"'
  ctx.fillText('序时 · 作品时间轴', 55, height - 20)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 生成失败'))), 'image/png'),
  )
  canvas.width = 1
  canvas.height = 1
  return blob.arrayBuffer()
}
