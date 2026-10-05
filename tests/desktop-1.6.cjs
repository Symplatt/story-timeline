const { _electron } = require('playwright')
const fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict')
const { Store } = require('../electron/store.cjs')
const root = path.resolve(__dirname, '..'),
  out = path.join(root, 'output', process.env.XUSHI_QA_TAG || 'qa-1.6.0'),
  profile = path.join(out, 'profile')
let app, page
const errors = [],
  checks = []
const blank = () => ['', '', '', '', '']
const node = (id, time, location, text) => ({
  id,
  time,
  location,
  countries: ['北国', '南国'],
  organizations: ['公会', '研究部'],
  characters: ['甲', '乙'],
  event: [{ text, marks: [] }],
  createdAt: '2026-10-05T00:00:00Z',
})
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
async function main() {
  await fs.mkdir(out, { recursive: true })
  const nodes = [
    node('ming', ['', '明', '', '', ''], ['国', '省', '城', '', ''], '明朝事件'),
    node(
      'qing',
      ['中国近世', '清', '乾隆', '1.5.6', '08:03:59'],
      ['国', '省', '城', '区甲', '街'],
      '清朝事件',
    ),
    node(
      'late',
      ['中国近世', '清', '宣统', '3', ''],
      ['国', '省', '城', '区乙', ''],
      '末年事件',
    ),
    node('sparse', ['', '', '', '2026', ''], ['', '', '散城', '', ''], '短事件'),
    node(
      'long',
      ['', '', '', '2027', ''],
      blank(),
      '前文'.repeat(65) + '搜索目标' + '后文'.repeat(40),
    ),
  ]
  nodes[4].event = [
    { text: '前文'.repeat(65) + '搜索', marks: ['bold'] },
    { text: '目标', marks: ['italic'] },
    { text: '后文'.repeat(40), marks: [] },
  ]
  const countries = [
    '北国',
    '南国',
    ...Array.from({ length: 48 }, (_, i) => `国${i + 1}`),
  ]
  const t = {
    id: 'fixture15',
    title: '联动测试',
    description: '测试数据',
    nodes,
    countries,
    organizations: ['公会', '研究部'],
    characters: ['甲', '乙'],
    timeOrder: [['中国近世'], ['明', '清'], ['乾隆', '宣统']],
    updatedAt: '2026-10-05T00:00:00Z',
  }
  const store = new Store(path.join(profile, 'workspace'))
  await store.save(t)
  await store.settings({ theme: 'gold', activeId: t.id })
  await launch()
  const click = (name) => page.getByRole('button', { name, exact: true }).click()
  const count = (n) =>
    page.waitForFunction(
      (n) =>
        document.querySelector('.filtered-count')?.textContent.trim() ===
        `筛选后 ${n} 个节点`,
      n,
    )
  const read = () =>
    page.evaluate(async () => {
      const x = await window.desktop.load()
      return window.desktop.read(x.settings.activeId)
    })
  const save = async () => {
    await click('保存')
    await page.getByText('已自动保存', { exact: true }).waitFor()
  }
  await count(5)
  assert.equal(
    await page.locator('[data-node-id=qing] .location-path').innerText(),
    '国-省-城-区甲-街',
  )
  assert.equal(await page.locator('.event-meta sup').count(), 0)
  assert.equal(
    await page.locator('.timeline-row').first().getAttribute('data-node-id'),
    'ming',
  )
  assert(
    (await page.locator('[data-node-id=ming] .time-column').innerText()).includes(
      '???',
    ),
  )
  assert(
    !(await page.locator('[data-node-id=qing] .time-column').innerText()).includes(
      ':59',
    ),
  )
  checks.push('Manual Ming before Qing, missing time placeholders, minute display')
  await page.locator('[data-node-id=long] .event-card').dblclick()
  assert.equal(await page.locator('[data-node-id=long] .ellipsis').count(), 0)
  await page.locator('[data-node-id=long] .event-card').dblclick()
  assert.equal(await page.locator('[data-node-id=long] .ellipsis').count(), 1)
  await page.getByRole('textbox', { name: '搜索事件', exact: true }).fill('搜索目标')
  await count(1)
  assert.equal(
    (await page.locator('.event-excerpt mark').allInnerTexts()).join(''),
    '搜索目标',
  )
  await click('清空筛选')
  await count(5)
  checks.push(
    'Double click toggles; search across rich-text marks highlights a match beyond preview',
  )
  await page.getByRole('button', { name: /^时间范围/ }).click()
  await page
    .getByRole('combobox', { name: '筛选开始历法', exact: true })
    .selectOption('乾隆')
  assert.equal(
    await page
      .getByRole('combobox', { name: '筛选开始时代', exact: true })
      .inputValue(),
    '中国近世',
  )
  assert.equal(
    await page
      .getByRole('combobox', { name: '筛选开始朝代', exact: true })
      .inputValue(),
    '清',
  )
  await page
    .getByRole('combobox', { name: '筛选开始时代', exact: true })
    .selectOption('')
  await page
    .getByRole('combobox', { name: '筛选开始朝代', exact: true })
    .selectOption('明')
  assert.equal(
    await page
      .getByRole('combobox', { name: '筛选开始历法', exact: true })
      .inputValue(),
    '',
  )
  assert.equal(
    await page
      .getByRole('combobox', { name: '筛选开始时代', exact: true })
      .locator('option:checked')
      .innerText(),
    '未填写',
  )
  assert.equal(
    await page
      .getByRole('combobox', { name: '筛选开始历法', exact: true })
      .locator('option[value="乾隆"]')
      .count(),
    0,
  )
  await page
    .getByRole('combobox', { name: '筛选结束朝代', exact: true })
    .selectOption('清')
  assert.equal(
    await page
      .getByRole('combobox', { name: '筛选结束历法', exact: true })
      .locator('option[value="乾隆"]')
      .count(),
    1,
  )
  await page.screenshot({ path: path.join(out, 'time-ancestry.png') })
  await click('取消筛选')
  await click('关闭时间筛选')
  await count(5)
  checks.push(
    'Lower time selection fills ancestors; changing dynasty clears calendar and marks missing era',
  )
  await click('地点筛选')
  assert.equal(await page.locator('.place-tree th').count(), 5)
  assert.equal(await page.locator('.place-tree tbody tr').count(), 3)
  assert.equal(await page.locator('.place-placeholder').count(), 2)
  assert.equal(await page.locator('.place-placeholder input').count(), 0)
  await page.getByRole('checkbox', { name: '全部4级地点', exact: true }).click()
  await count(3)
  assert.equal(await page.locator('[data-node-id=ming]').count(), 1)
  await page.getByRole('checkbox', { name: '地点3级 城', exact: true }).check()
  await page.getByRole('checkbox', { name: '地点3级 城', exact: true }).uncheck()
  await count(2)
  await page.getByRole('checkbox', { name: '地点4级 区甲', exact: true }).check()
  await count(3)
  await page.getByRole('checkbox', { name: '地点4级 区乙', exact: true }).check()
  await count(5)
  assert.equal(
    await page.getByRole('checkbox', { name: '地点3级 城', exact: true }).isChecked(),
    true,
  )
  await page.screenshot({ path: path.join(out, 'place-tree.png') })
  await click('取消筛选')
  await click('关闭地点筛选')
  checks.push(
    'Unified five-level table, terminal events survive depth deselection, parent/child selection propagates',
  )
  await click('国家 50')
  const dims = await page.locator('.filter-values').evaluate((el) => ({
    cols: getComputedStyle(el).gridTemplateColumns.split(' ').length,
    bottom: el.getBoundingClientRect().bottom,
    parent: el.closest('.filter-panel').getBoundingClientRect().bottom,
  }))
  assert.equal(dims.cols, 4)
  assert(dims.parent - dims.bottom < 30)
  assert.equal(await page.locator('.active-filter').count(), 0)
  assert.equal(
    await page.getByRole('textbox', { name: '搜索国家' }).getAttribute('placeholder'),
    '搜索',
  )
  await page.getByRole('checkbox', { name: '全部国家', exact: true }).click()
  await count(0)
  assert.equal(
    await page.getByRole('checkbox', { name: '全部国家', exact: true }).innerText(),
    '全选',
  )
  await page.getByRole('checkbox', { name: '筛选国家 北国', exact: true }).check()
  await count(5)
  await page.screenshot({ path: path.join(out, 'tag-grid.png') })
  await click('取消筛选')
  await click('关闭国家筛选')
  checks.push('Four-column full-height tag grid, compact search, all/none control')
  await page.locator('[data-node-id=ming] .event-card').hover()
  await page
    .locator('[data-node-id=ming]')
    .getByRole('button', { name: /编辑第/ })
    .click()
  await page.getByRole('textbox', { name: '历法', exact: true }).fill('乾隆')
  await page.getByRole('alert').filter({ hasText: '其他上级' }).waitFor()
  assert(await page.getByRole('button', { name: '完成', exact: true }).isDisabled())
  await page.waitForTimeout(800)
  assert.equal((await read()).nodes.find((n) => n.id === 'ming').time[2], '')
  await page.getByRole('textbox', { name: '历法', exact: true }).fill('')
  for (const category of ['国家', '组织', '人物'])
    await page.getByRole('button', { name: new RegExp('^已有' + category) }).click()
  await page.getByRole('textbox', { name: '时刻', exact: true }).fill('08:00')
  await page.getByText('填写时刻前，请先填写日期。', { exact: true }).waitFor()
  assert(await page.getByRole('button', { name: '完成', exact: true }).isDisabled())
  await page.getByRole('textbox', { name: '时刻', exact: true }).fill('')
  await page
    .getByRole('textbox', { name: '组织标签', exact: true })
    .fill('公会，研究部,技术组')
  await page.getByRole('textbox', { name: '人物标签', exact: true }).fill('甲，乙,丙')
  await page.getByRole('textbox', { name: '国家标签', exact: true }).fill('北国，南国')
  await click('完成')
  await save()
  await page.locator('[data-node-id=ming] .event-card').hover()
  await page
    .locator('[data-node-id=ming]')
    .getByRole('button', { name: /编辑第/ })
    .click()
  for (const category of ['国家', '组织', '人物'])
    assert.equal(
      await page
        .getByRole('button', { name: new RegExp('^已有' + category) })
        .getAttribute('aria-expanded'),
      'true',
    )
  await click('完成')
  // Changing several fields must validate against completed ownership, not
  // an intermediate value autosaved earlier in the same edit session.
  await page.locator('[data-node-id=ming] .event-card').hover()
  await page
    .locator('[data-node-id=ming]')
    .getByRole('button', { name: /编辑第/ })
    .click()
  await page.getByRole('textbox', { name: '历法', exact: true }).fill('临时新历')
  await page.keyboard.press('Control+s')
  await page.getByText('已自动保存', { exact: true }).waitFor()
  await page.getByRole('textbox', { name: '朝代', exact: true }).fill('新朝')
  assert.equal(
    await page.getByRole('button', { name: '完成', exact: true }).isDisabled(),
    false,
  )
  await page.getByRole('textbox', { name: '朝代', exact: true }).fill('明')
  await page.getByRole('textbox', { name: '历法', exact: true }).fill('')
  await click('完成')
  checks.push(
    'Editor lists persist; clock requires date; provisional autosaves do not lock new names',
  )
  await click('显示设置')
  await page.getByRole('textbox', { name: '地点1级名称', exact: true }).fill('洲')
  const dynasty = page.locator('.order-section').nth(1)
  await dynasty.locator('summary').click()
  await click('清置顶')
  assert.equal(await dynasty.locator('.order-name').first().innerText(), '清')
  await click('清置底')
  assert.equal(await dynasty.locator('.order-name').first().innerText(), '明')
  await page.screenshot({ path: path.join(out, 'settings.png') })
  await page.keyboard.press('Escape')
  await save()
  await click('切换时间轴')
  await click('复制时间轴 联动测试')
  assert.equal(
    await page.locator('.copy-name').evaluate((el) => document.activeElement === el),
    true,
  )
  assert.equal(await page.locator('.copy-name').inputValue(), '联动测试的副本')
  await page.keyboard.type('独立副本')
  await page.keyboard.press('Enter')
  await page.locator('.book-select').filter({ hasText: '独立副本' }).waitFor()
  await page.locator('.book-select').filter({ hasText: '独立副本' }).click()
  await count(5)
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await save()
  const copy = await read()
  assert.notEqual(copy.id, t.id)
  assert.notEqual(copy.nodes[0].id, t.nodes[0].id)
  assert.deepEqual(
    copy.nodes.map((n) => n.event),
    t.nodes.map((n) => n.event),
  )
  await save()
  checks.push(
    'Custom location names and top/bottom order controls; duplicate inline name focused and independent',
  )
  await click('地点筛选')
  await page.getByRole('checkbox', { name: '全部4级地点', exact: true }).click()
  await click('关闭地点筛选')
  await save()
  const beforeExport = await read(),
    backup = path.join(out, 'backup-v6.json')
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file })
  }, backup)
  await click('导出 JSON')
  await page.getByRole('button', { name: /^当前时间轴/ }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  const exported = JSON.parse(await fs.readFile(backup, 'utf8'))
  assert.equal(exported.version, 6)
  assert.deepEqual(exported.timelines[0].filters, beforeExport.filters)
  assert.deepEqual(exported.timelines[0].timeNames, beforeExport.timeNames)
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    })
  }, backup)
  await click('导入 JSON')
  await click('确认导入')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await save()
  const imported = await read()
  assert.notEqual(imported.id, beforeExport.id)
  assert.deepEqual(imported.nodes, beforeExport.nodes)
  assert.deepEqual(imported.filters, beforeExport.filters)
  await click('清空筛选')
  await save()
  checks.push(
    'Native JSON v6 export/import preserves all participant tags and selected location paths',
  )
  await app.close()
  await launch()
  const state = await page.evaluate(() => window.desktop.load())
  assert.equal(state.settings.locationLabels[0], '洲')
  assert(
    state.settings.countriesOpen &&
      state.settings.organizationsOpen &&
      state.settings.charactersOpen,
  )
  await click('地点筛选')
  assert.equal(await page.locator('.place-level-name').first().innerText(), '洲')
  await click('关闭地点筛选')
  assert.equal(await app.evaluate(({ app }) => app.getVersion()), '1.6.0')
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1060, 700),
  )
  await click('国家 50')
  await page.screenshot({ path: path.join(out, 'compact.png') })
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  )
  checks.push('Restart persistence, app version and 1060px layout')
  await click('关闭国家筛选')
  for (const width of [1480, 1060]) {
    await app.evaluate(
      ({ BrowserWindow }, width) =>
        BrowserWindow.getAllWindows()[0].setSize(width, 960),
      width,
    )
    for (const category of ['时间', '地点', '国家', '组织', '人物']) {
      await page
        .getByRole('button', {
          name:
            category === '时间'
              ? /^时间范围/
              : category === '地点'
                ? '地点筛选'
                : new RegExp('^' + category + ' '),
        })
        .click()
      const spacing = await page.locator('.filter-panel').evaluate((el) => {
        const style = getComputedStyle(el),
          viewport = document.querySelector('.timeline-viewport')
        return {
          left: style.paddingLeft,
          right: style.paddingRight,
          dock: document.querySelector('#filter-dock').getBoundingClientRect().width,
          viewportLeft: getComputedStyle(viewport).paddingLeft,
          viewportRight: getComputedStyle(viewport).paddingRight,
          overflow: document.documentElement.scrollWidth > innerWidth,
        }
      })
      assert.equal(spacing.left, '28px')
      assert.equal(spacing.right, '44px')
      assert.equal(spacing.viewportLeft, '24px')
      assert.equal(spacing.viewportRight, '24px')
      assert.equal(spacing.overflow, false)
      if (width === 1060) assert.equal(spacing.dock, category === '地点' ? 572 : 462)
      await page.screenshot({
        path: path.join(out, `layout-${width}-${category}.png`),
      })
      await click(`关闭${category}筛选`)
    }
  }
  checks.push(
    'All five secondary panels: +32px width, +8/+24px whitespace and equal card gutters at 1480px/1060px',
  )
  assert.deepEqual(errors, [])
  await fs.writeFile(
    path.join(out, 'report.json'),
    JSON.stringify({ checks, errors }, null, 2),
  )
  console.log(JSON.stringify({ checks, errors }, null, 2))
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
