// Synthetic data only. Each invocation uses its own profile under ignored output/.
const { _electron } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { Store } = require('../electron/store.cjs')
const root = path.resolve(__dirname, '..'),
  phase = process.argv[2] || 'create'
const out = path.join(root, 'output', process.env.XUSHI_QA_TAG || 'qa-1.2.0')
const profile = path.join(out, 'profile'),
  blank = () => ['', '', '', '', '']
const event = (id, date, text, country = '') => ({
  id,
  time: ['', '', '', date, ''],
  location: blank(),
  organization: blank(),
  country,
  characters: [],
  event: [{ text, marks: [] }],
  createdAt: '2026-10-05T00:00:00Z',
})
const book = (id, title, nodes) => ({
  id,
  title,
  nodes,
  description: '合成测试资料',
  characters: [],
  filters: {
    query: '',
    location: blank(),
    organization: blank(),
    country: '',
    character: '',
    showNoLocation: true,
    showNoOrganization: true,
  },
  updatedAt: '2026-10-05T00:00:00Z',
})
let app, page
const checks = [],
  errors = []
function checked(name) {
  checks.push(name)
  console.log('PASS', name)
}
async function main() {
  await fs.mkdir(out, { recursive: true })
  if (phase === 'create') {
    const store = new Store(path.join(profile, 'workspace'))
    const a = event('short', '990.9.27', '旅人抵达', '北境')
    a.location = ['世界', '', '北城', '', '']
    a.organization[0] = '公会'
    a.characters = ['Alice']
    const b = event('formatted', '1011', '旅'.repeat(99) + '🐉尾', '南国')
    b.location = ['世界', '', '南城', '', '']
    b.organization[4] = '分队'
    b.characters = ['Zoe']
    b.event[0].marks = ['bold', 'underline', 'italic', 'strike', 'spoiler']
    const c = event('long', '1020', '长篇事件，保留每一段完整叙述。\n'.repeat(120) + '全文末尾')
    await store.save(book('fixture', '合成年表', [a, b, c]))
    await store.settings({
      theme: 'mono',
      dateFormat: 'dots',
      inspector: true,
      visibleTime: [true, true, true, true, true],
      charactersOpen: false,
      activeId: 'fixture',
    })
  }
  if (phase === 'stress') {
    const store = new Store(path.join(profile, 'workspace'))
    const nodes = Array.from({ length: 10000 }, (_, i) =>
      event('stress-' + i, String(i + 1), i % 4 ? '短事件 ' + i : '多行事件\n'.repeat(70)),
    )
    await store.save(book('stress', '一万节点', nodes))
    await store.settings({
      theme: 'grass',
      visibleTime: [true, true, true, true, true],
      activeId: 'stress',
    })
  }
  if (phase === 'time') {
    const store = new Store(path.join(profile, 'workspace'))
    await store.save(
      book(
        'time-demo',
        '时间区间示例',
        ['1888', '1999', '1999.5', '2000', '2023'].map((year, i) =>
          event('point-' + i, year, '时间点 ' + year),
        ),
      ),
    )
    const rows = [
      ['chaos', '混沌纪元', '唐', '光历2'],
      ['dusk', '黄昏纪元', '宋', ''],
      ['dawn', '黎明纪元', '元', ''],
      ['song', '混沌纪元', '宋', ''],
      ['calendar', '混沌纪元', '唐', '光历10'],
    ].map(([id, era, dynasty, calendar]) => ({
      ...event(id, '1999', id),
      time: [era, dynasty, calendar, '1999', ''],
    }))
    await store.save({
      ...book('manual-demo', '手动顺序示例', rows),
      timeOrder: [
        ['黎明纪元', '黄昏纪元', '混沌纪元'],
        ['元', '宋', '唐'],
        ['光历2', '光历10'],
      ],
    })
    await store.settings({
      theme: 'blue',
      visibleTime: [true, true, true, true, true],
      activeId: 'time-demo',
    })
  }
  const env = { ...process.env, XUSHI_TEST_DATA: profile }
  delete env.ELECTRON_RUN_AS_NODE
  app = await _electron.launch({
    executablePath:
      process.env.XUSHI_EXE || path.join(root, 'node_modules/electron/dist/electron.exe'),
    args: process.env.XUSHI_EXE ? [] : ['.'],
    cwd: root,
    env,
  })
  page = await app.firstWindow()
  page.on('pageerror', (e) => errors.push(e.message))
  page.setDefaultTimeout(15000)
  await page.getByText('已自动保存', { exact: true }).waitFor()
  const click = (name) => page.getByRole('button', { name, exact: true }).click()
  const fill = (name, value) => page.getByRole('textbox', { name, exact: true }).fill(value)
  const save = async () => {
    await click('保存')
    await page.getByText('已自动保存', { exact: true }).waitFor()
  }
  const count = async (n) => {
    await page.waitForFunction(
      (expected) =>
        document.querySelector('.filtered-count').textContent.trim() ===
        `筛选后 ${expected.toLocaleString()} 个节点`,
      n,
    )
  }
  const timeline = async () =>
    page.evaluate(async () => {
      const index = await window.desktop.load()
      return window.desktop.read(index.settings.activeId)
    })
  if (phase === 'create') {
    await count(3)
    assert((await page.locator('.time-column').first().innerText()).includes('990年9月27日'))
    assert(!(await page.locator('.time-column').first().innerText()).includes('日期'))
    assert.equal(await page.locator('.inspector,.canvas-heading,.sidebar-tools').count(), 0)
    const short = page.locator('[data-node-id="short"] .event-card')
    assert((await short.boundingBox()).height < 190)
    assert.equal(await short.getByRole('button', { name: '显示全文' }).count(), 0)
    await short.click()
    assert(await short.evaluate((e) => e.classList.contains('selected')))
    await page.locator('.timeline-viewport').click({ position: { x: 6, y: 6 } })
    assert.equal(await page.locator('.event-card.selected').count(), 0)
    const formatted = page.locator('[data-node-id="formatted"]')
    assert.equal(Array.from(await formatted.locator('.event-excerpt').innerText()).length, 101)
    await formatted.getByRole('button', { name: '显示全文', exact: true }).click()
    assert((await formatted.locator('.event-excerpt').innerText()).endsWith('尾'))
    assert.equal(await formatted.locator('.bold.underline.italic.strike.spoiler').count(), 1)
    const spoiler = formatted.locator('.spoiler')
    await page.mouse.move(5, 5)
    assert.equal(await spoiler.evaluate((e) => getComputedStyle(e).color), 'rgba(0, 0, 0, 0)')
    const pos = await spoiler.evaluate((e) => {
      const r = e.getClientRects()[0]
      return { x: r.x + 3, y: r.y + 3 }
    })
    await page.mouse.move(pos.x, pos.y)
    assert.notEqual(
      await spoiler.evaluate((e) => getComputedStyle(e).color),
      'rgba(0, 0, 0, 0)',
    )
    await formatted.getByRole('button', { name: '收起全文' }).click()
    const long = page.locator('[data-node-id="long"]')
    const oldHeight = (await long.locator('.event-card').boundingBox()).height
    await long.getByRole('button', { name: '显示全文' }).click()
    await page.waitForFunction(
      (old) =>
        document.querySelector('[data-node-id="long"] .event-card').getBoundingClientRect()
          .height >
        old + 500,
      oldHeight,
    )
    assert((await long.locator('.event-excerpt').innerText()).endsWith('全文末尾'))
    await long.getByRole('button', { name: '收起全文' }).click()
    await click('回到顶部')
    checked(
      'legacy migration, compact cards, inline full text, rich marks, spoiler and blank deselection',
    )
    await short.hover()
    assert.equal(
      await short
        .locator('..')
        .locator('.node-actions')
        .evaluate((e) => getComputedStyle(e).opacity),
      '1',
    )
    await click('编辑第 1 个节点')
    await page.getByRole('dialog', { name: '编辑节点', exact: true }).waitFor()
    await fill('国家标签', '北境 ')
    await page
      .getByRole('textbox', { name: '国家标签', exact: true })
      .pressSequentially('西境 北境')
    await fill('角色标签', 'Alice Bob2 Bob10 Alice')
    await click('完成')
    await save()
    assert.deepEqual((await timeline()).nodes[0].countries, ['北境', '西境'])
    assert.deepEqual((await timeline()).countries, ['北境', '南国', '西境'])
    await click('添加节点')
    await fill('事件内容', '新建的节点')
    await fill('日期', '1030.2.3')
    await fill('国家标签', '南国 西境')
    await click('完成')
    await save()
    await count(4)
    checked('modal editing, multi-country tags and floating add button')
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1060, 700),
    )
    const searchWidth = (
      await page.getByRole('textbox', { name: '搜索事件', exact: true }).boundingBox()
    ).width
    await page.locator('summary').filter({ hasText: '地点' }).click()
    await page.locator('summary').filter({ hasText: '组织' }).click()
    await page.getByRole('button', { name: /已有国家/ }).click()
    await page.getByRole('button', { name: /已有角色/ }).click()
    assert(
      await page.locator('.sidebar-scroll').evaluate((e) => e.scrollHeight > e.clientHeight),
    )
    assert.equal(
      (await page.getByRole('textbox', { name: '搜索事件', exact: true }).boundingBox()).width,
      searchWidth,
    )
    const heading = page.getByRole('button', { name: /已有角色/ })
    await heading.scrollIntoViewIfNeeded()
    await page.mouse.move(5, 5)
    const before = await heading.evaluate((e) => getComputedStyle(e).backgroundColor)
    await heading.hover()
    assert.equal(await heading.evaluate((e) => getComputedStyle(e).backgroundColor), before)
    assert.equal(await heading.evaluate((e) => getComputedStyle(e).cursor), 'pointer')
    await page.screenshot({ path: path.join(out, 'minimum-sidebar.png') })
    await page.getByRole('checkbox', { name: '显示无地点事件', exact: true }).uncheck()
    await page.getByRole('checkbox', { name: '筛选地点 北城', exact: true }).check()
    await count(1)
    await page.getByRole('checkbox', { name: '筛选地点 南城', exact: true }).check()
    await count(2)
    const loc = page.locator('[aria-label="地点层级筛选"]')
    await loc.getByRole('button', { name: '2 级', exact: true }).click()
    await count(0)
    await loc.getByRole('button', { name: '3 级', exact: true }).click()
    await count(2)
    await page.getByRole('checkbox', { name: '显示无组织事件', exact: true }).uncheck()
    await page.getByRole('checkbox', { name: '筛选组织 分队', exact: true }).check()
    await count(1)
    const org = page.locator('[aria-label="组织层级筛选"]')
    await org.getByRole('button', { name: '1 级', exact: true }).click()
    await count(0)
    await org.getByRole('button', { name: '5 级', exact: true }).click()
    await count(1)
    await click('清除筛选')
    await count(4)
    await page.getByRole('checkbox', { name: '筛选国家 北境', exact: true }).check()
    await count(1)
    await page.getByRole('checkbox', { name: '筛选国家 南国', exact: true }).check()
    await count(3)
    await click('清除国家筛选')
    await count(4)
    checked(
      'stable sidebar gutter, plain collapse hover, name/level AND, multi-name and multi-country OR filters and footer counts',
    )
    await click('回到顶部')
    await short.hover()
    await click('删除第 1 个节点')
    await click('取消')
    await count(4)
    await click('到达底部')
    await page.locator('.event-card').last().hover()
    await click('删除第 4 个节点')
    await click('确认删除')
    await count(3)
    checked('delete confirmation cancel and confirm')
    await click('显示设置')
    await click('黑金')
    await page.getByRole('checkbox', { name: '朝代', exact: true }).uncheck()
    await click('关闭对话框')
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1480, 960),
    )
    await click('回到顶部')
    await page.mouse.move(5, 5)
    await page.screenshot({ path: path.join(out, 'gold-overview.png') })
    await click('修改时间轴信息')
    const label = page.getByText('（选填）', { exact: true })
    assert.equal(await label.count(), 1)
    await page.screenshot({ path: path.join(out, 'project-dialog.png') })
    await click('关闭对话框')
    await click('认识序时')
    assert((await page.locator('.about-line').innerText()).includes('1.2.0'))
    await click('关闭对话框')
    await save()
    await app.evaluate(
      ({ dialog }, file) => {
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: file,
        })
      },
      path.join(out, 'backup.json'),
    )
    await click('导出 JSON')
    assert.equal(await page.getByText(/PNG|Markdown/).count(), 0)
    await page.getByRole('button', { name: /^当前时间轴/ }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    const backup = JSON.parse(await fs.readFile(path.join(out, 'backup.json'), 'utf8'))
    assert.equal(backup.version, 3)
    assert.equal(backup.timelines[0].nodes.length, 3)
    assert.deepEqual(backup.timelines[0].nodes[0].countries, ['北境', '西境'])
    await app.evaluate(
      ({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [file],
        })
      },
      path.join(out, 'backup.json'),
    )
    await click('导入 JSON')
    await click('确认导入')
    await save()
    const index = await page.evaluate(() => window.desktop.load())
    assert.equal(index.timelines.length, 2)
    await click('切换时间轴')
    await page
      .locator('.book-row')
      .filter({ hasText: '合成年表' })
      .first()
      .locator('.book-select')
      .click()
    checked(
      'JSON v3 native export/import, non-overwriting copies, timeline switching, about version and removed export controls',
    )
    await fill('搜索事件', '旅人')
    await count(1)
    await save()
    await click('添加节点')
    await fill('事件内容', '重启保留的草稿')
    await fill('国家标签', '草稿国')
    await page.getByText('已自动保存', { exact: true }).waitFor()
    await page.screenshot({ path: path.join(out, 'node-dialog.png') })
  } else if (phase === 'reopen') {
    await page.getByRole('dialog', { name: '添加节点', exact: true }).waitFor()
    assert.equal(
      await page.getByRole('textbox', { name: '事件内容', exact: true }).innerText(),
      '重启保留的草稿',
    )
    assert.equal(
      await page.getByRole('textbox', { name: '国家标签', exact: true }).inputValue(),
      '草稿国',
    )
    await click('取消')
    await count(1)
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'gold')
    assert.equal(
      await page.getByRole('textbox', { name: '搜索事件', exact: true }).inputValue(),
      '旅人',
    )
    const index = await page.evaluate(() => window.desktop.load())
    assert.equal(index.settings.countriesOpen, true)
    assert.equal(index.settings.charactersOpen, true)
    assert.equal(index.settings.visibleTime[1], false)
    assert.deepEqual((await timeline()).nodes[0].countries, ['北境', '西境'])
    await click('清除筛选')
    await count(3)
    for (const theme of ['草木', '灰白', '烟粉', '雾蓝', '黑金']) {
      await click('显示设置')
      await click(theme)
      await click('关闭对话框')
      await page.screenshot({
        path: path.join(out, 'theme-' + theme + '.png'),
      })
    }
    checked(
      'reopen: draft, countries, theme, visible time, filters, character and country folds persisted; five theme screenshots',
    )
  } else if (phase === 'time') {
    await count(5)
    await click('添加节点')
    await fill('事件内容', '时间段 1999—2000年5月')
    await click('时间段')
    await fill('开始日期', '1999')
    await fill('结束日期', '2000.5')
    await page.screenshot({ path: path.join(out, 'time-range-editor.png') })
    await click('完成')
    await save()
    await count(6)
    await click('回到顶部')
    const ordered = await page.locator('.event-excerpt').allInnerTexts()
    assert.deepEqual(ordered, [
      '时间点 1888',
      '时间段 1999—2000年5月',
      '时间点 1999',
      '时间点 1999.5',
      '时间点 2000',
      '时间点 2023',
    ])
    assert((await page.locator('.time-column').nth(1).innerText()).includes('2000年5月'))
    await page.screenshot({ path: path.join(out, 'time-range-order.png') })
    await click('切换时间轴')
    await page
      .locator('.book-row')
      .filter({ hasText: '手动顺序示例' })
      .locator('.book-select')
      .click()
    await click('显示设置')
    for (const title of ['时代', '朝代', '历法'])
      await page.locator('.order-section summary').filter({ hasText: title }).click()
    await click('上移时代 混沌纪元')
    await click('上移时代 混沌纪元')
    await click('上移时代 黄昏纪元')
    await click('上移朝代 唐')
    await click('上移朝代 唐')
    await click('上移朝代 宋')
    await click('上移历法 光历10')
    await page.screenshot({ path: path.join(out, 'manual-time-order.png') })
    await click('关闭对话框')
    await save()
    await count(5)
    assert.deepEqual(await page.locator('.event-excerpt').allInnerTexts(), [
      'calendar',
      'chaos',
      'song',
      'dusk',
      'dawn',
    ])
    const current = await timeline()
    assert.deepEqual(current.timeOrder, [
      ['混沌纪元', '黄昏纪元', '黎明纪元'],
      ['唐', '宋', '元'],
      ['光历10', '光历2'],
    ])
    await app.evaluate(
      ({ dialog }, file) => {
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: file,
        })
      },
      path.join(out, 'ordered-backup.json'),
    )
    await click('导出 JSON')
    await page.getByRole('button', { name: /^完整时间轴库/ }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    const backup = JSON.parse(await fs.readFile(path.join(out, 'ordered-backup.json'), 'utf8'))
    assert.equal(backup.version, 3)
    assert.deepEqual(
      backup.timelines.find((t) => t.id === 'manual-demo').timeOrder,
      current.timeOrder,
    )
    const range = backup.timelines
      .find((t) => t.id === 'time-demo')
      .nodes.find((n) => n.endTime)
    assert.equal(range.endTime[3], '2000.5')
    checked(
      'time range UI, requested point/range sorting, coarse-before-precise, all three manual orders, JSON endpoints and manual order',
    )
  } else if (phase === 'time-reopen') {
    await count(5)
    assert.deepEqual(await page.locator('.event-excerpt').allInnerTexts(), [
      'calendar',
      'chaos',
      'song',
      'dusk',
      'dawn',
    ])
    await click('切换时间轴')
    await page
      .locator('.book-row')
      .filter({ hasText: '时间区间示例' })
      .locator('.book-select')
      .click()
    await count(6)
    assert.deepEqual(await page.locator('.event-excerpt').allInnerTexts(), [
      '时间点 1888',
      '时间段 1999—2000年5月',
      '时间点 1999',
      '时间点 1999.5',
      '时间点 2000',
      '时间点 2023',
    ])
    await save()
    const data = await timeline()
    assert.equal(data.nodes.find((n) => n.endTime).endTime[3], '2000.5')
    await page.locator('.event-card').nth(1).hover()
    await click('编辑第 2 个节点')
    assert.equal(
      await page.getByRole('textbox', { name: '结束日期', exact: true }).inputValue(),
      '2000.5',
    )
    await click('时间点')
    await click('完成')
    await save()
    assert.equal(
      (await timeline()).nodes.some((n) => n.endTime),
      false,
    )
    checked(
      'manual ordering and interval endpoints persist after restart; changing a range back to a point removes its endpoint',
    )
  } else if (phase === 'stress') {
    await count(10000)
    assert.equal(
      await page.getByRole('button', { name: '添加节点', exact: true }).isDisabled(),
      true,
    )
    assert((await page.locator('.event-card').count()) < 30)
    await page.getByRole('button', { name: '显示全文', exact: true }).first().click()
    await page.waitForFunction(
      () => document.querySelector('.event-card').getBoundingClientRect().height > 1000,
    )
    await page.getByRole('button', { name: '收起全文', exact: true }).click()
    await click('到达底部')
    await page.locator('[data-node-id="stress-9999"]').waitFor()
    await page.waitForFunction(() => {
      const e = document.querySelector('[data-node-id="stress-9999"]')
      return (
        e &&
        e.getBoundingClientRect().bottom <=
          document.querySelector('.timeline-viewport').getBoundingClientRect().bottom
      )
    })
    assert((await page.locator('.event-card').count()) < 30)
    await page.screenshot({ path: path.join(out, 'stress-bottom.png') })
    await fill('搜索事件', '短事件 9999')
    await count(1)
    await page.locator('[data-node-id="stress-9999"] .event-card').waitFor()
    await click('清除搜索')
    await count(10000)
    await click('回到顶部')
    const geometry = await page.locator('.timeline-row').evaluateAll((rows) =>
      rows.map((e) => {
        const r = e.getBoundingClientRect()
        return { top: r.top, bottom: r.bottom }
      }),
    )
    assert(geometry.every((r, i) => !i || r.top >= geometry[i - 1].bottom - 0.5))
    checked(
      '10000 variable-height nodes: bounded DOM, inline expansion, final node reachable, search/reset and no row overlap',
    )
  }
  const fit = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth > innerWidth,
    y: document.documentElement.scrollHeight > innerHeight,
  }))
  assert.deepEqual(fit, { x: false, y: false })
  assert.deepEqual(errors, [])
  const actualVersion = await app.evaluate(({ app }) => app.getVersion())
  assert.equal(actualVersion, '1.2.0')
  await fs.writeFile(
    path.join(out, phase + '-report.json'),
    JSON.stringify({ phase, version: actualVersion, checks, errors }, null, 2),
  )
  await app.close()
  app = null
}
main().catch(async (e) => {
  console.error(e)
  if (page)
    await page.screenshot({ path: path.join(out, phase + '-failure.png') }).catch(() => {})
  if (app) await app.close().catch(() => {})
  process.exitCode = 1
})
