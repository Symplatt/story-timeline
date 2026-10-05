// Real Electron regression against a private synthetic profile; no personal data.
const { _electron } = require('playwright')
const fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict')
const { Store } = require('../electron/store.cjs')
const root = path.resolve(__dirname, '..'),
  out = path.join(root, 'output', process.env.XUSHI_QA_TAG || 'qa-1.4.0'),
  profile = path.join(out, 'profile')
const blank = () => ['', '', '', '', ''],
  time = (date) => ['', '', '', date, '']
const phase = process.argv[2] || 'create',
  checks = [],
  errors = []
let app, page
async function main() {
  await fs.mkdir(out, { recursive: true })
  if (phase === 'create') {
    const node = (id, date, text, countries = []) => ({
      id,
      time: time(date),
      location: blank(),
      organization: blank(),
      countries,
      characters: ['Alice', 'Bob'],
      event: [{ text, marks: [] }],
      createdAt: '2026-10-05T00:00:00Z',
    })
    const a = node('a', '1999', '年份事件', ['北境', '南国'])
    a.location[2] = '北城'
    a.organization = ['公会', '', '研究部', '', '']
    const b = node('b', '2000.5', '月份事件', ['南国'])
    b.location[2] = '南城'
    const c = node('c', '1998', '时间段事件')
    c.endTime = time('2000.6')
    const d = node('d', '', '长篇内容'.repeat(150))
    d.time[0] = '混沌'
    const store = new Store(path.join(profile, 'workspace'))
    await store.save({
      id: 'fixture13',
      title: '交互测试',
      description: '',
      nodes: [a, b, c, d],
      characters: ['Alice', 'Bob'],
      countries: ['北境', '南国'],
      timeOrder: [
        ['混沌', '黄昏', '黎明'],
        ['唐', '宋'],
        ['光历', '圣历'],
      ],
      updatedAt: '2026-10-05T00:00:00Z',
    })
    await store.settings({
      theme: 'gold',
      activeId: 'fixture13',
      visibleTime: [true, true, true, true, true],
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
  page.setDefaultTimeout(15000)
  page.on('pageerror', (e) => errors.push(e.message))
  const click = (name) => page.getByRole('button', { name, exact: true }).click()
  const fill = (name, value) =>
    page.getByRole('textbox', { name, exact: true }).fill(value)
  const count = (n) =>
    page.waitForFunction(
      (n) =>
        document.querySelector('.filtered-count')?.textContent.trim() ===
        `筛选后 ${n.toLocaleString()} 个节点`,
      n,
    )
  const save = async () => {
    await click('保存')
    await page.getByText('已自动保存', { exact: true }).waitFor()
  }
  const read = () =>
    page.evaluate(async () => {
      const index = await window.desktop.load()
      return window.desktop.read(index.settings.activeId)
    })
  await page.getByText('已自动保存', { exact: true }).waitFor()
  assert.equal(await app.evaluate(({ app }) => app.getVersion()), require('../package.json').version)
  if (phase === 'create') {
    await count(4)
    // Exercise the flexible center of every header rather than its icon or text.
    const headings = page.locator('.sidebar-scroll .collapse-toggle')
    assert.equal(await headings.count(), 5)
    for (let i=0;i<5;i++) {
      const h=headings.nth(i); const b=await h.boundingBox()
      await h.click({position:{x:b.width * .68,y:b.height/2}})
      assert.equal(await h.getAttribute('aria-expanded'),'true')
      assert.equal(await page.locator('#filter-dock [role=region]').count(),1)
      const geometry=await page.evaluate(()=>({panel:document.querySelector('#filter-dock').getBoundingClientRect().right,content:document.querySelector('.main-area').getBoundingClientRect().left}))
      assert(geometry.content>=geometry.panel-1)
      await h.click({position:{x:b.width * .68,y:b.height/2}})
      assert.equal(await h.getAttribute('aria-expanded'),'false')
    }
    checks.push('All five header centers clickable; one independent dock pushes timeline right')
    await page.getByRole('button',{name:/^时间范围/}).click()
    for (const [name, options] of [['时代',['混沌','黎明']],['朝代',['唐','宋']],['历法',['光历','圣历']]]) {
      const select=page.getByRole('combobox',{name:'筛选开始'+name,exact:true})
      await select.selectOption(options[0]);await select.selectOption(options[1]);assert.equal(await select.inputValue(),options[1]);await select.selectOption('')
    }
    await page.getByRole('textbox',{name:'筛选开始日期',exact:true}).fill('1999')
    await page.getByRole('textbox',{name:'筛选开始日期',exact:true}).press('Enter')
    assert.equal(await page.getByRole('textbox',{name:'筛选开始日期',exact:true}).evaluate(el=>document.activeElement===el),false)
    await click('取消时间筛选');await count(4);await click('关闭时间筛选')
    checks.push('Re-select all three time categories and Enter blurs text input; individual reset')
    assert.equal(await page.locator('[placeholder],[data-placeholder]').count(), 0)
    await page.locator('[data-node-id="d"] .event-card').dblclick()
    assert.equal(await page.locator('[data-node-id="d"] .event-excerpt').innerText(),'长篇内容'.repeat(150))
    await page.locator('[data-node-id="d"]').getByRole('button',{name:'收起全文',exact:true}).click()
    await click('已有国家 2')
    assert.equal(await page.getByRole('checkbox',{name:'全部国家',exact:true}).evaluate(el=>getComputedStyle(el).borderTopWidth),'0px')
    await page.getByRole('checkbox', { name: '全部国家', exact: true }).click()
    await count(0)
    await page.getByRole('checkbox', { name: '筛选国家 南国', exact: true }).check()
    await count(2)
    await page.getByRole('checkbox', { name: '筛选国家 北境', exact: true }).check()
    await count(4)
    await page.getByRole('checkbox', { name: '全部国家', exact: true }).click()
    await count(0)
    await click('清空筛选')
    await count(4)
    await click('已有人物 2')
    await page.getByRole('checkbox', { name: '全部人物', exact: true }).click()
    await count(0)
    await page.getByRole('checkbox', { name: '筛选人物 Alice', exact: true }).check()
    await count(4)
    await click('清空筛选')
    await click('已有组织 2')
    await page.getByRole('checkbox', { name: '全部组织', exact: true }).click()
    await count(0)
    await page.getByRole('checkbox', { name: '筛选组织 研究部', exact: true }).check()
    await count(1)
    checks.push(
      'Country/character/organization checkbox all, none, partial and global reset',
    )
    await click('清空筛选')
    await count(4)
    await click('地点筛选')
    await click('2级')
    const panel = page.getByRole('region', { name: '地点二级筛选栏' })
    await panel.getByRole('checkbox', { name: '全部2级地点', exact: true }).click()
    await panel.getByRole('checkbox', { name: '显示无地点事件', exact: true }).uncheck()
    await count(0)
    await panel
      .getByRole('checkbox', {
        name: '地点2级 未填写（3级 北城）',
        exact: true,
      })
      .check()
    await count(1)
    assert.equal(await page.locator('[data-node-id="a"]').count(), 1)
    const bounds = await panel.boundingBox()
    assert(bounds.width >= 340)
    await page.screenshot({ path: path.join(out, 'location-overlay.png') })
    await click('关闭地点筛选')
    await click('清空筛选')
    await count(4)
    checks.push(
      'Sparse third-level locations selectable/excludable from second-level overlay',
    )
    await page.getByRole('button', {name: /^时间范围/}).click()
    await fill('筛选开始日期', '2000.4')
    await fill('筛选结束日期', '2000.5')
    await count(2)
    await fill('筛选结束日期', '')
    await count(2)
    await fill('筛选开始日期', '')
    await fill('筛选结束日期', '1999')
    await count(3)
    await click('清空筛选')
    await count(4)
    checks.push('Partial range overlap, single-ended and coarse precision filters')
    await page.locator('[data-node-id="a"] .event-card').hover()
    const row = page.locator('[data-node-id="a"]')
    await row.getByRole('button', { name: /编辑第/ }).click()
    assert.equal(await page.locator('[placeholder],[data-placeholder]').count(), 0)
    assert.equal(
      await page.getByRole('textbox', { name: '组织标签', exact: true }).inputValue(),
      '公会 研究部',
    )
    await fill('组织标签', '研究部 观测部')
    await fill('国家标签', '北境 南国')
    await fill('人物标签', 'Alice Bob')
    await page.screenshot({ path: path.join(out, 'editor.png') })
    await click('完成')
    await save()
    assert.deepEqual((await read()).nodes.find((n) => n.id === 'a').organizations, [
      '观测部',
      '研究部',
    ])
    assert((await row.locator('.event-meta').innerText()).includes('Alice，Bob'))
    assert.equal(await row.locator('.hierarchy-value sup').innerText(), '3')
    checks.push(
      'Legacy organizations migrate to independent labels; editor, comma labels and superscripts',
    )
    await page.locator('[data-node-id="b"] .event-card').hover()
    await page
      .locator('[data-node-id="b"]')
      .getByRole('button', { name: /删除第/ })
      .click()
    await count(3)
    assert.equal(await page.getByRole('dialog').count(), 0)
    await save()
    assert(!(await read()).nodes.some((n) => n.id === 'b'))
    checks.push('One-click node deletion without modal')
    await click('显示设置')
    assert.equal(await page.getByText('显示的时间层级',{exact:true}).count(),0)
    assert.equal(await page.locator('.theme-grid button').first().innerText(),'黑白')
    const eras = page.locator('.order-section').first()
    await eras.locator('summary').click()
    const first = eras.locator('li').first(),
      last = eras.locator('li').last()
    await first.hover()
    const a = await first.boundingBox(),
      b = await last.boundingBox()
    await page.mouse.move(a.x + 55, a.y + a.height / 2)
    await page.mouse.down()
    await eras.locator("li.dragging").waitFor()
    await page.mouse.move(b.x + 55, b.y + b.height / 2, { steps: 12 })
    await eras.locator("li.drop-target").filter({hasText: "黎明"}).waitFor()
    await page.mouse.up()
    assert.deepEqual(await eras.locator('.order-name').allInnerTexts(), [
      '黄昏',
      '黎明',
      '混沌',
    ])
    await page.screenshot({ path: path.join(out, 'time-order.png') })
    await page.keyboard.press('Escape')
    await save()
    assert.deepEqual((await read()).timeOrder[0], ['黄昏', '黎明', '混沌'])
    checks.push('Long-press pointer drag reorders time categories and saves')
    if (!await page.getByRole('region', {name:'时间二级筛选栏'}).count()) await page.getByRole('button', {name:/^时间范围/}).click()
    await fill('筛选开始日期', '1999')
    await save()
    await page.screenshot({ path: path.join(out, 'main-gold.png') })
    const exported = path.join(out, 'backup-v4.json')
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file })
    }, exported)
    await click('导出 JSON')
    await page.getByRole('button', { name: /^当前时间轴/ }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    const backup = JSON.parse(await fs.readFile(exported, 'utf8'))
    assert.equal(backup.version, 4)
    assert.deepEqual(backup.timelines[0].nodes, (await read()).nodes)
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
    }, exported)
    await click('导入 JSON')
    await click('确认导入')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await save()
    const imported = await read()
    assert.notEqual(imported.id, backup.timelines[0].id)
    assert.deepEqual(imported.nodes, backup.timelines[0].nodes)
    assert.deepEqual(imported.filters, backup.timelines[0].filters)
    checks.push(
      'JSON v4 native-dialog export/import preserves labels, events, filters and manual order in a new timeline',
    )
    await click('清空筛选')
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1060, 700),
    )
    await click('地点筛选')
    assert.deepEqual(
      await page.evaluate(() => ({
        x: document.documentElement.scrollWidth > innerWidth,
        y: document.documentElement.scrollHeight > innerHeight,
      })),
      { x: false, y: false },
    )
    await page.screenshot({ path: path.join(out, 'minimum-location.png') })
    await click('关闭地点筛选')
    await click('显示设置')
    await click('黑白')
    await page.keyboard.press('Escape')
    await page.screenshot({ path: path.join(out, 'minimum-mono.png') })
    if (!await page.getByRole('region', {name:'时间二级筛选栏'}).count()) await page.getByRole('button', {name:/^时间范围/}).click()
    await fill('筛选开始日期', '1999')
    await save()
    checks.push(
      '1060x700 window fits, place overlay scrolls, gold/mono screenshots inspected',
    )
  } else {
    const data = await read()
    assert.deepEqual(data.timeOrder[0], ['黄昏', '黎明', '混沌'])
    assert.equal(data.filters.startTime[3], '1999')
    assert(!data.nodes.some((n) => n.id === 'b'))
    assert.deepEqual(data.nodes.find((n) => n.id === 'a').organizations, [
      '观测部',
      '研究部',
    ])
    await click('清空筛选')
    await count(3)
    await page.locator('[data-node-id="d"] .event-card').dblclick()
    assert.equal(
      await page.locator('[data-node-id="d"] .event-excerpt').innerText(),
      '长篇内容'.repeat(150),
    )
    checks.push(
      'Restart retains migrated labels, deleted node, manual order and time filters; full event expansion',
    )
  }
  assert.deepEqual(errors, [])
  await fs.writeFile(
    path.join(out, phase + '-report.json'),
    JSON.stringify({ version: require('../package.json').version, checks, errors }, null, 2),
  )
  await app.close()
  console.log(JSON.stringify({ phase, checks, errors }))
}
main().catch(async (e) => {
  console.error(e)
  if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {})
  if (app) await app.close().catch(() => {})
  process.exitCode = 1
})
