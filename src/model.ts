export const MAX_TIMELINES = 1000
export const MAX_NODES = 10000
export const timeLabels = ['时代', '朝代', '历法', '日期', '时刻'] as const
export const themes = [
  { id: 'grass', name: '草木', color: '#416b54', background: '#f0f4ea' },
  { id: 'mono', name: '灰白', color: '#555b64', background: '#dadce0' },
  { id: 'pink', name: '烟粉', color: '#92717c', background: '#ded6d9' },
  { id: 'blue', name: '雾蓝', color: '#5f7786', background: '#d4dde2' },
  { id: 'gold', name: '黑金', color: '#d7b76b', background: '#24252c' },
] as const
export type Mark = 'bold' | 'underline' | 'italic' | 'strike' | 'spoiler'
export type Run = { text: string; marks: Mark[] }
export type Five = [string, string, string, string, string]
export type TimeOrder = [string[], string[], string[]]
export interface TimelineNode {
  id: string
  time: Five
  endTime?: Five
  location: Five
  organization: Five
  countries: string[]
  characters: string[]
  event: Run[]
  createdAt: string
}
export interface HierarchyFilter {
  values: string[]
  levels: number[]
}
export interface Filters {
  query: string
  location: HierarchyFilter
  organization: HierarchyFilter
  showNoLocation: boolean
  showNoOrganization: boolean
  countries: string[]
  character: string
}
export interface Timeline {
  id: string
  title: string
  description: string
  nodes: TimelineNode[]
  characters: string[]
  countries: string[]
  filters: Filters
  timeOrder: TimeOrder
  updatedAt: string
}
export interface Summary {
  id: string
  title: string
  count: number
  updatedAt: string
}
export interface Settings {
  theme: string
  visibleTime: boolean[]
  charactersOpen: boolean
  countriesOpen: boolean
  activeId: string
  draft?: { timelineId: string; node: TimelineNode; isNew: boolean }
}
export const five = (): Five => ['', '', '', '', '']
export const emptyTimeOrder = (): TimeOrder => [[], [], []]
export const emptyFilters = (): Filters => ({
  query: '',
  location: { values: [], levels: [] },
  organization: { values: [], levels: [] },
  showNoLocation: true,
  showNoOrganization: true,
  countries: [],
  character: '',
})
export const defaults = (): Settings => ({
  theme: 'grass',
  visibleTime: [true, true, true, true, true],
  charactersOpen: false,
  countriesOpen: false,
  activeId: '',
})
export const uid = () => crypto.randomUUID()
export const newTimeline = (title: string): Timeline => ({
  id: uid(),
  title: title.trim() || '未命名时间轴',
  description: '',
  nodes: [],
  characters: [],
  countries: [],
  filters: emptyFilters(),
  timeOrder: emptyTimeOrder(),
  updatedAt: new Date().toISOString(),
})
export const newNode = (): TimelineNode => ({
  id: uid(),
  time: five(),
  location: five(),
  organization: five(),
  countries: [],
  characters: [],
  event: [],
  createdAt: new Date().toISOString(),
})
export const plainText = (runs: Run[]) => runs.map((r) => r.text).join('')
export const natural = new Intl.Collator('zh-CN-u-co-pinyin', {
  numeric: true,
  sensitivity: 'base',
})
export const characterList = (text: string) => [
  ...new Set(text.trim().split(/\s+/u).filter(Boolean)),
]
export const sortedCharacters = (names: string[]) =>
  [...new Set(names)].sort((a, b) => natural.compare(a, b) || a.localeCompare(b))
export function dateParts(value: string): string[] | null {
  const dot = value.trim().match(/^([+-]?\d+)(?:\.(\d+))?(?:\.(\d+))?$/)
  if (dot) return dot.slice(1).filter((v) => v !== undefined)
  const cn = value.trim().match(/^([+-]?\d+)年(?:(\d+)月)?(?:(\d+)日)?$/)
  return cn && (!cn[3] || cn[2]) ? cn.slice(1).filter((v) => v !== undefined) : null
}
export function displayDate(value: string): string {
  const parts = dateParts(value)
  return parts ? parts.map((v, i) => v + ['年', '月', '日'][i]).join('') : value
}

/** Fictional dates never use Gregorian validation. Matching coarse precision
 * precedes its descendants: 1999, then 1999.5, then 1999.5.6. */
export function comparePart(a: string, b: string, precision = false): number {
  if (a === b) return 0
  if (!a) return 1
  if (!b) return -1
  if (precision) {
    const aa = a.match(/\d+|[^\d.\s:/-]+/g) || [],
      bb = b.match(/\d+|[^\d.\s:/-]+/g) || []
    for (let i = 0; i < Math.min(aa.length, bb.length); i++) {
      const c = natural.compare(aa[i], bb[i])
      if (c) return c
    }
    if (aa.length !== bb.length) return aa.length - bb.length
  }
  return natural.compare(a, b)
}
export function mergeTimeOrder(order: TimeOrder, nodes: TimelineNode[]): TimeOrder {
  return order.map((values, i) => {
    const known = new Set(values)
    const result = [...values]
    for (const node of nodes)
      for (const value of [node.time[i], node.endTime?.[i] || '']) {
        if (value && !known.has(value)) {
          known.add(value)
          result.push(value)
        }
      }
    return result
  }) as TimeOrder
}
export function createNodeComparator(order: TimeOrder = emptyTimeOrder()) {
  const ranks = order.map((values) => new Map(values.map((name, i) => [name, i])))
  function compareTime(a: Five, b: Five): number {
    const lastA = a.reduce((last, value, i) => (value.trim() ? i : last), -1),
      lastB = b.reduce((last, value, i) => (value.trim() ? i : last), -1)
    if (lastA < 0 || lastB < 0) return lastA === lastB ? 0 : lastA < 0 ? 1 : -1
    for (let i = 0; i < 5; i++) {
      const aa = i === 3 ? (dateParts(a[i])?.join('.') ?? a[i].trim()) : a[i].trim(),
        bb = i === 3 ? (dateParts(b[i])?.join('.') ?? b[i].trim()) : b[i].trim()
      if (aa === bb) continue
      // Empty trailing precision is coarse; an omitted higher category with a
      // later filled value stays outside named groups, as in older data.
      if (!aa) return i > lastA ? -1 : 1
      if (!bb) return i > lastB ? 1 : -1
      if (i < 3) {
        const rankA = ranks[i].get(aa) ?? Infinity,
          rankB = ranks[i].get(bb) ?? Infinity
        if (rankA !== rankB) return rankA < rankB ? -1 : 1
        // Names without an explicit rank have no inferred historical or alphabetic
        // order. The application registers them in entry order before sorting.
        return 0
      }
      const c = comparePart(aa, bb, i >= 3)
      if (c) return c
    }
    return 0
  }
  return (a: TimelineNode, b: TimelineNode): number => {
    const start = compareTime(a.time, b.time)
    if (start) return start
    if (!!a.endTime !== !!b.endTime) return a.endTime ? -1 : 1
    const end = a.endTime && b.endTime ? compareTime(a.endTime, b.endTime) : 0
    return end || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  }
}
const defaultComparator = createNodeComparator()
export const compareNodes = (a: TimelineNode, b: TimelineNode) => defaultComparator(a, b)
export function preview(runs: Run[], limit = 100): { runs: Run[]; truncated: boolean } {
  let left = limit
  const result: Run[] = []
  for (const run of runs) {
    const chars = Array.from(run.text)
    if (left > 0) result.push({ text: chars.slice(0, left).join(''), marks: run.marks })
    left -= chars.length
  }
  return { runs: result, truncated: left < 0 }
}
export function matches(node: TimelineNode, f: Filters): boolean {
  for (const key of ['location', 'organization'] as const) {
    const empty = node[key].every((v) => !v)
    if (empty) {
      if (!(key === 'location' ? f.showNoLocation : f.showNoOrganization)) return false
    } else if (!matchesHierarchy(node[key], f[key])) return false
  }
  if (f.countries.length && !node.countries.some((value) => f.countries.includes(value)))
    return false
  if (f.character && !node.characters.includes(f.character)) return false
  const q = f.query.trim().toLocaleLowerCase()
  return (
    !q ||
    [
      plainText(node.event),
      ...node.time,
      ...(node.endTime || []),
      ...node.location,
      ...node.organization,
      ...node.countries,
      ...node.characters,
    ]
      .join(' ')
      .toLocaleLowerCase()
      .includes(q)
  )
}
/** Within one category selections are alternatives. Names and levels, when both
 * selected, must match the same occupied slot; categories combine with AND. */
export function matchesHierarchy(values: Five, filter: HierarchyFilter): boolean {
  return values.some(
    (value, index) =>
      !!value &&
      (!filter.values.length || filter.values.includes(value)) &&
      (!filter.levels.length || filter.levels.includes(index + 1)),
  )
}
function hierarchy(value: unknown): HierarchyFilter {
  // 1.0 stored one chosen value per numbered level. Preserve the selected names
  // when upgrading to the new multi-select controls.
  if (Array.isArray(value))
    return {
      values: sortedCharacters(levels(value).filter(Boolean)),
      levels: [],
    }
  if (!value) return { values: [], levels: [] }
  const f = object(value)
  if (
    !Array.isArray(f.levels) ||
    f.levels.some((v) => !Number.isInteger(v) || Number(v) < 1 || Number(v) > 5)
  )
    throw new Error('筛选层级无效')
  return {
    values: names(f.values),
    levels: [...new Set(f.levels)] as number[],
  }
}
export function normalizeSettings(
  value: Partial<Settings> & Record<string, unknown>,
): Settings {
  const settings = defaults()
  if (themes.some((t) => t.id === value.theme)) settings.theme = String(value.theme)
  if (Array.isArray(value.visibleTime) && value.visibleTime.length === 5)
    settings.visibleTime = value.visibleTime.map(Boolean)
  settings.charactersOpen = value.charactersOpen === true
  settings.countriesOpen = value.countriesOpen === true
  settings.activeId = typeof value.activeId === 'string' ? value.activeId : ''
  if (value.draft) {
    const d = value.draft
    settings.draft = {
      timelineId: d.timelineId,
      isNew: !!d.isNew,
      node: validateNode(d.node, false),
    }
  }
  return settings
}
export const summary = (t: Timeline): Summary => ({
  id: t.id,
  title: t.title,
  count: t.nodes.length,
  updatedAt: t.updatedAt,
})
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('无效的数据对象')
  return v as Record<string, unknown>
}
function string(v: unknown): string {
  if (typeof v !== 'string') throw new Error('字段必须是文本')
  return v
}
function levels(v: unknown): Five {
  if (!Array.isArray(v) || v.length !== 5) throw new Error('层级必须为 5 项')
  return v.map((x) => string(x).trim()) as Five
}
function names(v: unknown): string[] {
  if (!Array.isArray(v)) throw new Error('标签格式错误')
  return sortedCharacters(v.map(string).flatMap(characterList))
}
export function validateTimeline(value: unknown): Timeline {
  const v = object(value)
  if (!Array.isArray(v.nodes) || v.nodes.length > MAX_NODES)
    throw new Error('每条时间轴最多 10000 个节点')
  const ids = new Set<string>()
  const nodes = v.nodes.map((raw) => {
    const node = validateNode(raw)
    if (ids.has(node.id)) throw new Error('节点标识无效或重复')
    ids.add(node.id)
    return node
  })
  const id = string(v.id)
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('时间轴标识无效')
  const title = string(v.title).trim()
  if (!title) throw new Error('时间轴名称不能为空')
  const f = v.filters ? object(v.filters) : {}
  const rawOrder = v.timeOrder ?? emptyTimeOrder()
  if (
    !Array.isArray(rawOrder) ||
    rawOrder.length !== 3 ||
    rawOrder.some((values) => !Array.isArray(values))
  )
    throw new Error('时间顺序格式错误')
  const timeOrder = rawOrder.map((values) => [
    ...new Set((values as unknown[]).map((value) => string(value).trim()).filter(Boolean)),
  ]) as TimeOrder
  return {
    id,
    title,
    description: typeof v.description === 'string' ? v.description : '',
    nodes,
    timeOrder: mergeTimeOrder(timeOrder, nodes),
    characters: sortedCharacters([
      ...names(v.characters ?? []),
      ...nodes.flatMap((n) => n.characters),
    ]),
    countries: sortedCharacters([
      ...names(v.countries ?? []),
      ...nodes.flatMap((n) => n.countries),
    ]),
    updatedAt: string(v.updatedAt),
    filters: {
      query: typeof f.query === 'string' ? f.query : '',
      location: hierarchy(f.location),
      organization: hierarchy(f.organization),
      showNoLocation: f.showNoLocation !== false,
      showNoOrganization: f.showNoOrganization !== false,
      countries: Array.isArray(f.countries)
        ? names(f.countries)
        : typeof f.country === 'string' && f.country.trim()
          ? [f.country.trim()]
          : [],
      character: typeof f.character === 'string' ? f.character : '',
    },
  }
}
export function validateNode(raw: unknown, requireEvent = true): TimelineNode {
  const n = object(raw),
    id = string(n.id)
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('节点标识无效或重复')
  if (!Array.isArray(n.event)) throw new Error('事件格式错误')
  const event = n.event.map((rawRun) => {
    const r = object(rawRun)
    if (
      !Array.isArray(r.marks) ||
      r.marks.some(
        (m) => !['bold', 'underline', 'italic', 'strike', 'spoiler'].includes(String(m)),
      )
    )
      throw new Error('不支持的事件格式')
    return { text: string(r.text), marks: [...new Set(r.marks)] as Mark[] }
  })
  if (requireEvent && !plainText(event).trim()) throw new Error('事件不能为空')
  return {
    id,
    time: levels(n.time),
    ...(n.endTime === undefined ? {} : { endTime: levels(n.endTime) }),
    location: levels(n.location),
    organization: levels(n.organization),
    countries: Array.isArray(n.countries)
      ? names(n.countries)
      : typeof n.country === 'string' && n.country.trim()
        ? [n.country.trim()]
        : [],
    characters: names(n.characters),
    event,
    createdAt: string(n.createdAt),
  }
}
export function parseImport(value: unknown): Timeline[] {
  const v = object(value)
  if (
    v.format !== 'xushi' ||
    ![1, 2, 3].includes(Number(v.version)) ||
    !Array.isArray(v.timelines) ||
    !v.timelines.length ||
    v.timelines.length > MAX_TIMELINES
  )
    throw new Error('请选择序时导出的 JSON 文件（1 至 1000 条时间轴）')
  return v.timelines.map(validateTimeline)
}
