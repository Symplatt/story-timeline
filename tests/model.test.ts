import { describe, it, expect } from 'vitest'
import {
  newTimeline,
  newNode,
  compareNodes,
  comparePart,
  displayDate,
  defaults,
  preview,
  matches,
  emptyFilters,
  validateTimeline,
  parseImport,
  sortedCharacters,
  characterList,
  MAX_NODES,
} from '../src/model'
import { markdown, pngPages } from '../src/export'
function node(time: string[] = []): ReturnType<typeof newNode> {
  return {
    ...newNode(),
    time: [...time, ...Array(5 - time.length).fill('')] as ReturnType<typeof newNode>['time'],
    event: [{ text: '事件', marks: [] }],
  }
}
describe('hierarchical fictional chronology', () => {
  it('sorts numeric text naturally at every level', () => {
    for (let i = 0; i < 5; i++) {
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
  it('puts missing time at end of same date', () => {
    expect(
      compareNodes(
        node(['Era', 'D', 'C', '1234.5.6', '17:00:73']),
        node(['Era', 'D', 'C', '1234.5.6']),
      ),
    ).toBeLessThan(0)
  })
  it('puts partial period behind precise descendants, before the next period', () => {
    const values = [node(['A']), node(['B']), node(['A', 'D', 'C', '1'])].sort(compareNodes)
    expect(values.map((n) => n.time[0] + n.time[1])).toEqual(['AD', 'A', 'B'])
  })
  it('puts partial dates at matching precision end', () => {
    expect(comparePart('1234.5.6', '1234.5', true)).toBeLessThan(0)
    expect(comparePart('1234.5', '1234', true)).toBeLessThan(0)
    expect(comparePart('1234', '1235.1', true)).toBeLessThan(0)
  })
  it('puts partial clock after specific seconds', () =>
    expect(comparePart('17:00:73', '17:00', true)).toBeLessThan(0))
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
describe('date display preference', () => {
  it.each([
    ['1234.5.6', '1234年5月6日'],
    ['1234.5', '1234年5月'],
    ['1234', '1234年'],
    ['001.02.03', '001年02月03日'],
  ])('converts %s both directions', (dots, cn) => {
    expect(displayDate(dots, 'chinese')).toBe(cn)
    expect(displayDate(cn, 'dots')).toBe(dots)
  })
  it('preserves custom alphabetic dates', () => {
    expect(displayDate('A12.月X', 'chinese')).toBe('A12.月X')
  })
})
describe('event preview and filtering', () => {
  it('counts 100 Unicode characters rather than UTF-16 units', () => {
    const runs = [{ text: '龙'.repeat(99) + '🐉结尾', marks: ['bold', 'spoiler'] as const }]
    const p = preview(runs as any)
    expect(Array.from(p.runs[0].text)).toHaveLength(100)
    expect(p.runs[0].text.endsWith('🐉')).toBe(true)
    expect(p.truncated).toBe(true)
    expect(p.runs[0].marks).toEqual(['bold', 'spoiler'])
  })
  it('does not ellipsize an exact 100-character event', () =>
    expect(preview([{ text: 'x'.repeat(100), marks: [] }]).truncated).toBe(false))
  it('preserves formatting across cutoff boundaries', () => {
    const p = preview([
      { text: 'a'.repeat(98), marks: ['underline'] },
      { text: 'abcd', marks: ['italic'] },
    ])
    expect(p.runs[1].text).toBe('ab')
    expect(p.runs[1].marks).toEqual(['italic'])
  })
  it('matches multiple location levels exactly', () => {
    const n = node()
    n.location = ['世界', '大陆', '城', '', '']
    const f = emptyFilters()
    f.location[0] = '世界'
    f.location[2] = '城'
    expect(matches(n, f)).toBe(true)
    f.location[1] = '别的大陆'
    expect(matches(n, f)).toBe(false)
  })
  it('shows unknown locations only when requested, even with filters', () => {
    const f = emptyFilters()
    f.location[0] = '世界'
    expect(matches(node(), f)).toBe(true)
    f.showNoLocation = false
    expect(matches(node(), f)).toBe(false)
  })
  it('filters organizations independently', () => {
    const f = emptyFilters()
    f.showNoOrganization = false
    expect(matches(node(), f)).toBe(false)
    const n = node()
    n.organization[4] = '分部'
    f.organization[4] = '分部'
    expect(matches(n, f)).toBe(true)
    f.organization[4] = '总部'
    expect(matches(n, f)).toBe(false)
  })
  it('combines country, character and free text', () => {
    const n = node()
    n.country = '北境'
    n.characters = ['Alice']
    const f = emptyFilters()
    f.country = '北境'
    f.character = 'Alice'
    f.query = '事'
    expect(matches(n, f)).toBe(true)
    f.query = '错误'
    expect(matches(n, f)).toBe(false)
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
    expect(() => validateTimeline(t)).toThrow('事件不能为空')
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
    n.country = '北境'
    n.characters = ['Zoe']
    n.location = ['1', '2', '3', '4', '5']
    n.organization = ['a', 'b', 'c', 'd', 'e']
    t.nodes = [n]
    const [copy] = parseImport(
      JSON.parse(JSON.stringify({ format: 'xushi', version: 1, timelines: [t] })),
    )
    expect(copy.nodes).toEqual(t.nodes)
    expect(copy.characters).toEqual(['Zoe'])
  })
})
describe('exports', () => {
  it('Markdown retains full long events, all fields and safe rich markup', () => {
    const t = newTimeline('世界')
    const n = node(['A', 'B', 'C', '1234.5.6', '17:00:73'])
    n.event = [
      {
        text: '一'.repeat(150) + '<script>',
        marks: ['bold', 'underline', 'italic', 'strike', 'spoiler'],
      },
    ]
    n.location[4] = '城'
    n.organization[4] = '队'
    n.country = '北境'
    n.characters = ['角色']
    t.nodes = [n]
    const result = markdown(t, [n], { ...defaults(), dateFormat: 'chinese' })
    expect(result).toContain('一'.repeat(150))
    expect(result).toContain('&lt;script&gt;')
    expect(result).toContain('地点 5 级')
    expect(result).toContain('组织 5 级')
    expect(result).toContain('1234年5月6日')
    expect(result).toContain('xushi-spoiler')
    expect(result).toContain('<strong>')
  })
  it('bounds 10000-node image exports to sequential small pages', () => {
    expect(pngPages(0)).toBe(1)
    expect(pngPages(14)).toBe(1)
    expect(pngPages(15)).toBe(2)
    expect(pngPages(10000)).toBe(715)
  })
})
