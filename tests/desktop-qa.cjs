const { _electron } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const root = path.resolve(__dirname, '..'),
  out = path.join(root, 'output', process.env.XUSHI_QA_TAG || 'desktop-qa')
const phase = process.argv[2] || 'create'
let app, page
async function main() {
  await fs.mkdir(out, { recursive: true })
  const launchEnv = { ...process.env, XUSHI_TEST_DATA: path.join(out, 'profile') }
  delete launchEnv.ELECTRON_RUN_AS_NODE
  app = await _electron.launch({
    executablePath:
      process.env.XUSHI_EXE || path.join(root, 'node_modules/electron/dist/electron.exe'),
    args: process.env.XUSHI_EXE ? [] : ['.'],
    cwd: root,
    env: launchEnv,
  })
  page = await app.firstWindow()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.getByText('已自动保存', { exact: true }).waitFor()
  async function click(name) {
    await page.getByRole('button', { name, exact: true }).click()
  }
  async function fill(name, value) {
    await page.getByRole('textbox', { name, exact: true }).fill(value)
  }
  async function saved() {
    await click('保存')
    await page.getByText('已自动保存', { exact: true }).waitFor()
  }
  if (phase === 'create') {
    await page.screenshot({ path: path.join(out, 'welcome.png') })
    await page.getByRole('button', { name: '新建时间轴', exact: true }).first().click()
    await fill('时间轴名称', '黄昏纪元编年史')
    await fill('时间轴简介', '星火坠落之后，群山与王国的漫长故事。')
    await click('创建时间轴')
    await click('添加节点')
    await fill('事件内容', '旅人抵达白塔。'.repeat(21) + '故事末尾')
    await fill('时代', '黄昏纪元')
    await fill('朝代', '银月王朝')
    await fill('历法', '光历2年')
    await fill('日期', '1234.5.6')
    await fill('时刻', '17:00:73')
    await fill('地点1级', '北境')
    await fill('地点3级', '白塔')
    await fill('组织1级', '观星会')
    await fill('组织5级', '探险分队')
    await fill('国家', '银月')
    await fill('角色标签', 'Zoe Alice 白羽 Alice')
    await click('完成')
    await saved()
    const excerpt = await page.locator('.event-excerpt').innerText()
    assert.equal(Array.from(excerpt).length, 101)
    assert(excerpt.endsWith('…'))
    assert((await page.locator('.detail-event').innerText()).endsWith('故事末尾'))
    await click('编辑节点')
    const editor = page.getByRole('textbox', { name: '事件内容', exact: true })
    await editor.click()
    await page.keyboard.press('Control+Home')
    await page.keyboard.press('Control+Shift+End')
    for (const label of ['加粗', '下划线', '斜体', '删除线', '屏蔽文字']) await click(label)
    await click('完成')
    await saved()
    const spoiler = page.locator('.detail-event .spoiler').first()
    await page.mouse.move(5, 5)
    const before = await spoiler.evaluate((e) => getComputedStyle(e).color)
    const rect = await spoiler.evaluate((e) => {
      const r = e.getClientRects()[0]
      return { x: r.x + 3, y: r.y + 3 }
    })
    await page.mouse.move(rect.x, rect.y)
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector('.detail-event .spoiler')).color !==
        'rgba(0, 0, 0, 0)',
    )
    const after = await spoiler.evaluate((e) => getComputedStyle(e).color)
    assert.notEqual(before, after)
    const library = await page.evaluate(() => window.desktop.load())
    const data = await page.evaluate((id) => window.desktop.read(id), library.timelines[0].id)
    assert.equal(data.nodes[0].event[0].marks.length, 5)
    assert.deepEqual(data.characters, ['白羽', 'Alice', 'Zoe'])
    await click('显示设置')
    await page.getByRole('combobox', { name: '日期显示格式' }).selectOption('chinese')
    await page.getByRole('checkbox', { name: '朝代', exact: true }).uncheck()
    await click('雾蓝')
    await click('关闭对话框')
    await click('已有角色 3')
    await saved()
    assert((await page.locator('.time-column').innerText()).includes('1234年5月6日'))
    assert(!(await page.locator('.time-column').innerText()).includes('银月王朝'))
    await page.screenshot({ path: path.join(out, 'blue-detail.png') })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1060, 700))
    await page.screenshot({ path: path.join(out, 'minimum-window.png') })
    const fit = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth > innerWidth,
      y: document.documentElement.scrollHeight > innerHeight,
      main: document.querySelector('.main-area').getBoundingClientRect().right,
      width: innerWidth,
    }))
    assert.equal(fit.x, false)
    assert.equal(fit.y, false)
    assert(fit.main <= fit.width)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1480, 960))
    for (const name of ['草木', '灰白', '烟粉', '黑金', '雾蓝']) {
      await click('显示设置')
      await click(name)
      await page.waitForTimeout(200)
      await page.screenshot({ path: path.join(out, 'theme-' + name + '.png') })
      await click('关闭对话框')
    }
    await page.getByRole('combobox', { name: '筛选地点1级' }).selectOption('北境')
    await page.getByRole('checkbox', { name: '显示无地点事件' }).uncheck()
    await saved()
    await click('添加节点')
    await fill('事件内容', '草稿会在重启后恢复')
    await fill('日期', '1234.7')
    await saved()
    assert.deepEqual(errors, [])
    console.log(
      'PASS create: rich text, 100-character preview, detail, fictional time, roles, themes, date display, filters, viewport, draft',
    )
  } else if (phase === 'reopen') {
    assert.equal(
      await page.getByRole('textbox', { name: '事件内容' }).innerText(),
      '草稿会在重启后恢复',
    )
    await click('完成')
    await saved()
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'blue')
    assert.equal(await page.getByRole('checkbox', { name: '显示无地点事件' }).isChecked(), false)
    assert.equal(await page.getByRole('combobox', { name: '筛选地点1级' }).inputValue(), '北境')
    await click('清除筛选')
    await saved()
    assert.equal(await page.locator('.event-card').count(), 2)
    await click('显示设置')
    assert.equal(await page.getByRole('combobox', { name: '日期显示格式' }).inputValue(), 'chinese')
    assert.equal(await page.getByRole('checkbox', { name: '朝代', exact: true }).isChecked(), false)
    await click('关闭对话框')
    const exportPaths = {
      json: path.join(out, 'export.json'),
      md: path.join(out, 'export.md'),
      png: path.join(out, 'export.png'),
    }
    await app.evaluate(({ dialog }, paths) => {
      dialog.showSaveDialog = async (_, options) => {
        const ext = options.filters[0].extensions[0]
        return { canceled: false, filePath: paths[ext] }
      }
    }, exportPaths)
    await click('导出')
    await page.getByRole('button', { name: /JSON · 当前时间轴/ }).click()
    const exported = JSON.parse(await fs.readFile(exportPaths.json, 'utf8'))
    assert.equal(exported.timelines[0].nodes.length, 2)
    await click('导出')
    await click('导出 Markdown')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    assert((await fs.readFile(exportPaths.md, 'utf8')).includes('故事末尾'))
    await click('导出')
    await click('导出 PNG 图片')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    assert.equal(
      (await fs.readFile(exportPaths.png)).subarray(0, 8).toString('hex'),
      '89504e470d0a1a0a',
    )
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
    }, exportPaths.json)
    await click('导入 JSON')
    await click('确认导入')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    assert.equal((await page.evaluate(() => window.desktop.load())).timelines.length, 2)
    await page.locator('.event-card').first().click()
    await click('编辑节点')
    await fill('事件内容', '新内容')
    await click('完成')
    await saved()
    assert.equal(await page.locator('.detail-event').innerText(), '新内容')
    await click('删除节点')
    await click('确认删除')
    await saved()
    assert.equal(
      (
        await page.evaluate(async () => {
          const index = await window.desktop.load()
          return await window.desktop.read(index.settings.activeId)
        })
      ).nodes.length,
      1,
    )
    await click('修改时间轴信息')
    await fill('时间轴名称', '导入副本')
    await click('完成')
    await saved()
    await page.screenshot({ path: path.join(out, 'imported.png') })
    assert.deepEqual(errors, [])
    console.log(
      'PASS reopen: saved preferences and draft, JSON/Markdown/PNG actual files, import, editing, deleting, rename',
    )
  } else if (phase === 'stress') {
    const index = await page.evaluate(() => window.desktop.load()),
      sample = await page.evaluate((id) => window.desktop.read(id), index.timelines[0].id)
    const base = sample.nodes[0]
    const big = {
      ...sample,
      id: 'stress-doc',
      title: '一万节点压力验证',
      filters: {
        query: '',
        location: ['', '', '', '', ''],
        organization: ['', '', '', '', ''],
        showNoLocation: true,
        showNoOrganization: true,
        country: '',
        character: '',
      },
      nodes: Array.from({ length: 10000 }, (_, i) => ({
        ...base,
        id: 'event-' + i,
        time: ['纪元1', '', '', `1234.5.${i + 1}`, ''],
        event: [{ text: '第 ' + (i + 1) + ' 个事件。群星低垂，旅人沿着山脊前行。', marks: [] }],
      })),
    }
    const file = path.join(out, 'stress.json')
    await fs.writeFile(file, JSON.stringify({ format: 'xushi', version: 1, timelines: [big] }))
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
    }, file)
    await click('导入 JSON')
    await click('确认导入')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await saved()
    assert((await page.locator('.event-card').count()) < 20)
    assert.equal(
      await page.getByRole('button', { name: '添加节点', exact: true }).isDisabled(),
      true,
    )
    await click('到达底部')
    await page.getByRole('button', { name: '查看第 10000 个事件', exact: true }).click()
    assert((await page.locator('.detail-event').innerText()).includes('第 10000 个事件'))
    await fill('搜索事件', '第 9999 个事件')
    assert.equal(await page.locator('.event-card').count(), 1)
    await click('清除搜索')
    await click('回到顶部')
    await page.screenshot({ path: path.join(out, '10000-nodes.png') })
    const exportPng = path.join(out, 'paged.png')
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file })
    }, exportPng)
    // Staging a 15-node fixture exercises the same native export path at a page boundary.
    const small = {
      ...big,
      id: 'png-fixture',
      title: 'PNG 分页验证',
      nodes: big.nodes.slice(0, 15),
    }
    await fs.writeFile(file, JSON.stringify({ format: 'xushi', version: 1, timelines: [small] }))
    await click('导入 JSON')
    await click('确认导入')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await click('导出')
    await click('导出 PNG 图片')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    assert.equal(
      (await fs.readFile(path.join(out, 'paged-002.png'))).subarray(0, 8).toString('hex'),
      '89504e470d0a1a0a',
    )
    assert.deepEqual(errors, [])
    console.log(
      'PASS stress: 10000 nodes, bounded DOM, last-node navigation, capacity UI, search, paged native PNG',
    )
  } else if (phase === 'installed') {
    const actual = await page.evaluate(() => window.desktop.version())
    assert.equal(actual, '1.0.0')
    console.log('Installed version: ' + actual)
    await page.screenshot({ path: path.join(out, 'installed.png') })
  }
  await page.evaluate(() => window.desktop.close())
  await app.close().catch(() => {})
}
main().catch(async (error) => {
  console.error(error)
  if (page)
    await page.screenshot({ path: path.join(out, 'failure-' + phase + '.png') }).catch(() => {})
  if (app) await app.evaluate(({ app }) => app.exit()).catch(() => {})
  process.exitCode = 1
})
