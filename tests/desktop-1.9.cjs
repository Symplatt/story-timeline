const { _electron } = require('playwright')
const fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict')
const { Store } = require('../electron/store.cjs')
const root = path.resolve(__dirname, '..'),
  out = path.join(root, 'output', process.env.XUSHI_QA_TAG || 'qa-1.9.2'),
  profile = path.join(out, 'profile')
let app, page
const errors = []
async function launch() {
  const env = { ...process.env, XUSHI_TEST_DATA: profile }
  delete env.ELECTRON_RUN_AS_NODE
  app = await _electron.launch({
    executablePath:
      process.env.XUSHI_EXE ||
      path.join(root, 'node_modules/electron/dist/electron.exe'),
    args: process.env.XUSHI_EXE ? [] : ['.'],
    cwd: root,
    env,
  })
  page = await app.firstWindow()
  page.setDefaultTimeout(12000)
  page.on('pageerror', (e) => errors.push(e.message))
  await page.getByText('已自动保存', { exact: true }).waitFor()
}
const click = (name) => page.getByRole('button', { name, exact: true }).click()
const fill = (name, value) =>
  page.getByRole('textbox', { name, exact: true }).fill(value)
const save = async () => {
  await page.keyboard.press('Control+s')
  await page.getByText('已自动保存', { exact: true }).waitFor()
}
const read = () =>
  page.evaluate(async () => {
    const x = await window.desktop.load()
    return window.desktop.read(x.settings.activeId)
  })
async function main() {
  await fs.mkdir(out, { recursive: true })
  const store = new Store(path.join(profile, 'workspace'))
  await store.save({
    id: 'calendar',
    title: '历法测试',
    description: '',
    nodes: [
      {
        id: 'qianlong',
        title: '乾隆事件',
        time: ['古代', '清', '乾隆', '1234', '08:00'],
        location: ['洲', '国', '城', '', ''],
        countries: ['测试国'],
        organizations: ['测试组织'],
        characters: ['测试人物'],
        event: [],
        createdAt: '2026-10-06T00:00:00Z',
      },
    ],
    countries: [],
    organizations: [],
    characters: [],
    updatedAt: '2026-10-06T00:00:00Z',
  })
  await store.settings({ activeId: 'calendar' })
  await launch()
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'gold')
  assert(
    await page
      .locator('.brand-mark img')
      .evaluate((el) => el.complete && el.naturalWidth > 0),
  )
  await click('显示设置')
  assert.deepEqual(await page.locator('.theme-grid button').allTextContents(), [
    '黑金',
    '黑白',
    '草木',
    '烟粉',
    '雾蓝',
  ])
  await page.keyboard.press('Escape')
  await click('添加节点')
  await fill('节点标题', '雍正事件')
  for (const [name, value] of [
    ['时代', '古代'],
    ['朝代', '清'],
    ['历法', '雍正'],
    ['日期', '1234'],
    ['时刻', '08:00'],
  ])
    await fill(name, value)
  assert.equal(await page.locator('.node-form [role=alert]').count(), 0)
  assert.equal(
    await page.getByRole('button', { name: '完成', exact: true }).isDisabled(),
    false,
  )
  await click('完成')
  await save()
  assert.equal((await read()).nodes.length, 2)
  await page.locator('.event-card').filter({ hasText: '雍正事件' }).hover()
  await page
    .locator('.timeline-row')
    .filter({ hasText: '雍正事件' })
    .getByRole('button', { name: /编辑第/ })
    .click()
  await fill('日期', '1235')
  await save()
  assert.equal((await read()).nodes.find((n) => n.title === '雍正事件').time[3], '1235')
  await fill('日期', '1234')
  await save()
  await fill('时代', '另一时代')
  const alert = page.locator('.node-time-heading [role=alert]')
  await alert.waitFor()
  assert((await alert.innerText()).includes('朝代'))
  assert.equal(await alert.evaluate((el) => getComputedStyle(el).textAlign), 'right')
  await page.locator('.node-time-heading').scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(out, 'time-error.png') })
  await fill('时代', '古代')
  await fill('日期', '')
  assert((await alert.innerText()).includes('日期'))
  await fill('日期', '1234')
  await click('完成')
  await save()
  await page.getByRole('button', { name: /^时间范围/ }).click()
  assert.equal(
    await page
      .getByText('存在同名时间层级对应多个上级的旧数据，请编辑这些节点并区分名称。', {
        exact: true,
      })
      .count(),
    0,
  )
  for (const width of [1480, 1060]) {
    await app.evaluate(
      ({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0].setSize(w, 960),
      width,
    )
    const r = await page.locator('.time-empty-options').evaluate((el) => {
      const [a, b] = [...el.children].map((x) => x.getBoundingClientRect())
      const r = el.getBoundingClientRect()
      return {
        dy: a.top - b.top,
        left: a.left - r.left,
        right: r.right - b.right,
        overlap: a.right > b.left,
      }
    })
    assert(
      Math.abs(r.dy) < 1 && Math.abs(r.left) < 1 && Math.abs(r.right) < 1 && !r.overlap,
      JSON.stringify(r),
    )
    await page.screenshot({ path: path.join(out, `time-options-${width}.png`) })
  }
  await click('关闭时间筛选')
  await click('地点筛选')
  const footer = await page.locator('.location-filter-footer').evaluate((el) => {
    const r = el.getBoundingClientRect(),
      c = el.querySelector('.check-label').getBoundingClientRect()
    return { right: r.right - c.right, bottom: r.bottom - c.bottom }
  })
  assert(
    Math.abs(footer.right) < 1 && Math.abs(footer.bottom) < 1,
    JSON.stringify(footer),
  )
  await page.screenshot({ path: path.join(out, 'location-footer.png') })
  await click('关闭地点筛选')
  // Invisible fields must not keep filtering the timeline behind the user's back.
  await click('国家 1')
  await page.getByRole('checkbox', { name: '全部国家', exact: true }).click()
  await page.waitForFunction(() =>
    document.querySelector('.filtered-count').textContent.includes('筛选后 0 个节点'),
  )
  await click('显示设置')
  assert(await page.getByRole('checkbox', { name: '时间', exact: true }).isDisabled())
  await page.getByRole('checkbox', { name: '显示国家字段', exact: true }).uncheck()
  await page.screenshot({ path: path.join(out, 'settings-logos.png') })
  assert.equal(await page.locator('.theme-grid svg').count(), 5)
  assert.equal(await page.locator('.theme-grid img').count(), 0)
  for (let i = 1; i <= 5; i++) {
    const input = page.getByRole('textbox', {
      name: '地点' + i + '级名称',
      exact: true,
    })
    assert.equal(await input.getAttribute('placeholder'), i + '级')
    assert.equal(await input.inputValue(), '')
  }
  assert.equal(
    (await page.locator('.location-names .level-grid').innerText()).trim(),
    '',
  )
  await page.keyboard.press('Escape')
  await page.waitForFunction(() =>
    document.querySelector('.filtered-count').textContent.includes('筛选后 2 个节点'),
  )
  assert.equal(
    await page.getByRole('button', { name: '国家 1', exact: true }).count(),
    0,
  )
  assert.equal(await page.locator('#filter-dock').isVisible(), false)
  assert.equal(await page.locator('.country-tag').count(), 0)
  await click('显示设置')
  await page.getByRole('checkbox', { name: '显示国家字段', exact: true }).check()
  await page.keyboard.press('Escape')
  await page.waitForFunction(() =>
    document.querySelector('.filtered-count').textContent.includes('筛选后 0 个节点'),
  )
  await click('清空筛选')
  await click('显示设置')
  for (const label of ['地点', '国家', '组织', '人物'])
    await page
      .getByRole('checkbox', { name: `显示${label}字段`, exact: true })
      .uncheck()
  await page.keyboard.press('Escape')
  await save()
  assert.equal(await page.locator('.event-meta, .country-tag').count(), 0)
  assert.equal(
    await page.locator('.sidebar .tag-filter, .sidebar .hierarchy-trigger').count(),
    0,
  )
  assert((await page.locator('.time-column').count()) > 0)
  await page.locator('[data-node-id=qianlong] .event-card').hover()
  await page
    .locator('[data-node-id=qianlong]')
    .getByRole('button', { name: /编辑第/ })
    .click()
  assert.equal(
    await page.getByRole('textbox', { name: '国家标签', exact: true }).inputValue(),
    '测试国',
  )
  await click('完成')
  const file = path.join(out, 'repeat-dates.json')
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file })
  }, file)
  await click('导出 JSON')
  await page.getByRole('button', { name: /^当前时间轴/ }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
  }, file)
  await click('导入 JSON')
  await click('确认导入')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await save()
  assert.equal((await read()).nodes.length, 2)
  assert.deepEqual((await read()).nodes.find((n) => n.title === '乾隆事件').countries, [
    '测试国',
  ])
  await click('显示设置')
  await click('黑白')
  await page.keyboard.press('Escape')
  await save()
  await app.close()
  await launch()
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'mono')
  assert.equal(await page.locator('.event-meta, .country-tag').count(), 0)
  await click('显示设置')
  for (const label of ['地点', '国家', '组织', '人物']) {
    const box = page.getByRole('checkbox', { name: `显示${label}字段`, exact: true })
    assert.equal(await box.isChecked(), false)
    await box.check()
  }
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('.country-tag').count(), 1)
  assert.equal(await page.locator('.event-meta > span').count(), 3)
  assert.equal((await read()).nodes.length, 2)
  for (const width of [1480, 1060]) {
    await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 960), width)
    const before = await page.locator('.event-card').first().boundingBox()
    const track = page.locator('.virtual-track')
    assert.equal(await track.evaluate(el => getComputedStyle(el).transform), 'matrix(1, 0, 0, 1, -16, 0)')
    await track.evaluate(el => el.style.transform = 'translateX(-8px)')
    const previous = await page.locator('.event-card').first().boundingBox()
    assert.equal(previous.x - before.x, 8)
    assert.equal(previous.width, before.width)
    await track.evaluate(el => el.style.transform = '')
    const row = page.locator('.timeline-row').first()
    const narrowed = await page.locator('.event-card').first().boundingBox()
    await row.evaluate(el => el.style.paddingRight = '0px')
    const original = await page.locator('.event-card').first().boundingBox()
    assert.equal(original.x, narrowed.x)
    assert.equal(original.width - narrowed.width, 32)
    await row.evaluate(el => el.style.paddingRight = '')

    await page.screenshot({ path: path.join(out, `layout-${width}.png`) })
  }
  assert.equal(await app.evaluate(({ app }) => app.getVersion()), '1.9.2')
  assert.deepEqual(errors, [])
  const report = {
    version: '1.9.2',
    checks: [
      'repeated dates/clocks create, autosave, export/import and restart',
      'genuine errors next to time heading, right aligned',
      'time options one row and opposite edges at 1480/1060',
      'empty-place switch bottom right',
      'new PNG logo loaded; gold default; five-theme order; saved mono preserved',
      'four field toggles hide cards and filters, pause hidden criteria, preserve edits/export/restart and restore data',
    ],
    errors,
  }
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  await app.close()
  app = null
}
main().catch(async (e) => {
  console.error(e)
  if (page)
    await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {})
  if (app) await app.close().catch(() => {})
  process.exitCode = 1
})
