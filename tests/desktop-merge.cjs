const { _electron } = require('playwright')
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict')
const { Store } = require('../electron/store.cjs')
const root = path.resolve(__dirname, '..'), out = path.join(root, 'output', process.env.XUSHI_QA_TAG || 'qa-merge-1.4.0')
let app
async function main() {
  const profile = path.join(out, 'profile'), store = new Store(path.join(profile, 'workspace'))
  const fixture = JSON.parse(await fs.readFile(path.join(root, 'output/qa-1.4.0/backup-v4.json'), 'utf8')).timelines[0]
  fixture.id = 'merge-current'; fixture.title = '合并目标'; fixture.filters.query = '测试筛选保留'
  await store.save(fixture); await store.settings({activeId:fixture.id, theme:'mono', visibleTime:[false,false,false,false,false]})
  const incoming = JSON.parse(JSON.stringify(fixture)); incoming.title='导入来源';incoming.filters.query=''
  incoming.timeOrder[0] = ['新纪元',...incoming.timeOrder[0]]
  incoming.nodes[0].time[0]='新纪元'
  const source=path.join(out,'source.json');await fs.writeFile(source,JSON.stringify({format:'xushi',version:4,timelines:[incoming]}))
  const env={...process.env,XUSHI_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE
  app=await _electron.launch({executablePath:process.env.XUSHI_EXE || require('electron'),args:process.env.XUSHI_EXE?[]:['.'],cwd:root,env})
  const page=await app.firstWindow(), errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.getByText('已自动保存',{exact:true}).waitFor()
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},source)
  await page.getByRole('button',{name:'导入 JSON',exact:true}).click()
  assert.equal(await page.getByRole('dialog').count(),1)
  await page.getByRole('radio',{name:/合并到当前时间轴/}).check()
  await page.getByRole('button',{name:'确认导入',exact:true}).click()
  await page.getByRole('dialog').waitFor({state:'hidden'})
  const loaded=await page.evaluate(()=>window.desktop.load())
  assert.equal(loaded.timelines.length,1)
  const merged=await page.evaluate(()=>window.desktop.read('merge-current'))
  assert.equal(merged.title,'合并目标');assert.equal(merged.nodes.length,fixture.nodes.length*2)
  assert.equal(new Set(merged.nodes.map(n=>n.id)).size,merged.nodes.length)
  assert.equal(merged.filters.query,'测试筛选保留')
  assert.deepEqual(merged.timeOrder[0],[...fixture.timeOrder[0],'新纪元'])
  await page.getByRole('button',{name:'清空筛选',exact:true}).click()
  assert((await page.locator('.time-column').allInnerTexts()).some(t=>t.includes('1999年')))
  await page.getByRole('button',{name:'保存',exact:true}).click()
  await page.getByText('已自动保存',{exact:true}).waitFor()
  assert.deepEqual(errors,[])
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify({version:require('../package.json').version,mergePreservesOriginal:true,newNodeIds:true,orderPreserved:true,oldHiddenTimeNowVisible:true,errors},null,2))
  await app.close();app=null
  console.log('PASS single-page merge, original metadata, independent nodes, order and removal of hidden time')
}
main().catch(async e=>{console.error(e);if(app)await app.close().catch(()=>{});process.exitCode=1})
