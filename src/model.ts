export const MAX_TIMELINES = 1000
export const MAX_NODES = 10000
export const timeLabels = ['时代', '朝代', '历法', '日期', '时刻'] as const
export const themes = [
  { id: 'mono', name: '黑白', color: '#161616', background: '#ffffff' },
  { id: 'grass', name: '草木', color: '#416b54', background: '#f0f4ea' },
  { id: 'pink', name: '烟粉', color: '#92717c', background: '#ded6d9' },
  { id: 'blue', name: '雾蓝', color: '#5f7786', background: '#d4dde2' },
  { id: 'gold', name: '黑金', color: '#d7b76b', background: '#24252c' },
] as const
export type Mark = 'bold' | 'underline' | 'italic' | 'strike' | 'spoiler'
export type Run = { text: string; marks: Mark[] }
export type Five = [string, string, string, string, string]
export type TimeOrder = [string[], string[], string[]]
export type TimeName = { level: number; name: string; ancestors: string[] }
export interface TimelineNode {
  id: string
  time: Five
  endTime?: Five
  location: Five
  organizations: string[]
  countries: string[]
  characters: string[]
  event: Run[]
  createdAt: string
}
export interface TagSelection {
  all: boolean
  values: string[]
}
export interface HierarchyFilter {
  paths?: string[] | null
  depth: number
  selections: (string[] | null)[]
  legacy?: { values: string[]; levels: number[] }
}
export interface Filters {
  query: string
  location: HierarchyFilter
  organizations: TagSelection
  showNoLocation: boolean
  countries: TagSelection
  characters: TagSelection
  startTime?: Five
  endTime?: Five
}
export interface Timeline {
  id: string
  title: string
  description: string
  nodes: TimelineNode[]
  characters: string[]
  countries: string[]
  organizations: string[]
  filters: Filters
  timeOrder: TimeOrder
  timeNames?: TimeName[]
  updatedAt: string
}
export interface Summary {
  id: string
  title: string
  count: number
  updatedAt: string
}
export interface Settings {
  locationLabels: Five
  theme: string
  filterPanel?: string
  visibleTime: boolean[]
  charactersOpen: boolean
  organizationsOpen: boolean
  countriesOpen: boolean
  activeId: string
  draft?: { timelineId: string; node: TimelineNode; isNew: boolean }
}
export const five = (): Five => ['', '', '', '', '']
export const emptyTimeOrder = (): TimeOrder => [[], [], []]
export const emptyHierarchy = (): HierarchyFilter => ({
  depth: 5,
  selections: [null, null, null, null, null],
})
export const emptyFilters = (): Filters => ({
  query: '',
  location: emptyHierarchy(),
  organizations: { all: true, values: [] },
  showNoLocation: true,
  countries: { all: true, values: [] },
  characters: { all: true, values: [] },
})
export const defaults = (): Settings => ({
  locationLabels: ['1级', '2级', '3级', '4级', '5级'],
  theme: 'mono',
  visibleTime: [true, true, true, true, true],
  charactersOpen: false,
  countriesOpen: false,
  organizationsOpen: false,
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
  organizations: [],
  filters: emptyFilters(),
  timeOrder: emptyTimeOrder(),
  updatedAt: new Date().toISOString(),
})
export const newNode = (): TimelineNode => ({
  id: uid(),
  time: five(),
  location: five(),
  organizations: [],
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
  ...new Set(
    text
      .trim()
      .split(/[\s,，]+/u)
      .filter(Boolean),
  ),
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
export function createNodeComparator(
  order: TimeOrder = emptyTimeOrder(),
  nodes: TimelineNode[] = [],
) {
  const ranks = order.map((values) => new Map(values.map((name, i) => [name, i])))
  const resolve = timeResolver(order, nodes)
  function compareTime(a: Five, b: Five): number {
    a = resolve(a)
    b = resolve(b)
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
export const compareNodes = (a: TimelineNode, b: TimelineNode) =>
  defaultComparator(a, b)
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
/** A missing ancestor is represented by its complete descendant path. This keeps
 * sparse entries individually selectable even when only upper levels are shown. */
export function hierarchyOption(
  values: Five,
  level: number,
): { key: string; label: string } {
  if (values[level])
    return { key: JSON.stringify([values[level]]), label: values[level] }
  const descendants = values
    .slice(level + 1)
    .map((value, i) => (value ? `${i + level + 2}级 ${value}` : ''))
    .filter(Boolean)
  return {
    key: JSON.stringify(['', ...values.slice(level + 1)]),
    label: descendants.length ? `未填写（${descendants.join(' / ')}）` : '未填写',
  }
}
export function matchesHierarchy(values: Five, filter: HierarchyFilter): boolean {
  if (filter.paths !== undefined)
    return filter.paths === null || filter.paths.includes(JSON.stringify(values))
  if (filter.legacy)
    return values.some(
      (value, i) =>
        !!value &&
        (!filter.legacy!.values.length || filter.legacy!.values.includes(value)) &&
        (!filter.legacy!.levels.length || filter.legacy!.levels.includes(i + 1)),
    )
  return filter.selections
    .slice(0, filter.depth)
    .every(
      (selection, i) =>
        selection === null || selection.includes(hierarchyOption(values, i).key),
    )
}
/** Filter bounds cover the full specified precision (a year includes all its
 * months). Partial overlap is inclusive; missing bounds are open. */
export function compareTimeBounds(
  a: Five,
  b: Five,
  order: TimeOrder,
  resolve: (t: Five) => Five = (t) => t,
): number {
  a = resolve(a.map((v) => (v === MISSING_TIME ? '' : v)) as Five)
  b = resolve(b.map((v) => (v === MISSING_TIME ? '' : v)) as Five)
  const parts = (time: Five) => [
    ...time.slice(0, 3),
    ...(dateParts(time[3]) ?? [time[3]]).concat(['', '', '']).slice(0, 3),
    ...displayClock(time[4]).split(':'),
  ]
  const aa = parts(a),
    bb = parts(b)
  const last = (values: string[]) => values.reduce((n, value, i) => (value ? i : n), -1)
  for (let i = 0; i <= Math.min(last(aa), last(bb)); i++) {
    const x = aa[i] || '',
      y = bb[i] || ''
    if (x === y) continue
    if (!x || !y) return !x ? 1 : -1
    if (i < 3) {
      const rank = (value: string) => {
        const index = order[i].indexOf(value)
        return index < 0 ? Infinity : index
      }
      if (rank(x) !== rank(y)) return rank(x) < rank(y) ? -1 : 1
      // An unregistered category cannot be assigned a historical rank.
      if (x !== y) return 0
    }
    const c = natural.compare(x, y)
    if (c) return c
  }
  return 0
}
export function matchesTimeRange(
  node: TimelineNode,
  start?: Five,
  end?: Five,
  order: TimeOrder = emptyTimeOrder(),
  resolve: (t: Five) => Five = (t) => t,
): boolean {
  const hasStart = start?.some(Boolean),
    hasEnd = end?.some(Boolean)
  if (!hasStart && !hasEnd) return true
  if ([start, end].some((bound) => bound?.[4] && !bound[3])) return false
  if (
    [start, end].some((bound) =>
      bound
        ?.slice(0, 3)
        .some(
          (value, i) => value && value !== MISSING_TIME && !order[i].includes(value),
        ),
    )
  )
    return false
  const knownStart = node.time.some(Boolean),
    knownEnd = node.endTime?.some(Boolean)
  if (!knownStart && !knownEnd) return false
  if (hasStart && hasEnd && compareTimeBounds(start!, end!, order, resolve) > 0)
    return false
  const eventEnd = node.endTime || node.time
  if (
    hasStart &&
    eventEnd.some(Boolean) &&
    compareTimeBounds(eventEnd, start!, order, resolve) < 0
  )
    return false
  if (hasEnd && knownStart && compareTimeBounds(node.time, end!, order, resolve) > 0)
    return false
  return true
}
export function matches(
  node: TimelineNode,
  f: Filters,
  timeOrder: TimeOrder = emptyTimeOrder(),
  resolve: (t: Five) => Five = (t) => t,
): boolean {
  if (!node.location.some(Boolean)) {
    if (!f.showNoLocation) return false
  } else if (!matchesHierarchy(node.location, f.location)) return false
  if (
    !f.organizations.all &&
    !node.organizations.some((value) => f.organizations.values.includes(value))
  )
    return false
  if (!matchesTimeRange(node, f.startTime, f.endTime, timeOrder, resolve)) return false
  if (
    !f.countries.all &&
    !node.countries.some((value) => f.countries.values.includes(value))
  )
    return false
  if (
    !f.characters.all &&
    !node.characters.some((value) => f.characters.values.includes(value))
  )
    return false
  const q = f.query.trim().toLocaleLowerCase()
  return (
    !q ||
    [
      plainText(node.event),
      ...node.time,
      ...timeDisplay(node.time, [true, true, true, true, true]),
      ...(node.endTime || []),
      ...(node.endTime
        ? timeDisplay(node.endTime, [true, true, true, true, true])
        : []),
      ...node.location,
      ...node.organizations.flat(),
      ...node.countries,
      ...node.characters,
    ]
      .join(' ')
      .toLocaleLowerCase()
      .includes(q)
  )
}
function hierarchy(value: unknown): HierarchyFilter {
  if (!value) return emptyHierarchy()
  if (Array.isArray(value)) {
    const values = sortedCharacters(levels(value).filter(Boolean))
    return values.length
      ? { ...emptyHierarchy(), legacy: { values, levels: [] } }
      : emptyHierarchy()
  }
  const f = object(value)
  if ('depth' in f) {
    if (
      !Number.isInteger(f.depth) ||
      Number(f.depth) < 1 ||
      Number(f.depth) > 5 ||
      !Array.isArray(f.selections) ||
      f.selections.length !== 5
    )
      throw new Error('筛选层级无效')
    const selections = f.selections.map((v) =>
      v === null
        ? null
        : Array.isArray(v)
          ? [...new Set(v.map(string))]
          : (() => {
              throw new Error('筛选选项无效')
            })(),
    )
    const result: HierarchyFilter = { depth: Number(f.depth), selections }
    if ('paths' in f) {
      if (
        f.paths !== null &&
        (!Array.isArray(f.paths) || f.paths.some((p) => typeof p !== 'string'))
      )
        throw new Error('地点路径筛选无效')
      result.paths = f.paths as string[] | null
    }
    if (f.legacy) result.legacy = legacyHierarchy(f.legacy)
    return result
  }
  const legacy = legacyHierarchy(f)
  return legacy.values.length || legacy.levels.length
    ? { ...emptyHierarchy(), legacy }
    : emptyHierarchy()
}
function legacyHierarchy(value: unknown) {
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
function tagSelection(value: unknown, legacy?: unknown): TagSelection {
  if (value && !Array.isArray(value) && typeof value === 'object') {
    const f = object(value)
    if (typeof f.all !== 'boolean') throw new Error('标签筛选无效')
    return { all: f.all, values: names(f.values) }
  }
  const values = Array.isArray(value)
    ? names(value)
    : typeof legacy === 'string' && legacy.trim()
      ? [legacy.trim()]
      : []
  return { all: !values.length, values }
}
export function normalizeSettings(
  value: Partial<Settings> & Record<string, unknown>,
): Settings {
  const settings = defaults()
  if (themes.some((t) => t.id === value.theme)) settings.theme = String(value.theme)
  if (Array.isArray(value.visibleTime) && value.visibleTime.length === 5)
    settings.visibleTime = value.visibleTime.map(Boolean)
  if (
    ['time', 'location', 'countries', 'organizations', 'characters'].includes(
      String(value.filterPanel),
    )
  )
    settings.filterPanel = String(value.filterPanel)
  settings.charactersOpen = value.charactersOpen === true
  settings.countriesOpen = value.countriesOpen === true
  settings.organizationsOpen = value.organizationsOpen === true
  if (Array.isArray(value.locationLabels) && value.locationLabels.length === 5)
    settings.locationLabels = value.locationLabels.map((v, i) =>
      typeof v === 'string' && v.trim() ? v.trim() : `${i + 1}级`,
    ) as Five
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
    ...new Set(
      (values as unknown[]).map((value) => string(value).trim()).filter(Boolean),
    ),
  ]) as TimeOrder
  return {
    id,
    title,
    description: typeof v.description === 'string' ? v.description : '',
    nodes,
    timeOrder: mergeTimeOrder(timeOrder, nodes),
    timeNames: reconcileTimeNames(readTimeNames(v.timeNames), nodes),
    characters: sortedCharacters([
      ...names(v.characters ?? []),
      ...nodes.flatMap((n) => n.characters),
    ]),
    countries: sortedCharacters([
      ...names(v.countries ?? []),
      ...nodes.flatMap((n) => n.countries),
    ]),
    organizations: sortedCharacters([
      ...names(v.organizations ?? []),
      ...nodes.flatMap((n) => n.organizations),
    ]),
    updatedAt: string(v.updatedAt),
    filters: {
      query: typeof f.query === 'string' ? f.query : '',
      location: hierarchy(f.location),
      organizations: f.organizations
        ? tagSelection(f.organizations)
        : tagSelection(
            Array.isArray(f.organization)
              ? f.organization.filter(Boolean)
              : f.organization && typeof f.organization === 'object'
                ? (f.organization as Record<string, unknown>).values
                : undefined,
          ),
      showNoLocation: f.showNoLocation !== false,
      countries: tagSelection(f.countries, f.country),
      characters: tagSelection(f.characters, f.character),
      ...(f.startTime ? { startTime: levels(f.startTime) } : {}),
      ...(f.endTime ? { endTime: levels(f.endTime) } : {}),
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
        (m) =>
          !['bold', 'underline', 'italic', 'strike', 'spoiler'].includes(String(m)),
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
    organizations:
      n.organizations === undefined
        ? n.organization === undefined
          ? []
          : names(levels(n.organization).filter(Boolean))
        : Array.isArray(n.organizations)
          ? names(n.organizations.flat())
          : (() => {
              throw new Error('组织格式无效')
            })(),
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
    ![1, 2, 3, 4, 5, 6].includes(Number(v.version)) ||
    !Array.isArray(v.timelines) ||
    !v.timelines.length ||
    v.timelines.length > MAX_TIMELINES
  )
    throw new Error('请选择序时导出的 JSON 文件（1 至 1000 条时间轴）')
  return v.timelines.map(validateTimeline)
}

export const displayClock = (value: string) =>
  value.trim().split(':').slice(0, 2).join(':')
export function visibleTimeLevels(nodes: TimelineNode[]): boolean[] {
  return Array.from({ length: 5 }, (_, i) =>
    nodes.some((n) => n.time[i] || n.endTime?.[i]),
  )
}
export function timeDisplay(time: Five, used: boolean[]): string[] {
  const last = time.reduce((n, value, i) => (value ? i : n), -1)
  return time.map((value, i) =>
    i > last || !used[i]
      ? ''
      : !value
        ? '???'
        : i === 3
          ? displayDate(value)
          : i === 4
            ? displayClock(value)
            : value,
  )
}

export const MISSING_TIME = '\u0001missing'
export type TimeParents = Map<string, string[]>[]
const timeNameKey = (value: string, level: number) =>
  level === 3
    ? displayDate(value.trim())
    : level === 4
      ? displayClock(value)
      : value.trim()

function readTimeNames(raw: unknown): TimeName[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) throw new Error('时间归属格式错误')
  return raw.map((item) => {
    const entry = object(item)
    const level = Number(entry.level)
    if (
      !Number.isInteger(level) ||
      level < 0 ||
      level > 4 ||
      !Array.isArray(entry.ancestors) ||
      entry.ancestors.length !== level
    )
      throw new Error('时间归属层级错误')
    const name = timeNameKey(string(entry.name), level)
    if (!name) throw new Error('时间归属名称不能为空')
    return {
      level,
      name,
      ancestors: entry.ancestors.map((v, i) => timeNameKey(string(v), i)),
    }
  })
}

/** Keep the complete ancestry even after the last event using a name is removed.
 * Missing ancestors are stored as empty strings, never inferred from history. */
export function mergeTimeNames(
  known: TimeName[] = [],
  nodes: TimelineNode[],
): TimeName[] {
  const entries = new Map<string, TimeName>()
  const add = (entry: TimeName) => entries.set(JSON.stringify(entry), entry)
  known.forEach(add)
  for (const node of nodes)
    for (const time of [node.time, node.endTime].filter(Boolean) as Five[]) {
      const values = time.map(timeNameKey)
      values.forEach((name, level) => {
        if (name) add({ level, name, ancestors: values.slice(0, level) })
      })
    }
  return [...entries.values()]
}

export function timeParents(
  nodes: TimelineNode[],
  known: TimeName[] = [],
): TimeParents {
  const result: TimeParents = Array.from({ length: 5 }, () => new Map())
  for (const { level, name, ancestors } of mergeTimeNames(known, nodes)) {
    const key = JSON.stringify(ancestors),
      prefixes = result[level].get(name) || []
    if (!prefixes.includes(key)) prefixes.push(key)
    result[level].set(name, prefixes)
  }
  return result
}

/** Only ambiguous legacy records may lose a branch after the user renames its
 * events. A unique, established ownership is never reassigned this way. */
export function reconcileTimeNames(
  known: TimeName[] = [],
  nodes: TimelineNode[],
): TimeName[] {
  const saved = timeParents([], known),
    live = timeParents(nodes)
  return mergeTimeNames(
    known.filter(({ level, name, ancestors }) => {
      const candidates = saved[level].get(name) || []
      const used = live[level].get(name)
      return (
        candidates.length < 2 ||
        !used?.length ||
        used.includes(JSON.stringify(ancestors))
      )
    }),
    nodes,
  )
}

export function timeOptions(
  values: string[],
  index: number,
  bound: Five,
  parents: TimeParents,
): string[] {
  if (!index) return values
  return values.filter((name) => {
    const prefixes = parents[index].get(timeNameKey(name, index)) || []
    return (
      prefixes.some((raw) => {
        const prefix: string[] = JSON.parse(raw)
        return prefix.every(
          (value, i) =>
            !bound[i] ||
            (bound[i] === MISSING_TIME ? !value : timeNameKey(bound[i], i) === value),
        )
      }) ||
      (!prefixes.length && !bound.slice(0, index).some(Boolean))
    )
  })
}

export function nodeTimeError(
  node: TimelineNode,
  others: TimelineNode[],
  known?: TimeName[],
): string {
  // The persisted registry is authoritative for the node being edited. Its
  // autosaved intermediate input must not establish new ownership per keystroke.
  const parents = timeParents(
    known ? others.filter((n) => n.id !== node.id) : others,
    known,
  )
  const original = others.find((n) => n.id === node.id)
  const unchanged = (time: Five, index: number) =>
    [original?.time, original?.endTime].some(
      (old) =>
        old &&
        JSON.stringify(old.slice(0, index + 1).map(timeNameKey)) ===
          JSON.stringify(time.slice(0, index + 1).map(timeNameKey)),
    )
  for (const time of [node.time, node.endTime].filter(Boolean) as Five[]) {
    if (time[4].trim() && !time[3].trim()) return '填写时刻前，请先填写日期。'
    for (let i = 1; i < 5; i++) {
      const name = timeNameKey(time[i], i)
      if (!name) continue
      const prefixes = parents[i].get(name)
      const prefix = JSON.stringify(time.slice(0, i).map(timeNameKey))
      if (!unchanged(time, i) && prefixes?.some((p) => p !== prefix))
        return `${timeLabels[i]}“${time[i]}”已属于其他上级，请使用不同名称。`
      parents[i].set(name, [...(prefixes || []), prefix])
    }
  }
  return ''
}
export function updateTimeBound(
  time: Five,
  index: number,
  value: string,
  parents: TimeParents,
): Five {
  if (
    index > 0 &&
    index < 3 &&
    value &&
    value !== MISSING_TIME &&
    !timeOptions([value], index, time, parents).includes(value)
  )
    return [...time] as Five
  const result = [...time] as Five
  result[index] = value
  result.fill('', index + 1)
  if (index > 0 && index < 3 && value && value !== MISSING_TIME) {
    const prefixes = parents[index].get(value)
    if (prefixes?.length === 1) {
      const prefix: string[] = JSON.parse(prefixes[0])
      prefix.forEach((v, i) => (result[i] = v || MISSING_TIME))
    }
  }
  return result
}

/** Sorting keys are resolved once for the whole timeline, never by skipping
 * missing ancestors pairwise (which can create comparator cycles). A known
 * lower name supplies its parent; an unassigned name is anchored beside the
 * nearest assigned name in the user's order. Stored/displayed blanks stay blank. */
export function timeResolver(order: TimeOrder, nodes: TimelineNode[]) {
  const parents = timeParents(nodes)
  const caches = [
    new Map<string, string[]>(),
    new Map<string, string[]>(),
    new Map<string, string[]>(),
  ]
  for (let level = 1; level < 3; level++) {
    const names = order[level]
    const known = names.map((name) => {
      const values = parents[level].get(name)
      return values?.length === 1 ? (JSON.parse(values[0]) as string[]) : undefined
    })
    const previous: number[] = [],
      next: number[] = []
    let last = -1
    for (let i = 0; i < names.length; i++) {
      if (known[i]?.some(Boolean)) last = i
      previous[i] = last
    }
    last = -1
    for (let i = names.length - 1; i >= 0; i--) {
      if (known[i]?.some(Boolean)) last = i
      next[i] = last
    }
    names.forEach((name, i) => {
      const left = previous[i],
        right = next[i]
      const nearest =
        left < 0 ? right : right < 0 ? left : i - left <= right - i ? left : right
      const prefix = known[i]?.some(Boolean)
        ? known[i]
        : nearest < 0
          ? known[i]
          : known[nearest]
      if (prefix) caches[level].set(name, prefix)
    })
  }
  return (time: Five): Five => {
    const resolved = [...time] as Five
    for (let i = 2; i > 0; i--) {
      const prefix = caches[i].get(resolved[i])
      prefix?.forEach((value, j) => {
        if (!resolved[j]) resolved[j] = value
      })
    }
    resolved[4] = displayClock(resolved[4])
    return resolved
  }
}

export function assertTimeNamesUnique(nodes: TimelineNode[], known: TimeName[] = []) {
  const parents = timeParents(nodes, known)
  for (let i = 1; i < 5; i++)
    for (const [name, values] of parents[i])
      if (values.length > 1)
        throw new Error(
          `${timeLabels[i]}“${name}”对应多个上级，请先在原时间轴中改名后再导入。`,
        )
}

export function duplicateTimeline(source: Timeline): Timeline {
  const copy: Timeline = JSON.parse(JSON.stringify(source))
  copy.id = uid()
  copy.title += '的副本'
  copy.nodes.forEach((n) => (n.id = uid()))
  copy.updatedAt = new Date().toISOString()
  return copy
}

// Imports append independent nodes. Existing identifiers and manual order remain
// authoritative; only previously unknown time names are appended in source order.
export function mergeTimeline(current: Timeline, incoming: Timeline): Timeline {
  if (current.nodes.length + incoming.nodes.length > MAX_NODES)
    throw new Error('合并后将超过 10000 个节点上限')
  const timeNames = mergeTimeNames(
    [...(current.timeNames || []), ...(incoming.timeNames || [])],
    [...current.nodes, ...incoming.nodes],
  )
  assertTimeNamesUnique([], timeNames)
  const nodes = incoming.nodes.map((node) => ({
    ...(JSON.parse(JSON.stringify(node)) as TimelineNode),
    id: uid(),
  }))
  return {
    ...current,
    nodes: [...current.nodes, ...nodes],
    timeNames,
    countries: sortedCharacters([...current.countries, ...incoming.countries]),
    organizations: sortedCharacters([
      ...current.organizations,
      ...incoming.organizations,
    ]),
    characters: sortedCharacters([...current.characters, ...incoming.characters]),
    timeOrder: mergeTimeOrder(
      current.timeOrder.map((values, i) => [
        ...new Set([...values, ...incoming.timeOrder[i]]),
      ]) as TimeOrder,
      nodes,
    ),
  }
}
