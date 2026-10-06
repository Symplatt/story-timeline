import { describe, it, expect } from 'vitest'
import {
  newTimeline,
  visibleTimeLevels,
  timeDisplay,
  displayClock,
  timeParents,
  timeOptions,
  mergeTimeNames,
  reconcileTimeNames,
  assertTimeNamesUnique,
  updateTimeBound,
  MISSING_TIME,
  nodeTimeError,
  duplicateTimeline,
  type TimeOrder,
  newNode,
  compareNodes,
  createNodeComparator,
  mergeTimeOrder,
  mergeTimeline,
  emptyTimeOrder,
  comparePart,
  displayDate,
  normalizeSettings,
  preview,
  matches,
  emptyFilters,
  validateTimeline,
  parseImport,
  sortedCharacters,
  characterList,
  MAX_NODES,
  hierarchyOption,
  matchesTimeRange,
} from '../src/model'

describe('single timeline merge', () => {
  it('preserves current metadata and order, appends independent nodes and tag registries', () => {
    const current = newTimeline('当前'),
      incoming = newTimeline('导入')
    current.timeOrder = [['黎明', '混沌'], [], []]
    incoming.timeOrder = [['混沌', '黄昏', '黎明'], ['唐'], []]
    current.nodes = [node(['黎明'])]
    incoming.nodes = [node(['黄昏'])]
    incoming.nodes[0].id = current.nodes[0].id
    incoming.countries = ['北境']
    incoming.organizations = ['研究部']
    incoming.characters = ['甲']
    current.filters.query = '保留'
    const merged = mergeTimeline(current, incoming)
    expect(merged.id).toBe(current.id)
    expect(merged.title).toBe('当前')
    expect(merged.filters).toEqual(current.filters)
    expect(merged.timeOrder).toEqual([['黎明', '混沌', '黄昏'], ['唐'], []])
    expect(merged.nodes).toHaveLength(2)
    expect(merged.nodes[1].id).not.toBe(current.nodes[0].id)
    merged.nodes[1].event[0].text = '独立副本'
    expect(incoming.nodes[0].event[0].text).toBe('事件')
    expect(merged.countries).toEqual(['北境'])
    expect(merged.organizations).toEqual(['研究部'])
    expect(merged.characters).toEqual(['甲'])
  })
  it('rejects oversized merge before touching existing data', () => {
    const current = newTimeline('当前'),
      incoming = newTimeline('导入')
    current.nodes = Array.from({ length: MAX_NODES }, () => node())
    incoming.nodes = [node()]
    expect(() => mergeTimeline(current, incoming)).toThrow('10000')
    expect(current.nodes).toHaveLength(MAX_NODES)
  })
})
function node(time: string[] = []): ReturnType<typeof newNode> {
  return {
    ...newNode(),
    time: [...time, ...Array(5 - time.length).fill('')] as ReturnType<
      typeof newNode
    >['time'],
    event: [{ text: '事件', marks: [] }],
  }
}
describe('hierarchical fictional chronology', () => {
  it('sorts numeric date and clock text naturally', () => {
    for (let i = 3; i < 5; i++) {
      const a = node(),
        b = node()
      a.time[i] = 'A2'
      b.time[i] = 'A10'
      expect(compareNodes(a, b)).toBeLessThan(0)
    }
  })
  it('puts all unknown events last', () => {
    expect(compareNodes(node(['', '', '', '1234.5.6']), node())).toBeLessThan(0)
  })
  it('puts a date without a clock before the specific time', () => {
    expect(
      compareNodes(
        node(['Era', 'D', 'C', '1234.5.6', '17:00:73']),
        node(['Era', 'D', 'C', '1234.5.6']),
      ),
    ).toBeGreaterThan(0)
  })
  it('puts partial periods before their precise descendants and the next period', () => {
    const values = [node(['A']), node(['B']), node(['A', 'D', 'C', '1'])].sort(
      createNodeComparator([['A', 'B'], ['D'], ['C']]),
    )
    expect(values.map((n) => n.time[0] + n.time[1])).toEqual(['A', 'AD', 'B'])
  })
  it('puts coarse dates before matching more precise dates', () => {
    expect(comparePart('1234.5.6', '1234.5', true)).toBeGreaterThan(0)
    expect(comparePart('1234.5', '1234', true)).toBeGreaterThan(0)
    expect(comparePart('1234', '1235.1', true)).toBeLessThan(0)
  })
  it('puts partial clock before specific seconds', () =>
    expect(comparePart('17:00:73', '17:00', true)).toBeGreaterThan(0))
  it('accepts fictional days and seconds without Date parsing', () => {
    const t = newTimeline('测试')
    t.nodes = [node(['', '', '', '1382.14.78', '17:00:73'])]
    expect(validateTimeline(t).nodes[0].time[4]).toBe('17:00:73')
  })
  it('sorts Chinese and dot dates equally', () => {
    const a = node(['', '', '', '1234年5月6日']),
      b = { ...a, time: ['', '', '', '1234.5.6', ''] as typeof a.time }
    expect(compareNodes(a, b)).toBe(0)
  })
  it('is deterministic for ties', () => {
    const a = node(),
      b = { ...a, id: a.id + 'b' }
    expect(compareNodes(a, b)).toBeLessThan(0)
  })
})
describe('Chinese date display', () => {
  it.each([
    ['1234.5.6', '1234年5月6日'],
    ['1234.5', '1234年5月'],
    ['1234', '1234年'],
    ['001.02.03', '001年02月03日'],
  ])('displays %s in Chinese', (dots, cn) => {
    expect(displayDate(dots)).toBe(cn)
    expect(displayDate(cn)).toBe(cn)
  })
  it('preserves custom alphabetic dates', () => {
    expect(displayDate('A12.月X')).toBe('A12.月X')
  })
})
describe('time ranges and manual era order', () => {
  it('places the requested 1999–2000.5 range after 1888 and before the 1999 point', () => {
    const points = ['1888', '1999', '2000', '2023'].map((value) =>
      node(['', '', '', value]),
    )
    const range = node(['', '', '', '1999'])
    range.endTime = ['', '', '', '2000.5', '']
    expect([...points, range].sort(compareNodes)).toEqual([
      points[0],
      range,
      points[1],
      points[2],
      points[3],
    ])
  })
  it('compares coarse ranges at their known precision before contained precise points', () => {
    const range = node(['', '', '', '1999'])
    range.endTime = ['', '', '', '2000.5', '']
    const dates = ['1998.12.31', '1999.1.1', '1999.5', '2000.5.1', '2023']
    const points = dates.map((value) => node(['', '', '', value]))
    expect([...points, range].sort(compareNodes)).toEqual([
      points[0],
      range,
      ...points.slice(1),
    ])
    expect(
      compareNodes(node(['', '', '', '1999']), node(['', '', '', '1999.5'])),
    ).toBeLessThan(0)
  })
  it('orders nested and overlapping ranges by start, then range before point, then end', () => {
    const a = node(['', '', '', '1999']),
      b = node(['', '', '', '1999']),
      c = node(['', '', '', '2000']),
      point = node(['', '', '', '1999'])
    a.endTime = ['', '', '', '2010', '']
    b.endTime = ['', '', '', '2001', '']
    c.endTime = ['', '', '', '2020', '']
    expect([c, a, point, b].sort(compareNodes)).toEqual([b, a, point, c])
  })
  it('uses independent manual ordering for era, dynasty and calendar', () => {
    const order = [
      ['混沌纪元', '黄昏纪元', '黎明纪元'],
      ['唐', '宋', '元'],
      ['光历10', '光历2'],
    ] as [string[], string[], string[]]
    const compare = createNodeComparator(order)
    const chaos = node(['混沌纪元']),
      dusk = node(['黄昏纪元']),
      dawn = node(['黎明纪元'])
    expect([dawn, dusk, chaos].sort(compare)).toEqual([chaos, dusk, dawn])
    expect(compare(node(['黄昏纪元', '唐']), node(['黄昏纪元', '宋']))).toBeLessThan(0)
    expect(
      compare(node(['黄昏纪元', '唐', '光历10']), node(['黄昏纪元', '唐', '光历2'])),
    ).toBeLessThan(0)
    expect(
      compare(
        node(['黄昏纪元', '唐', '光历2', '1999']),
        node(['黄昏纪元', '唐', '光历2', '1999.5']),
      ),
    ).toBeLessThan(0)
  })
  it('persists manual order, range endpoints, text formats and labels through JSON v3', () => {
    const t = newTimeline('世界'),
      range = node(['黄昏纪元', '', '', '1999'])
    range.endTime = ['黎明纪元', '', '', '2000.5', '17:00:73']
    t.nodes = [range]
    t.timeOrder = [['混沌纪元', '黄昏纪元', '黎明纪元'], [], []]
    expect(parseImport({ format: 'xushi', version: 3, timelines: [t] })[0]).toEqual(
      validateTimeline(t),
    )
    const f = emptyFilters()
    f.query = '黎明纪元'
    expect(matches(range, f)).toBe(true)
  })
  it('keeps known order and appends new names from either endpoint', () => {
    const range = node(['新纪元'])
    range.endTime = ['结束纪元', '', '', '', '']
    expect(mergeTimeOrder([['旧纪元'], [], []], [range])[0]).toEqual([
      '旧纪元',
      '新纪元',
      '结束纪元',
    ])
    const t = newTimeline('旧版作品')
    t.nodes = [range]
    expect(validateTimeline(t).timeOrder).toEqual(
      mergeTimeOrder(emptyTimeOrder(), [range]),
    )
  })
  it('still accepts empty optional endpoints and places unknown starts last', () => {
    const range = node()
    range.endTime = ['', '', '', '2000', '']
    expect(compareNodes(range, node(['', '', '', '1999']))).toBeGreaterThan(0)
    const t = newTimeline('未知')
    t.nodes = [range]
    expect(validateTimeline(t).nodes[0].endTime).toEqual(range.endTime)
  })
  it('preserves a transitive ordering across sparse and mixed precision events', () => {
    const values = [
      node(),
      node(['A']),
      node(['A', 'B']),
      node(['A', '', '', '1999']),
      node(['A', '', '', '1999.5']),
      node(['', '', '', '1999']),
      node(['', '', '', '1999.5']),
    ]
    for (const a of values)
      for (const b of values)
        for (const c of values)
          if (compareNodes(a, b) <= 0 && compareNodes(b, c) <= 0)
            expect(compareNodes(a, c)).toBeLessThanOrEqual(0)
  })
})
describe('event preview and filtering', () => {
  it('counts 200 Unicode characters rather than UTF-16 units', () => {
    const runs = [
      {
        text: '龙'.repeat(199) + '🐉结尾',
        marks: ['bold', 'spoiler'] as const,
      },
    ]
    const p = preview(runs as any)
    expect(Array.from(p.runs[0].text)).toHaveLength(200)
    expect(p.runs[0].text.endsWith('🐉')).toBe(true)
    expect(p.truncated).toBe(true)
    expect(p.runs[0].marks).toEqual(['bold', 'spoiler'])
  })
  it('does not ellipsize an exact 200-character event', () =>
    expect(preview([{ text: 'x'.repeat(200), marks: [] }]).truncated).toBe(false))
  it('preserves formatting across cutoff boundaries', () => {
    const p = preview([
      { text: 'a'.repeat(198), marks: ['underline'] },
      { text: 'abcd', marks: ['italic'] },
    ])
    expect(p.runs[1].text).toBe('ab')
    expect(p.runs[1].marks).toEqual(['italic'])
  })
  it('selects sparse places independently at a missing upper level', () => {
    const a = node(),
      b = node(),
      f = emptyFilters()
    a.location[2] = '北城'
    b.location[2] = '南城'
    f.location.depth = 2
    f.location.selections[1] = [hierarchyOption(a.location, 1).key]
    expect(matches(a, f)).toBe(true)
    expect(matches(b, f)).toBe(false)
    f.location.selections[1] = []
    expect(matches(a, f)).toBe(false)
    f.location.selections[1] = null
    expect(matches(a, f)).toBe(true)
  })
  it('ignores selections deeper than the displayed depth and combines visible levels', () => {
    const n = node(),
      f = emptyFilters()
    n.location = ['世界', '大陆', '城', '', '']
    f.location.depth = 2
    f.location.selections[2] = []
    expect(matches(n, f)).toBe(true)
    f.location.selections[0] = [hierarchyOption(n.location, 0).key]
    f.location.selections[1] = []
    expect(matches(n, f)).toBe(false)
  })
  it('shows unknown locations only when requested', () => {
    const f = emptyFilters()
    f.location.selections[0] = []
    expect(matches(node(), f)).toBe(true)
    f.showNoLocation = false
    expect(matches(node(), f)).toBe(false)
  })
  it('supports OR within country, organization and character groups and AND across groups', () => {
    const n = node(),
      f = emptyFilters()
    n.countries = ['北境', '南国']
    n.characters = ['Alice']
    n.organizations = ['总部', '分部']
    f.countries = { all: false, values: ['西境', '南国'] }
    f.characters = { all: false, values: ['Alice', 'Bob'] }
    f.organizations = { all: false, values: ['分部'] }
    f.query = '事'
    expect(matches(n, f)).toBe(true)
    f.organizations.values = ['错误']
    expect(matches(n, f)).toBe(false)
  })
  it('distinguishes all from none even for events without labels and after serialization', () => {
    const t = newTimeline('筛选')
    t.nodes = [node()]
    for (const key of ['countries', 'characters', 'organizations'] as const) {
      t.filters = emptyFilters()
      t.filters[key] = { all: false, values: [] }
      const copy = validateTimeline(JSON.parse(JSON.stringify(t)))
      expect(matches(copy.nodes[0], copy.filters)).toBe(false)
      t.filters[key].all = true
      expect(matches(t.nodes[0], t.filters)).toBe(true)
    }
  })
  it('deduplicates whitespace separated characters and sorts alphabetically', () => {
    expect(characterList('Zoe  Alice\nBob\tAlice')).toEqual(['Zoe', 'Alice', 'Bob'])
    expect(sortedCharacters(['Zoe', 'Alice', 'Bob2', 'Bob10', 'Alice'])).toEqual([
      'Alice',
      'Bob2',
      'Bob10',
      'Zoe',
    ])
  })
})
describe('capacity and import', () => {
  it('migrates a 1.0 backup without changing events, identifiers or times', () => {
    const legacy: any = newTimeline('旧时间轴')
    delete legacy.countries
    legacy.nodes = [node(['A', 'B', 'C', '123.4.5', '17:00:73'])]
    const n = legacy.nodes[0]
    delete n.countries
    n.country = '北境'
    n.event = [
      {
        text: '完整事件'.repeat(100),
        marks: ['bold', 'underline', 'italic', 'strike', 'spoiler'],
      },
    ]
    legacy.filters = {
      query: '完整',
      location: ['世界', '', '城市', '', ''],
      organization: ['', '', '', '', ''],
      country: '北境',
      character: '',
      showNoLocation: false,
      showNoOrganization: true,
    }
    const [migrated] = parseImport({
      format: 'xushi',
      version: 1,
      timelines: [legacy],
    })
    expect(migrated.nodes[0]).toEqual({
      ...Object.fromEntries(Object.entries(n).filter(([k]) => k !== 'country')),
      countries: ['北境'],
    })
    expect(migrated.countries).toEqual(['北境'])
    expect(migrated.filters.location.legacy).toEqual({
      values: ['城市', '世界'],
      levels: [],
    })
    expect(migrated.filters.countries).toEqual({
      all: false,
      values: ['北境'],
    })
    expect(migrated.filters.showNoLocation).toBe(false)
    expect(
      parseImport({ format: 'xushi', version: 2, timelines: [migrated] })[0],
    ).toEqual(migrated)
  })
  it('retains countries in the known list after events are deleted', () => {
    const t = newTimeline('作品')
    t.countries = ['Z10', 'A', 'Z2', 'A']
    expect(validateTimeline(t).countries).toEqual(['A', 'Z2', 'Z10'])
  })
  it('rejects invalid selected hierarchy levels', () => {
    const t = newTimeline('作品')
    t.filters.location.depth = 6
    expect(() => validateTimeline(t)).toThrow('筛选层级')
  })
  it('restores a legacy draft and retained settings without obsolete display preferences', () => {
    const draft: any = newNode()
    delete draft.countries
    draft.country = '北境'
    const restored = normalizeSettings({
      theme: 'gold',
      dateFormat: 'dots',
      inspector: true,
      visibleTime: [false, true, true, true, true],
      charactersOpen: true,
      activeId: 'book',
      draft: { timelineId: 'book', node: draft, isNew: true },
    })
    expect(restored.theme).toBe('gold')
    expect(restored.visibleTime[0]).toBe(false)
    expect(restored.charactersOpen).toBe(true)
    expect(restored).not.toHaveProperty('dateFormat')
    expect(restored).not.toHaveProperty('inspector')
    expect(restored.draft?.node.countries).toEqual(['北境'])
    expect(restored.draft?.node.event).toEqual([])
  })
  it('accepts exactly 10000 nodes', () => {
    const t = newTimeline('大作品')
    t.nodes = Array.from({ length: MAX_NODES }, () => node())
    expect(validateTimeline(t).nodes).toHaveLength(MAX_NODES)
  })
  it('rejects 10001 nodes', () => {
    const t = newTimeline('大作品')
    t.nodes = Array.from({ length: MAX_NODES + 1 }, () => node())
    expect(() => validateTimeline(t)).toThrow('10000')
  })
  it('accepts 1000 timelines, rejects 1001', () => {
    const raw = {
      format: 'xushi',
      version: 1,
      timelines: Array.from({ length: 1000 }, () => newTimeline('作品')),
    }
    expect(parseImport(raw)).toHaveLength(1000)
    raw.timelines.push(newTimeline('多余'))
    expect(() => parseImport(raw)).toThrow('1000')
  })
  it('rejects empty events and duplicate ids', () => {
    const t = newTimeline('作品')
    t.nodes = [newNode()]
    expect(() => validateTimeline(t)).toThrow('标题和事件至少填写一项')
    t.nodes = [node()]
    t.nodes.push(t.nodes[0])
    expect(() => validateTimeline(t)).toThrow('重复')
  })
  it('rejects traversal ids and unsafe formatting', () => {
    const t = newTimeline('作品')
    t.id = '../index'
    expect(() => validateTimeline(t)).toThrow('标识')
    t.id = 'okay'
    t.nodes = [node()]
    t.nodes[0].event[0].marks = ['script'] as any
    expect(() => validateTimeline(t)).toThrow('不支持')
  })
  it('retains all optional fields and roles through roundtrip', () => {
    const t = newTimeline('世界')
    const n = node(['A', 'B', 'C', '123.4.5', '17:00:73'])
    n.countries = ['北境']
    n.characters = ['Zoe']
    n.location = ['1', '2', '3', '4', '5']
    n.organizations = ['a', 'b', 'c', 'd', 'e']
    t.nodes = [n]
    const [copy] = parseImport(
      JSON.parse(JSON.stringify({ format: 'xushi', version: 1, timelines: [t] })),
    )
    expect(copy.nodes).toEqual(t.nodes)
    expect(copy.characters).toEqual(['Zoe'])
  })
})

describe('inclusive time filtering and organization migration', () => {
  const time = (date: string) =>
    ['', '', '', date, ''] as ReturnType<typeof newNode>['time']
  it.each([
    ['1998', '2000', '1999', '2001', true],
    ['2000', '2002', '1999', '2001', true],
    ['1990', '2009', '1999', '2001', true],
    ['1990', '1998', '1999', '2001', false],
    ['2002', '2003', '1999', '2001', false],
    ['2001.12.31', '', '1999', '2001', true],
    ['1999', '', '1999.5', '2001', true],
    ['2001', '2002', '1999', '2001', true],
  ])('overlap %s–%s against %s–%s', (begin, end, low, high, result) => {
    const n = node(time(begin))
    if (end) n.endTime = time(end)
    expect(matchesTimeRange(n, time(low), time(high))).toBe(result)
  })
  it('supports either open bound, unknown events, reversed bounds and clock precision', () => {
    expect(matchesTimeRange(node(time('2000')), time('1999'))).toBe(true)
    expect(matchesTimeRange(node(time('1998')), time('1999'))).toBe(false)
    expect(matchesTimeRange(node(time('1998')), undefined, time('1999'))).toBe(true)
    expect(matchesTimeRange(node(), time('1999'))).toBe(false)
    expect(matchesTimeRange(node(time('2000')), time('2001'), time('1999'))).toBe(false)
    const n = node(time('2000.5.1'))
    n.time[4] = '17:00:73'
    const upper = time('2000.5.1')
    upper[4] = '17:00'
    expect(matchesTimeRange(n, undefined, upper)).toBe(true)
  })
  it('uses manual epoch order for range bounds', () => {
    const order: [string[], string[], string[]] = [['混沌', '黄昏', '黎明'], [], []]
    expect(
      matchesTimeRange(node(['黄昏']), node(['混沌']).time, node(['黎明']).time, order),
    ).toBe(true)
    expect(
      matchesTimeRange(node(['混沌']), node(['黄昏']).time, undefined, order),
    ).toBe(false)
  })
  it('migrates legacy organization levels into labels and keeps original names', () => {
    const t: any = newTimeline('旧版')
    const n: any = node()
    delete n.organizations
    n.organization = ['公会', '', '研究部', '', '']
    t.nodes = [n]
    delete t.organizations
    const copy = parseImport({
      format: 'xushi',
      version: 3,
      timelines: [t],
    })[0]
    expect(copy.nodes[0].organizations).toEqual(sortedCharacters(['公会', '研究部']))
    expect(copy.organizations).toEqual(copy.nodes[0].organizations)
    expect(copy.nodes[0]).not.toHaveProperty('organization')
    expect(parseImport({ format: 'xushi', version: 4, timelines: [copy] })[0]).toEqual(
      copy,
    )
  })
})

it('does not infer alphabetic order for unknown filter categories', () => {
  expect(
    matchesTimeRange(node(['黎明']), node(['未知纪元']).time, undefined, [
      ['黎明'],
      [],
      [],
    ]),
  ).toBe(false)
})

describe('1.5 time and data behavior', () => {
  it('places an unassigned Ming before Qing by manual dynasty order without changing data', () => {
    const ming = node(['', '明']),
      qing = node(['中国近世', '清', '乾隆', '1']),
      late = node(['中国近世', '清', '宣统', '3'])
    const order: TimeOrder = [['中国近世'], ['明', '清'], ['乾隆', '宣统']]
    expect(
      [qing, late, ming].sort(createNodeComparator(order, [qing, late, ming])),
    ).toEqual([ming, qing, late])
    expect(ming.time[0]).toBe('')
  })
  it('sorting remains antisymmetric and transitive with sparse mixed ancestors', () => {
    const nodes = [
      node(['A', '甲']),
      node(['B', '丙']),
      node(['', '乙']),
      node(['B']),
      node(['', '', '历一', '1']),
      node(['A', '甲', '历一', '1']),
      node(['', '', '', '4']),
      node(),
    ]
    const cmp = createNodeComparator([['A', 'B'], ['甲', '乙', '丙'], ['历一']], nodes)
    for (const a of nodes)
      for (const b of nodes) {
        expect(Math.sign(cmp(a, b)) + Math.sign(cmp(b, a))).toBe(0)
        for (const c of nodes)
          if (cmp(a, b) <= 0 && cmp(b, c) <= 0) expect(cmp(a, c)).toBeLessThanOrEqual(0)
      }
  })
  it('time placeholders omit globally unused and trailing layers', () => {
    const a = node(['时代', '', '历法', '1.2.3']),
      b = node(['', '朝代', '', '2'])
    const used = visibleTimeLevels([a, b])
    expect(timeDisplay(a.time, used)).toEqual(['时代', '???', '历法', '1年2月3日', ''])
    expect(
      timeDisplay(
        node(['', '', '', '3']).time,
        visibleTimeLevels([node(['', '', '', '3'])]),
      ),
    ).toEqual(['', '', '', '3年', ''])
    expect(displayClock('17:00:73')).toBe('17:00')
  })
  it('time filter resets descendants and fills known or explicitly missing ancestors', () => {
    const nodes = [node(['古代', '清', '乾隆']), node(['', '明', '洪武'])]
    const parents = timeParents(nodes)
    expect(updateTimeBound(['', '清', '乾隆', '1', '08:00'], 1, '明', parents)).toEqual(
      [MISSING_TIME, '明', '', '', ''],
    )
    expect(updateTimeBound(['', '', '', '', ''], 2, '乾隆', parents)).toEqual([
      '古代',
      '清',
      '乾隆',
      '',
      '',
    ])
  })
  it('rejects new conflicting parent names and clocks without dates', () => {
    expect(nodeTimeError(node(['另一时代', '清']), [node(['古代', '清'])])).toContain(
      '其他上级',
    )
    expect(nodeTimeError(node(['', '', '', '', '08:00']), [])).toContain('日期')
    expect(
      nodeTimeError(node(['古代', '清', '乾隆', '2', '08:00']), [node(['古代', '清'])]),
    ).toBe('')
  })
  it('path selection preserves terminal ancestors and separates equal names under different parents', () => {
    const a = node(),
      b = node(),
      c = node()
    a.location = ['国', '省', '城', '', '']
    b.location = ['国', '省', '城', '区', '']
    c.location = ['另一国', '省', '城', '', '']
    const filter = emptyFilters()
    filter.location.paths = [JSON.stringify(a.location)]
    expect(matches(a, filter)).toBe(true)
    expect(matches(b, filter)).toBe(false)
    expect(matches(c, filter)).toBe(false)
    const t = newTimeline('地点')
    t.nodes = [a, b, c]
    t.filters = filter
    expect(
      validateTimeline(JSON.parse(JSON.stringify(t))).filters.location.paths,
    ).toEqual(filter.location.paths)
  })
  it('copies full timeline independently with new identifiers', () => {
    const source = newTimeline('原件')
    source.nodes = [node(['时代'])]
    source.filters.query = '事件'
    const copy = duplicateTimeline(source)
    expect(copy.title).toBe('原件的副本')
    expect(copy.id).not.toBe(source.id)
    expect(copy.nodes[0].id).not.toBe(source.nodes[0].id)
    copy.nodes[0].event[0].text = '修改副本'
    expect(source.nodes[0].event[0].text).toBe('事件')
    expect(copy.filters).toEqual(source.filters)
  })
  it('persists editor expansion and customized location names', () => {
    const settings = normalizeSettings({
      countriesOpen: true,
      organizationsOpen: true,
      charactersOpen: true,
      locationLabels: ['国家', '省', '', '街区', '建筑'],
    })
    expect(settings.locationLabels).toEqual(['国家', '省', '3级', '街区', '建筑'])
    expect(
      settings.charactersOpen && settings.countriesOpen && settings.organizationsOpen,
    ).toBe(true)
  })
})

describe('multi-value participation', () => {
  it('accepts Chinese/English commas and legacy whitespace without duplicate tags', () => {
    expect(characterList('甲，乙,丙 甲\n丁')).toEqual(['甲', '乙', '丙', '丁'])
  })
  it('matches any selected participant in each category, with categories combined', () => {
    const n = node()
    n.countries = ['甲国', '乙国']
    n.organizations = ['组织甲', '组织乙']
    n.characters = ['人物甲', '人物乙']
    const f = emptyFilters()
    f.countries = { all: false, values: ['丙国', '乙国'] }
    f.organizations = { all: false, values: ['组织乙', '组织丙'] }
    f.characters = { all: false, values: ['人物乙', '人物丙'] }
    expect(matches(n, f)).toBe(true)
    f.organizations.values = ['组织丙']
    expect(matches(n, f)).toBe(false)
  })
})

describe('1.6 persistent time ancestry', () => {
  const qing = () => node(['近世', '清', '乾隆', '1.5.6', '08:00'])
  it('filters names by every selected ancestor and distinguishes missing from unlimited', () => {
    const parents = timeParents([
      qing(),
      node(['近世', '明', '洪武']),
      node(['', '旧朝', '旧历']),
    ])
    const values = ['乾隆', '洪武', '旧历']
    expect(timeOptions(values, 2, node(['近世', '明']).time, parents)).toEqual(['洪武'])
    expect(timeOptions(values, 2, node(['近世']).time, parents)).toEqual([
      '乾隆',
      '洪武',
    ])
    expect(timeOptions(values, 2, node([MISSING_TIME]).time, parents)).toEqual(['旧历'])
    expect(timeOptions(values, 2, node().time, parents)).toEqual(values)
  })
  it('does not replace an explicitly selected parent with an incompatible child', () => {
    const bound = node(['近世', '明']).time
    expect(updateTimeBound(bound, 2, '乾隆', timeParents([qing()]))).toEqual(bound)
  })
  it('stores complete ancestry for all five levels, including empty parents', () => {
    const names = mergeTimeNames([], [qing(), node(['', '明'])])
    expect(names).toContainEqual({
      level: 4,
      name: '08:00',
      ancestors: ['近世', '清', '乾隆', '1年5月6日'],
    })
    expect(names).toContainEqual({ level: 1, name: '明', ancestors: [''] })
  })
  it('rejects reparenting the only node and permits repeated use under the same parents', () => {
    const original = qing(),
      changed = structuredClone(original)
    changed.time[1] = '明'
    expect(nodeTimeError(changed, [original])).toContain('乾隆')
    expect(nodeTimeError(qing(), [original])).toBe('')
    changed.time[2] = '洪武'
    changed.time[3] = ''
    changed.time[4] = ''
    expect(nodeTimeError(changed, [original])).toBe('')
  })
  it('does not lock provisional autosaved names while changing multiple fields', () => {
    const original = qing(),
      known = mergeTimeNames([], [original])
    const intermediate = structuredClone(original)
    intermediate.time[2] = '洪武'
    intermediate.time[3] = ''
    intermediate.time[4] = ''
    const completed = structuredClone(intermediate)
    completed.time[1] = '明'
    expect(nodeTimeError(completed, [intermediate], known)).toBe('')
    completed.time[2] = '乾隆'
    expect(nodeTimeError(completed, [intermediate], known)).toContain('乾隆')
  })
  it('preserves constraints after deleting or renaming the last node and reopening', () => {
    const t = newTimeline('归属')
    t.nodes = [qing()]
    const migrated = validateTimeline(t)
    migrated.nodes = []
    const reopened = validateTimeline(JSON.parse(JSON.stringify(migrated)))
    expect(
      nodeTimeError(node(['近世', '明', '乾隆']), [], reopened.timeNames),
    ).toContain('乾隆')
    expect(
      timeOptions(
        ['乾隆'],
        2,
        node(['近世', '明']).time,
        timeParents([], reopened.timeNames),
      ),
    ).toEqual([])
    expect(
      timeOptions(
        ['乾隆'],
        2,
        node(['近世', '清']).time,
        timeParents([], reopened.timeNames),
      ),
    ).toEqual(['乾隆'])
  })
  it('checks date and clock ancestry using normalized date and minute values', () => {
    const original = qing()
    expect(
      nodeTimeError(node(['近世', '清', '嘉庆', '1年5月6日']), [original]),
    ).toContain('日期')
    expect(
      nodeTimeError(node(['近世', '清', '乾隆', '2', '08:00']), [original]),
    ).toContain('时刻')
    expect(
      nodeTimeError(node(['近世', '清', '乾隆', '1年5月6日', '08:00:59']), [original]),
    ).toBe('')
  })
  it('checks start and end names against one shared registry', () => {
    const range = qing()
    range.endTime = node(['近世', '明', '乾隆']).time
    expect(nodeTimeError(range, [])).toContain('乾隆')
  })
  it('round trips registry with backup v6, copies it independently and rejects merge conflicts even with no nodes', () => {
    const t = newTimeline('原件')
    t.timeNames = mergeTimeNames([], [qing()])
    const backup = parseImport(
      JSON.parse(JSON.stringify({ format: 'xushi', version: 6, timelines: [t] })),
    )[0]
    expect(backup.timeNames).toEqual(t.timeNames)
    const copy = duplicateTimeline(backup)
    copy.timeNames![0].name = '副本'
    expect(backup.timeNames![0].name).toBe('近世')
    const incoming = newTimeline('导入')
    incoming.nodes = [node(['近世', '明', '乾隆'])]
    expect(() => mergeTimeline(backup, incoming)).toThrow('多个上级')
  })
  it('preserves legacy conflicts and permits unrelated edits without silently reparenting', () => {
    const t = newTimeline('旧资料')
    t.nodes = [qing(), node(['近世', '明', '乾隆'])]
    const loaded = validateTimeline(t)
    expect(loaded.nodes).toEqual(t.nodes)
    expect(() => assertTimeNamesUnique(loaded.nodes, loaded.timeNames)).toThrow(
      '多个上级',
    )
    const edited = structuredClone(loaded.nodes[1])
    edited.event[0].text = '修改正文'
    expect(nodeTimeError(edited, loaded.nodes, loaded.timeNames)).toBe('')
    edited.time[2] = '洪武'
    expect(nodeTimeError(edited, loaded.nodes, loaded.timeNames)).toBe('')
    const repaired = reconcileTimeNames(loaded.timeNames, [loaded.nodes[0], edited])
    expect(() =>
      assertTimeNamesUnique([loaded.nodes[0], edited], repaired),
    ).not.toThrow()
    expect(nodeTimeError(node(['近世', '明', '乾隆']), [], repaired)).toContain('乾隆')
  })
  it('rejects malformed persisted ancestry', () => {
    const t = newTimeline('错误')
    t.timeNames = [{ level: 2, name: '历法', ancestors: ['时代'] }]
    expect(() => validateTimeline(t)).toThrow('归属层级')
  })
})

describe('node titles', () => {
  it('preserves title in validation, drafts, backups, copies and merges', () => {
    const t = newTimeline('测试')
    t.nodes = [{ ...node(), title: '独立标题 🐉' }]
    const validated = validateTimeline(t)
    expect(validated.nodes[0].title).toBe('独立标题 🐉')
    expect(
      normalizeSettings({
        draft: { timelineId: t.id, isNew: true, node: t.nodes[0] },
      }).draft!.node.title,
    ).toBe('独立标题 🐉')
    expect(
      parseImport(
        JSON.parse(JSON.stringify({ format: 'xushi', version: 7, timelines: [t] })),
      )[0].nodes[0].title,
    ).toBe('独立标题 🐉')
    expect(duplicateTimeline(t).nodes[0].title).toBe('独立标题 🐉')
    expect(mergeTimeline(newTimeline('目标'), t).nodes[0].title).toBe('独立标题 🐉')
    expect(matches(t.nodes[0], { ...emptyFilters(), query: '独立标题' })).toBe(true)
  })
  it('migrates absent titles, rejects invalid types and permits a title without an event', () => {
    const t = newTimeline('旧数据')
    t.nodes = [node()]
    delete (t.nodes[0] as any).title
    expect(validateTimeline(t).nodes[0].title).toBe('')
    ;(t.nodes[0] as any).title = 123
    expect(() => validateTimeline(t)).toThrow()
    t.nodes[0].title = '只有标题'
    t.nodes[0].event = []
    expect(validateTimeline(t).nodes[0].title).toBe('只有标题')
    const restored = parseImport({ format: 'xushi', version: 8, timelines: [t] })[0]
    expect(restored.nodes[0].event).toEqual([])
    expect(duplicateTimeline(restored).nodes[0].title).toBe('只有标题')
    expect(mergeTimeline(newTimeline('目标'), restored).nodes[0].title).toBe('只有标题')
    t.nodes[0].title = '  '
    t.nodes[0].event = [{ text: '\n  ', marks: [] }]
    expect(() => validateTimeline(t)).toThrow('标题和事件至少填写一项')
  })
})
