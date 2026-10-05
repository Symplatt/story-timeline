// Synthetic data only. Each invocation uses its own profile under ignored output/.
const { _electron } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { Store } = require('../electron/store.cjs')
const root = path.resolve(__dirname, '..'),
  phase = process.argv[2] || 'stress'
const out = path.join(root, 'output', process.env.XUSHI_QA_TAG || 'qa-1.3.0')
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
  if (phase === 'stress') {
    const store = new Store(path.join(profile, 'workspace'))
    const nodes = Array.from({ length: 10000 }, (_, i) =>
      event(
        'stress-' + i,
        String(i + 1),
        i % 4 ? '短事件 ' + i : '多行事件\n'.repeat(70),
      ),
    )
    await store.save(book('stress', '一万节点', nodes))
    await store.settings({
      theme: 'grass',
      visibleTime: [true, true, true, true, true],
      activeId: 'stress',
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
  const fill = (name, value) =>
    page.getByRole('textbox', { name, exact: true }).fill(value)
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
  if (phase === 'stress') {
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
  assert.equal(actualVersion, '1.3.0')
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
    await page
      .screenshot({ path: path.join(out, phase + '-failure.png') })
      .catch(() => {})
  if (app) await app.close().catch(() => {})
  process.exitCode = 1
})
