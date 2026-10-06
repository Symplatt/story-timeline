const { _electron } = require('playwright')
const fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict')
const { Store } = require('../electron/store.cjs')
const root = path.resolve(__dirname, '..'),
  out = path.join(root, 'output', process.env.XUSHI_QA_TAG || 'qa-1.8.1'),
  profile = path.join(out, 'profile')
const old = process.env.XUSHI_EXPECT_OLD === '1',
  blank = () => ['', '', '', '', '']
const fields = [
  ['countries', '国家'],
  ['organizations', '组织'],
  ['characters', '人物'],
]
const makeNode = (id, names = [], date = '') => ({
  id,
  title: id,
  time: ['', '', '', date, ''],
  location: blank(),
  countries: names,
  organizations: names,
  characters: names,
  event: [{ text: '合成正文 ' + id, marks: [] }],
  createdAt: '2026-10-06T00:00:00Z',
})
const book = (id, nodes, options) => ({
  id,
  title: id,
  description: '合成回归',
  nodes,
  countries: options,
  organizations: options,
  characters: options,
  updatedAt: '2026-10-06T00:00:00Z',
})
let app, page
const checks = [],
  errors = []
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
const check = (name, on) =>
  page.getByRole('checkbox', { name, exact: true }).setChecked(on)
const count = (n) =>
  page.waitForFunction(
    (n) =>
      document.querySelector('.filtered-count')?.textContent.trim() ===
      `筛选后 ${n} 个节点`,
    n,
  )
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
  const empty = book(
    'empty',
    Array.from({ length: 9 }, (_, i) => makeNode('empty-' + i)),
    ['未关联'],
  )
  const mixed = book(
    'mixed',
    [
      makeNode('bare'),
      makeNode('a', ['A'], '2020'),
      makeNode('b', ['B'], '2021'),
      makeNode('ab', ['A', 'B'], '2022'),
    ],
    ['A', 'B', '未关联'],
  )
  mixed.nodes[1].location = ['洲', '国', '城', '', '']
  mixed.nodes[2].location = ['洲', '国', '城', '区', '']
  mixed.nodes[3].location = ['别洲', '', '', '', '']
  await store.save(empty)
  await store.save(mixed)
  const history = book(
    'history',
    [
      ['古代', '清', '乾隆', '', ''],
      ['古代', '明', '', '', ''],
      ['古代', '清', '', '', ''],
      ['古代', '', '', '', ''],
      blank(),
      ['古代', '清', '康熙', '', ''],
    ].map((time, i) => ({ ...makeNode('history-' + i), time })),
    [],
  )
  history.timeOrder = [['古代'], ['明', '清'], ['康熙', '乾隆']]
  await store.save(history)
  await store.settings({ theme: 'gold', activeId: empty.id })
  await launch()
  await count(9)
  for (const [key, label] of fields) {
    await page.getByRole('button', { name: new RegExp('^' + label + ' 1$') }).click()
    await check(`筛选${label} 未关联`, false)
    await count(old ? 0 : 9)
    await check(`筛选${label} 未关联`, true)
    await count(9)
    if (!old) {
      await check(`筛选${label} 未关联`, false)
      await count(9)
      await check(`未填写${label}`, false)
      await count(0)
      await check(`筛选${label} 未关联`, true)
      await count(0)
      await check(`未填写${label}`, true)
      await count(9)
      await page.getByRole('checkbox', { name: `全部${label}`, exact: true }).click()
      await count(0)
      await page.getByRole('checkbox', { name: `全部${label}`, exact: true }).click()
      await count(9)
    }
    await click(`关闭${label}筛选`)
    checks.push(
      `${label}: ${old ? '1.8.0 bug reproduced (9 -> 0 -> 9)' : 'unused name independent of 9 untagged nodes; explicit empty and all/none controls'}`,
    )
  }
  if (!old) {
    await click('切换时间轴')
    await page.locator('.book-select').filter({ hasText: 'mixed' }).click()
    await count(4)
    for (const [key, label] of fields) {
      await page.getByRole('button', { name: new RegExp('^' + label + ' 3$') }).click()
      await check(`筛选${label} 未关联`, false)
      await count(4)
      await check(`筛选${label} A`, false)
      await count(3)
      await check(`筛选${label} B`, false)
      await count(1)
      await check(`未填写${label}`, false)
      await count(0)
      await check(`筛选${label} A`, true)
      await count(2)
      await check(`筛选${label} B`, true)
      await count(3)
      await check(`筛选${label} 未关联`, true)
      await count(3)
      assert.equal(
        await page
          .getByRole('checkbox', { name: `全部${label}`, exact: true })
          .getAttribute('aria-checked'),
        'mixed',
      )
      await check(`未填写${label}`, true)
      await count(4)
      await page.getByRole('textbox', { name: `搜索${label}`, exact: true }).fill('A')
      await count(4)
      await page.getByRole('textbox', { name: `搜索${label}`, exact: true }).fill('')
      await click('取消筛选')
      await click(`关闭${label}筛选`)
      checks.push(
        `${label}: mixed empty/single/multiple tags, last checkbox does not implicitly select empty nodes`,
      )
    }
    // Category filters combine with AND, names within each category with OR.
    await page.getByRole('button', { name: '国家 3', exact: true }).click()
    await page.getByRole('checkbox', { name: '全部国家', exact: true }).click()
    await check('筛选国家 A', true)
    await count(2)
    await click('关闭国家筛选')
    await page.getByRole('button', { name: '组织 3', exact: true }).click()
    await page.getByRole('checkbox', { name: '全部组织', exact: true }).click()
    await check('筛选组织 B', true)
    await count(1)
    await click('关闭组织筛选')
    await page.getByRole('textbox', { name: '搜索事件', exact: true }).fill('不存在')
    await count(0)
    await click('清空筛选')
    await count(4)
    checks.push('Cross-category AND, multi-tag OR, text search and global reset')
    await click('地点筛选')
    await check('地点1级 洲', false)
    await count(2)
    await check('显示无地点事件', false)
    await count(1)
    await click('取消筛选')
    await count(4)
    await page.getByRole('checkbox', { name: '全部4级地点', exact: true }).click()
    await count(3)
    await click('取消筛选')
    await page
      .getByRole('combobox', { name: '地点信息要求', exact: true })
      .selectOption('4')
    await count(2)
    await check('显示无地点事件', false)
    await count(1)
    await click('取消筛选')
    await click('关闭地点筛选')
    checks.push(
      'Location already has independent empty toggle; parent deselection and depth filtering do not remove unrelated empty/shallow nodes',
    )
    await page.getByRole('button', { name: /^时间范围/ }).click()
    await page.getByRole('textbox', { name: '筛选开始日期', exact: true }).fill('2021')
    await count(2)
    await check('显示完全未填写时间的事件', true)
    await count(3)
    await page
      .getByRole('combobox', { name: '时间筛选方式', exact: true })
      .selectOption('exclude')
    await count(2)
    await click('取消筛选')
    await count(4)
    await click('关闭时间筛选')
    await click('切换时间轴')
    await page.locator('.book-select').filter({ hasText: 'history' }).click()
    await count(6)
    await page.getByRole('button', { name: /^时间范围/ }).click()
    await page
      .getByRole('combobox', { name: '筛选开始历法', exact: true })
      .selectOption('乾隆')
    await page
      .getByRole('combobox', { name: '筛选结束历法', exact: true })
      .selectOption('乾隆')
    await count(3)
    await check('显示时间信息不足的事件', false)
    await count(1)
    await check('显示完全未填写时间的事件', true)
    await count(2)
    await page
      .getByRole('combobox', { name: '时间筛选方式', exact: true })
      .selectOption('exclude')
    await count(3)
    await check('显示时间信息不足的事件', true)
    await count(5)
    await save()
    const policies = (await read()).filters
    await app.close()
    await launch()
    await count(5)
    assert.deepEqual((await read()).filters, policies)
    for (const width of [1480, 1060]) {
      await app.evaluate(
        ({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0].setSize(w, 960),
        width,
      )
      const gap = await page.locator('.time-filter-body').evaluate((el) => {
        const edge = el.getBoundingClientRect().left + el.clientLeft + el.clientWidth
        return Math.min(
          ...[...el.querySelectorAll('select, input:not([type="checkbox"])')].map(
            (input) => edge - input.getBoundingClientRect().right,
          ),
        )
      })
      assert(gap >= 15.5, `time scrollbar gap ${gap}`)
      await page.screenshot({ path: path.join(out, `time-spacing-${width}.png`) })
    }
    await page.screenshot({ path: path.join(out, 'time-policy.png') })
    await click('关闭时间筛选')
    await click('切换时间轴')
    await page.locator('.book-select').filter({ hasText: 'mixed' }).click()
    await count(4)
    checks.push(
      'Time inclusion/exclusion, missing dynasty and coarse Qing, fully unknown, independent switches and restart persistence; location completeness',
    )
    for (const [key, label] of fields) {
      await page.getByRole('button', { name: label + ' 3', exact: true }).click()
      await check(`筛选${label} 未关联`, false)
      await click(`关闭${label}筛选`)
    }
    await save()
    const before = await read()
    await app.close()
    await launch()
    await count(4)
    assert.deepEqual((await read()).filters, before.filters)
    const backup = path.join(out, 'backup-v9.json')
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file })
    }, backup)
    await click('导出 JSON')
    await page.getByRole('button', { name: /^当前时间轴/ }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    const data = JSON.parse(await fs.readFile(backup, 'utf8'))
    assert.equal(data.version, 9)
    assert.deepEqual(data.timelines[0].filters, before.filters)
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
    }, backup)
    await click('导入 JSON')
    await click('确认导入')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await count(4)
    await save()
    assert.deepEqual((await read()).filters, before.filters)
    await click('国家 3')
    assert(
      await page.getByRole('checkbox', { name: '未填写国家', exact: true }).isChecked(),
    )
    assert.equal(
      await page
        .getByRole('checkbox', { name: '筛选国家 未关联', exact: true })
        .isChecked(),
      false,
    )
    await page.screenshot({ path: path.join(out, 'country-fixed.png') })
    await click('关闭国家筛选')
    for (const width of [1480, 1060]) {
      await app.evaluate(
        ({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0].setSize(w, 960),
        width,
      )
      const shift = await page.locator('.virtual-track').evaluate((el) => {
        const rects = () =>
          ['.time-column', '.axis', '.event-card'].map((s) => {
            const r = el.querySelector(s).getBoundingClientRect()
            return { x: r.x, width: r.width }
          })
        const actual = rects()
        el.style.transform = 'none'
        const old = rects()
        el.style.removeProperty('transform')
        return {
          diff: actual.map((r, i) => ({
            dx: r.x - old[i].x,
            dw: r.width - old[i].width,
          })),
          overflow: document.documentElement.scrollWidth > innerWidth,
        }
      })
      assert(shift.diff.every((r) => Math.abs(r.dx + 8) < 0.5 && Math.abs(r.dw) < 0.5))
      assert.equal(shift.overflow, false)
    }
    checks.push(
      'Restart and JSON v9 preserve independent empty states; list moves another 8px with unchanged widths at 1480/1060',
    )
  }
  const version = await app.evaluate(({ app }) => app.getVersion())
  assert.equal(version, old ? '1.8.0' : '1.8.1')
  assert.deepEqual(errors, [])
  await fs.writeFile(
    path.join(out, 'report.json'),
    JSON.stringify({ version, checks, errors }, null, 2),
  )
  console.log(JSON.stringify({ version, checks, errors }, null, 2))
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
