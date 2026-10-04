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
export interface TimelineNode {
  id: string
  time: Five
  location: Five
  organization: Five
  country: string
  characters: string[]
  event: Run[]
  createdAt: string
}
export interface Filters {
  query: string
  location: Five
  organization: Five
  showNoLocation: boolean
  showNoOrganization: boolean
  country: string
  character: string
}
export interface Timeline {
  id: string
  title: string
  description: string
  nodes: TimelineNode[]
  characters: string[]
  filters: Filters
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
  dateFormat: 'dots' | 'chinese'
  charactersOpen: boolean
  inspector: boolean
  activeId: string
  draft?: { timelineId: string; node: TimelineNode; isNew: boolean }
}
export const five = (): Five => ['', '', '', '', '']
export const emptyFilters = (): Filters => ({
  query: '',
  location: five(),
  organization: five(),
  showNoLocation: true,
  showNoOrganization: true,
  country: '',
  character: '',
})
export const defaults = (): Settings => ({
  theme: 'grass',
  visibleTime: [true, true, true, true, true],
  dateFormat: 'dots',
  charactersOpen: false,
  inspector: true,
  activeId: '',
})
export const uid = () => crypto.randomUUID()
export const newTimeline = (title: string): Timeline => ({
  id: uid(),
  title: title.trim() || '未命名时间轴',
  description: '',
  nodes: [],
  characters: [],
  filters: emptyFilters(),
  updatedAt: new Date().toISOString(),
})
export const newNode = (): TimelineNode => ({
  id: uid(),
  time: five(),
  location: five(),
  organization: five(),
  country: '',
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
export function displayDate(value: string, format: Settings['dateFormat']): string {
  const parts = dateParts(value)
  return parts
    ? format === 'dots'
      ? parts.join('.')
      : parts.map((v, i) => v + ['年', '月', '日'][i]).join('')
    : value
}

/** Dates are fictional strings, not Gregorian dates. A shorter matching precision
 * (1382 or 17:00) belongs after its more precise descendants. */
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
    if (aa.length !== bb.length) return bb.length - aa.length
  }
  return natural.compare(a, b)
}
export function compareNodes(a: TimelineNode, b: TimelineNode): number {
  for (let i = 0; i < 5; i++) {
    const aa = i === 3 ? displayDate(a.time[i], 'dots') : a.time[i].trim(),
      bb = i === 3 ? displayDate(b.time[i], 'dots') : b.time[i].trim()
    const c = comparePart(aa, bb, i >= 3)
    if (c) return c
  }
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
}
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
    } else if (f[key].some((value, index) => value && value !== node[key][index])) return false
  }
  if (f.country && f.country !== node.country) return false
  if (f.character && !node.characters.includes(f.character)) return false
  const q = f.query.trim().toLocaleLowerCase()
  return (
    !q ||
    [
      plainText(node.event),
      ...node.time,
      ...node.location,
      ...node.organization,
      node.country,
      ...node.characters,
    ]
      .join(' ')
      .toLocaleLowerCase()
      .includes(q)
  )
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
  if (!Array.isArray(v)) throw new Error('角色格式错误')
  return sortedCharacters(v.map(string).flatMap(characterList))
}
export function validateTimeline(value: unknown): Timeline {
  const v = object(value)
  if (!Array.isArray(v.nodes) || v.nodes.length > MAX_NODES)
    throw new Error('每条时间轴最多 10000 个节点')
  const ids = new Set<string>()
  const nodes = v.nodes.map((raw) => {
    const n = object(raw),
      id = string(n.id)
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(id) || ids.has(id)) throw new Error('节点标识无效或重复')
    ids.add(id)
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
    if (!plainText(event).trim()) throw new Error('事件不能为空')
    return {
      id,
      time: levels(n.time),
      location: levels(n.location),
      organization: levels(n.organization),
      country: string(n.country).trim(),
      characters: names(n.characters),
      event,
      createdAt: string(n.createdAt),
    }
  })
  const id = string(v.id)
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('时间轴标识无效')
  const title = string(v.title).trim()
  if (!title) throw new Error('时间轴名称不能为空')
  const f = v.filters ? object(v.filters) : emptyFilters()
  return {
    id,
    title,
    description: typeof v.description === 'string' ? v.description : '',
    nodes,
    characters: sortedCharacters([
      ...names(v.characters ?? []),
      ...nodes.flatMap((n) => n.characters),
    ]),
    updatedAt: string(v.updatedAt),
    filters: {
      query: typeof f.query === 'string' ? f.query : '',
      location: f.location ? levels(f.location) : five(),
      organization: f.organization ? levels(f.organization) : five(),
      showNoLocation: f.showNoLocation !== false,
      showNoOrganization: f.showNoOrganization !== false,
      country: typeof f.country === 'string' ? f.country : '',
      character: typeof f.character === 'string' ? f.character : '',
    },
  }
}
export function parseImport(value: unknown): Timeline[] {
  const v = object(value)
  if (
    v.format !== 'xushi' ||
    v.version !== 1 ||
    !Array.isArray(v.timelines) ||
    !v.timelines.length ||
    v.timelines.length > MAX_TIMELINES
  )
    throw new Error('请选择序时导出的 JSON 文件（1 至 1000 条时间轴）')
  return v.timelines.map(validateTimeline)
}
