<script setup lang="ts">
import { ref, shallowRef, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  GitBranch,
  Plus,
  Search,
  SlidersHorizontal,
  Download,
  Upload,
  Save,
  PanelRightClose,
  PanelRightOpen,
  ChevronDown,
  Pencil,
  Trash2,
  X,
  CheckCheck,
  Clock3,
  FolderOpen,
  Filter,
  RotateCcw,
  Users,
  MapPin,
  Building2,
  BookOpen,
  Info,
  ArrowUpRight,
  AlertCircle,
} from 'lucide-vue-next'
import {
  MAX_TIMELINES,
  MAX_NODES,
  defaults,
  newTimeline,
  newNode,
  summary,
  compareNodes,
  matches,
  emptyFilters,
  sortedCharacters,
  plainText,
  parseImport,
  validateTimeline,
  uid,
  themes,
  timeLabels,
  displayDate,
  natural,
  type Timeline,
  type TimelineNode,
  type Summary,
  type Settings,
} from './model'
import { storage } from './storage'
import { markdown, pngPage, pngPages } from './export'
import TimelineView from './components/TimelineView.vue'
import RichText from './components/RichText.vue'
import NodeForm from './components/NodeForm.vue'
import { version } from '../package.json'

const settings = ref<Settings>(defaults()),
  catalog = ref<Summary[]>([]),
  timeline = shallowRef<Timeline>(),
  filters = ref(emptyFilters())
const ready = ref(false),
  loading = ref(false),
  blocked = ref(''),
  saveState = ref('正在读取…'),
  toast = ref(''),
  error = ref('')
const selectedId = ref(''),
  editing = ref(false),
  isNew = ref(false),
  draft = shallowRef<TimelineNode>(),
  editorKey = ref(0)
const modal = ref(''),
  libraryQuery = ref(''),
  projectTitle = ref(''),
  projectDescription = ref(''),
  projectNew = ref(false),
  imported = shallowRef<Timeline[]>([])
const fileInput = ref<HTMLInputElement>(),
  dialog = ref<HTMLElement>(),
  view = ref<InstanceType<typeof TimelineView>>()
const confirmTitle = ref(''),
  confirmCopy = ref('')
let confirmAction: () => Promise<void> = async () => {}
const modalTitle = computed(() =>
  modal.value === 'confirm' ? confirmTitle.value : titles[modal.value] || '序时',
)
const exportScope = ref('filtered'),
  exporting = ref(false),
  exportProgress = ref(''),
  mutationBusy = ref(false)
async function exclusive(action: () => Promise<void>) {
  if (mutationBusy.value) return
  mutationBusy.value = true
  try {
    await action()
  } finally {
    mutationBusy.value = false
  }
}
function closeModal() {
  if (!exporting.value && !mutationBusy.value) modal.value = ''
}
let revision = 0,
  saved = 0,
  settingsRevision = 0,
  settingsSaved = 0,
  timer: ReturnType<typeof setTimeout>,
  toastTimer: ReturnType<typeof setTimeout>,
  saving: Promise<void> | undefined
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
const selected = computed(() => timeline.value?.nodes.find((n) => n.id === selectedId.value))
const ordered = computed(() => [...(timeline.value?.nodes || [])].sort(compareNodes))
const visible = computed(() => ordered.value.filter((n) => matches(n, filters.value)))
const characters = computed(() => sortedCharacters(timeline.value?.characters || []))
const countries = computed(() =>
  [...new Set(timeline.value?.nodes.map((n) => n.country).filter(Boolean) || [])].sort(
    natural.compare,
  ),
)
const filteredCatalog = computed(() =>
  catalog.value
    .filter((s) => s.title.toLowerCase().includes(libraryQuery.value.toLowerCase()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
)
const hierarchyOptions = computed(
  () =>
    Object.fromEntries(
      ['location', 'organization'].map((key) => [
        key,
        Array.from({ length: 5 }, (_, i) =>
          [
            ...new Set(
              timeline.value?.nodes
                .map((n) => n[key as 'location' | 'organization'][i])
                .filter(Boolean) || [],
            ),
          ].sort(natural.compare),
        ),
      ]),
    ) as Record<'location' | 'organization', string[][]>,
)
const filterCount = computed(
  () =>
    filters.value.location.filter(Boolean).length +
    filters.value.organization.filter(Boolean).length +
    Number(!!filters.value.query) +
    Number(!!filters.value.country) +
    Number(!!filters.value.character) +
    Number(!filters.value.showNoLocation) +
    Number(!filters.value.showNoOrganization),
)
function notify(message: string) {
  toast.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 4000)
}
function fail(e: unknown) {
  error.value = e instanceof Error ? e.message : String(e)
  if (saveState.value !== '保存失败') saveState.value = '操作未完成'
}
async function run(action: () => Promise<void>) {
  error.value = ''
  try {
    await action()
  } catch (e) {
    fail(e)
  }
}
function schedule() {
  clearTimeout(timer)
  saveState.value = '等待保存…'
  timer = setTimeout(() => run(flush), 650)
}
function changed(next: Timeline) {
  timeline.value = next
  revision++
  const meta = summary(next),
    index = catalog.value.findIndex((t) => t.id === next.id)
  if (index < 0) catalog.value.push(meta)
  else catalog.value[index] = meta
  schedule()
}
function modify(next: Timeline) {
  changed({ ...next, updatedAt: new Date().toISOString() })
}
async function flush(): Promise<void> {
  clearTimeout(timer)
  if (saving) {
    await saving
    if (revision !== saved || settingsRevision !== settingsSaved) return flush()
    return
  }
  if (blocked.value) throw new Error(blocked.value)
  saving = (async () => {
    while (revision !== saved || settingsRevision !== settingsSaved) {
      saveState.value = '正在保存…'
      if (revision !== saved && timeline.value) {
        const rev = revision
        await storage.save(clone(timeline.value))
        saved = rev
      }
      if (settingsRevision !== settingsSaved) {
        const rev = settingsRevision
        await storage.settings(clone(settings.value))
        settingsSaved = rev
      }
    }
    saveState.value = '已自动保存'
  })()
  try {
    await saving
  } catch (e) {
    saveState.value = '保存失败'
    throw e
  } finally {
    saving = undefined
  }
}
watch(
  settings,
  () => {
    document.documentElement.dataset.theme = settings.value.theme
    if (ready.value) {
      settingsRevision++
      schedule()
    }
  },
  { deep: true },
)
let changingFilters = false
watch(
  filters,
  () => {
    if (!changingFilters && timeline.value) {
      changed({ ...timeline.value, filters: clone(filters.value) })
    }
  },
  { deep: true, flush: 'sync' },
)
function loadFilters(t: Timeline) {
  changingFilters = true
  filters.value = clone(t.filters)
  changingFilters = false
}
async function switchTimeline(id: string) {
  if (loading.value) return
  if (editing.value && draft.value && (isNew.value || !plainText(draft.value.event).trim()))
    throw new Error('请先完成或取消正在编辑的节点，再切换时间轴')
  loading.value = true
  try {
    await flush()
    const raw = await storage.read(id)
    if (!raw) throw new Error('找不到此时间轴文件，未覆盖本地数据')
    const t = validateTimeline(raw)
    timeline.value = t
    loadFilters(t)
    selectedId.value = ''
    editing.value = false
    draft.value = undefined
    settings.value.activeId = id
    restoreDraft()
    saveState.value = '已自动保存'
  } finally {
    loading.value = false
  }
}
function restoreDraft() {
  const d = settings.value.draft
  if (d && d.timelineId === timeline.value?.id) {
    draft.value = clone(d.node)
    isNew.value = d.isNew
    editing.value = true
    editorKey.value++
    selectedId.value = d.isNew ? '' : d.node.id
    settings.value.inspector = true
  }
}
function addNode() {
  if (!timeline.value || timeline.value.nodes.length >= MAX_NODES) return
  if (editing.value && draft.value && isNew.value) {
    notify('请先完成或取消当前节点')
    return
  }
  draft.value = newNode()
  isNew.value = true
  editing.value = true
  editorKey.value++
  settings.value.inspector = true
  settings.value.draft = { timelineId: timeline.value.id, node: clone(draft.value), isNew: true }
}
function chooseNode(node: TimelineNode) {
  if (editing.value && isNew.value) {
    notify('请先完成或取消正在添加的节点')
    return
  }
  if (editing.value && !plainText(draft.value?.event || []).trim()) {
    notify('请先补全事件，或结束编辑放弃空事件修改')
    return
  }
  editing.value = false
  selectedId.value = node.id
  settings.value.inspector = true
  delete settings.value.draft
}
function editNode() {
  if (!selected.value) return
  draft.value = clone(selected.value)
  isNew.value = false
  editing.value = true
  editorKey.value++
}
function changeDraft(node: TimelineNode) {
  draft.value = node
  settings.value.draft = { timelineId: timeline.value!.id, node: clone(node), isNew: isNew.value }
  if (!isNew.value && plainText(node.event).trim()) applyNode(node, false)
}
function applyNode(node: TimelineNode, append: boolean) {
  const t = timeline.value!
  const normalized = clone(node)
  normalized.time = normalized.time.map((v) => v.trim()) as TimelineNode['time']
  normalized.location = normalized.location.map((v) => v.trim()) as TimelineNode['location']
  normalized.organization = normalized.organization.map((v) =>
    v.trim(),
  ) as TimelineNode['organization']
  normalized.country = normalized.country.trim()
  if (append && t.nodes.length >= MAX_NODES) throw new Error('本条时间轴已达到 10000 个节点')
  modify({
    ...t,
    nodes: append
      ? [...t.nodes, normalized]
      : t.nodes.map((n) => (n.id === node.id ? normalized : n)),
    characters: sortedCharacters([...t.characters, ...node.characters]),
  })
}
async function finishNode(node: TimelineNode) {
  applyNode(node, isNew.value)
  selectedId.value = node.id
  editing.value = false
  delete settings.value.draft
  await flush()
  await nextTick()
  if (visible.value.some((n) => n.id === node.id)) view.value?.reveal(node.id)
  else notify('节点已保存；当前筛选条件隐藏了此节点')
}
function cancelEdit() {
  editing.value = false
  draft.value = undefined
  delete settings.value.draft
}
function openProject(create = false) {
  projectNew.value = create
  projectTitle.value = create ? '' : timeline.value?.title || ''
  projectDescription.value = create ? '' : timeline.value?.description || ''
  modal.value = 'project'
}
async function finishProject() {
  if (!projectTitle.value.trim()) return
  if (
    projectNew.value &&
    editing.value &&
    draft.value &&
    (isNew.value || !plainText(draft.value.event).trim())
  )
    throw new Error('请先完成或取消当前节点，再创建时间轴')
  if (projectNew.value) {
    if (catalog.value.length >= MAX_TIMELINES) throw new Error('最多保存 1000 条时间轴')
    await flush()
    const t = newTimeline(projectTitle.value)
    t.description = projectDescription.value
    await storage.save(t)
    catalog.value.push(summary(t))
    timeline.value = t
    loadFilters(t)
    settings.value.activeId = t.id
    selectedId.value = ''
    editing.value = false
  } else
    modify({
      ...timeline.value!,
      title: projectTitle.value.trim(),
      description: projectDescription.value,
    })
  modal.value = ''
  await flush()
}
function askDeleteNode() {
  confirmTitle.value = '删除这个节点？'
  confirmCopy.value = '该节点会从当前时间轴移除，已有角色清单保留。'
  confirmAction = async () => {
    modify({
      ...timeline.value!,
      nodes: timeline.value!.nodes.filter((n) => n.id !== selectedId.value),
    })
    selectedId.value = ''
    editing.value = false
    delete settings.value.draft
    await flush()
  }
  modal.value = 'confirm'
}
function askDeleteTimeline(item: Summary) {
  confirmTitle.value = `删除「${item.title}」？`
  confirmCopy.value = `将删除 ${item.count} 个节点。建议先导出 JSON 备份，此操作不能在界面撤销。`
  confirmAction = async () => {
    await flush()
    await storage.remove(item.id)
    catalog.value = catalog.value.filter((s) => s.id !== item.id)
    if (settings.value.draft?.timelineId === item.id) delete settings.value.draft
    if (timeline.value?.id === item.id) {
      timeline.value = undefined
      editing.value = false
      selectedId.value = ''
      if (catalog.value.length) await switchTimeline(catalog.value[0].id)
      else settings.value.activeId = ''
    }
  }
  modal.value = 'confirm'
}
async function confirm() {
  await confirmAction()
  modal.value = ''
  await flush()
}
async function prepareImport(raw: unknown) {
  const ts = parseImport(raw)
  if (catalog.value.length + ts.length > MAX_TIMELINES)
    throw new Error(`导入 ${ts.length} 条后将超过 1000 条上限，请先整理时间轴库`)
  imported.value = ts
  modal.value = 'import'
}
async function importFile() {
  if (window.desktop) {
    const raw = await window.desktop.importJson()
    if (raw) await prepareImport(raw)
  } else fileInput.value?.click()
}
async function readFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  if (file.size > 512 * 1024 * 1024) throw new Error('单个文件不能超过 512 MB，请分批导入')
  await prepareImport(JSON.parse((await file.text()).replace(/^\uFEFF/, '')))
}
async function commitImport() {
  if (editing.value && draft.value && (isNew.value || !plainText(draft.value.event).trim()))
    throw new Error('请先完成或取消当前节点，再导入时间轴')
  await flush()
  const ts = imported.value.map((t) => ({
    ...clone(t),
    id: uid(),
    updatedAt: new Date().toISOString(),
  }))
  await storage.importMany(ts)
  catalog.value.push(...ts.map(summary))
  modal.value = ''
  imported.value = []
  await switchTimeline(ts[0].id)
  notify(`已导入 ${ts.length} 条时间轴`)
}
async function exportJson(all: boolean) {
  await flush()
  if (!all && !timeline.value) return
  const timelines: Timeline[] = []
  if (all) {
    for (const t of catalog.value) timelines.push(validateTimeline(await storage.read(t.id)))
  } else timelines.push(clone(timeline.value!))
  const data = { format: 'xushi', version: 1, exportedAt: new Date().toISOString(), timelines },
    title = all ? '序时-完整时间轴库' : timeline.value!.title
  if (window.desktop) {
    const file = await window.desktop.exportJson(data, title)
    if (file) notify('JSON 备份已导出')
  } else {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = title + '.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    notify('JSON 备份已生成')
  }
  modal.value = ''
}
function download(bytes: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function exportDocument(format: 'png' | 'md') {
  if (!timeline.value || exporting.value) return
  exporting.value = true
  exportProgress.value = '准备导出…'
  try {
    await flush()
    const t = clone(timeline.value),
      nodes = clone(exportScope.value === 'filtered' ? visible.value : ordered.value),
      config = clone(settings.value)
    if (format === 'md') {
      const content = markdown(t, nodes, config)
      if (window.desktop) {
        const file = await window.desktop.exportMarkdown(content, t.title)
        if (!file) return
      } else download(content, t.title + '.md', 'text/markdown')
      notify('Markdown 已导出，包含完整事件')
    } else {
      const count = pngPages(nodes.length),
        session = window.desktop ? await window.desktop.startPng(count, t.title) : 'browser'
      if (!session) return
      for (let i = 0; i < count; i++) {
        exportProgress.value = `正在导出第 ${i + 1} / ${count} 张图片…`
        const bytes = await pngPage(t, nodes, config, i)
        if (window.desktop) await window.desktop.writePng(session, i, bytes)
        else download(bytes, `${t.title}-${String(i + 1).padStart(3, '0')}.png`, 'image/png')
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
      notify(`已导出 ${count} 张 PNG 图片`)
    }
    modal.value = ''
  } finally {
    exporting.value = false
    exportProgress.value = ''
  }
}
let previousFocus: HTMLElement | null = null
watch(modal, async (value) => {
  if (value) {
    previousFocus = document.activeElement as HTMLElement
    await nextTick()
    dialog.value?.querySelector<HTMLElement>('input,button,select,textarea')?.focus()
  } else previousFocus?.focus()
})
function keydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    run(async () => {
      await flush()
      notify('已保存')
    })
  }
  if (e.key === 'Escape' && modal.value) closeModal()
  if (e.key === 'Tab' && modal.value && dialog.value) {
    const elements = [
      ...dialog.value.querySelectorAll<HTMLElement>(
        'button:not([disabled]),input,select,textarea,[tabindex="0"]',
      ),
    ].filter((el) => el.offsetParent !== null)
    const first = elements[0],
      last = elements.at(-1)
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last?.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first?.focus()
    }
  }
}
function beforeUnload(e: BeforeUnloadEvent) {
  if (revision !== saved || settingsRevision !== settingsSaved) {
    e.preventDefault()
    run(flush)
  }
}
onMounted(async () => {
  document.addEventListener('keydown', keydown)
  window.addEventListener('beforeunload', beforeUnload)
  try {
    const loaded = await storage.load()
    catalog.value = loaded.timelines
    const config = { ...defaults(), ...loaded.settings }
    if (!themes.some((t) => t.id === config.theme)) config.theme = 'grass'
    if (!Array.isArray(config.visibleTime) || config.visibleTime.length !== 5)
      config.visibleTime = defaults().visibleTime
    config.dateFormat = config.dateFormat === 'chinese' ? 'chinese' : 'dots'
    settings.value = config
    if (catalog.value.length) {
      const id = catalog.value.some((t) => t.id === config.activeId)
        ? config.activeId
        : catalog.value[0].id
      timeline.value = validateTimeline(await storage.read(id))
      settings.value.activeId = id
      loadFilters(timeline.value)
      restoreDraft()
    }
    ready.value = true
    saveState.value = '已自动保存'
    if (loaded.recovered) notify('已从本机备份恢复，损坏原文件已保留')
  } catch (e) {
    blocked.value = e instanceof Error ? e.message : String(e)
    saveState.value = '读取失败'
    ready.value = true
  }
  window.desktop?.onClosing(() =>
    run(async () => {
      try {
        await flush()
        await window.desktop!.close()
      } catch (e) {
        fail(e)
        await window.desktop!.forceClose()
      }
    }),
  )
})
onUnmounted(() => {
  clearTimeout(timer)
  clearTimeout(toastTimer)
  document.removeEventListener('keydown', keydown)
  window.removeEventListener('beforeunload', beforeUnload)
})
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand">
        <span class="brand-mark"><GitBranch :size="22" /></span><strong>序时</strong
        ><span class="brand-divider" /><span class="brand-caption">作品时间轴</span>
      </div>
      <div class="header-actions">
        <button class="text-button" :disabled="!ready || !!blocked" @click="run(importFile)">
          <Download :size="15" />导入 JSON</button
        ><button class="text-button" :disabled="!catalog.length" @click="modal = 'export'">
          <Upload :size="15" />导出</button
        ><span class="brand-divider" /><button
          class="save-button"
          :disabled="!ready || !!blocked"
          @click="
            run(async () => {
              await flush()
              notify('已保存')
            })
          "
        >
          <Save :size="14" />保存</button
        ><button class="icon-button" title="使用帮助" aria-label="使用帮助" @click="modal = 'help'">
          <Info :size="18" /></button
        ><button
          class="icon-button"
          title="显示设置"
          aria-label="显示设置"
          @click="modal = 'settings'"
        >
          <SlidersHorizontal :size="18" /></button
        ><button
          class="icon-button"
          :title="settings.inspector ? '收起详情' : '展开详情'"
          :aria-label="settings.inspector ? '收起详情' : '展开详情'"
          @click="settings.inspector = !settings.inspector"
        >
          <PanelRightClose v-if="settings.inspector" :size="18" /><PanelRightOpen
            v-else
            :size="18"
          />
        </button>
      </div>
    </header>
    <div v-if="blocked" class="blocking-message">
      <AlertCircle :size="30" />
      <h2>本地数据暂时无法读取</h2>
      <p>{{ blocked }}</p>
      <p>请保留 %APPDATA%\Xushi\workspace 中的文件，修复后重新启动。</p>
    </div>
    <div v-else class="workspace" :aria-busy="loading || !ready">
      <aside class="sidebar">
        <div class="project-card">
          <button class="project-title" @click="modal = 'library'">
            <span>{{ timeline?.title || '我的时间轴库' }}</span
            ><ChevronDown :size="16" /></button
          ><button
            v-if="timeline"
            class="icon-button"
            aria-label="修改时间轴信息"
            title="修改时间轴信息"
            @click="openProject()"
          >
            <Pencil :size="15" />
          </button>
        </div>
        <div class="sidebar-tools">
          <button class="toolbar-button" @click="modal = 'library'">
            <FolderOpen :size="15" />时间轴库 <span class="count">{{ catalog.length }} / 1000</span>
          </button>
        </div>
        <template v-if="timeline"
          ><div class="sidebar-scroll">
            <div class="section-heading">
              <Filter :size="14" /><span>筛选事件</span
              ><span v-if="filterCount" class="count">{{ filterCount }}</span
              ><button
                class="icon-button small"
                title="清除筛选"
                aria-label="清除筛选"
                @click="filters = emptyFilters()"
              >
                <RotateCcw :size="14" />
              </button>
            </div>
            <div class="search-box">
              <Search :size="15" /><input
                v-model="filters.query"
                aria-label="搜索事件"
                placeholder="搜索事件、时间、角色…"
              /><button
                v-if="filters.query"
                class="icon-button small"
                aria-label="清除搜索"
                @click="filters.query = ''"
              >
                <X :size="13" />
              </button>
            </div>
            <details class="filter-section" open>
              <summary><MapPin :size="14" />地点 <small>1 级最高</small></summary>
              <label v-for="i in 5" :key="i" class="filter-level"
                ><span>{{ i }} 级</span
                ><select v-model="filters.location[i - 1]" :aria-label="`筛选地点${i}级`">
                  <option value="">全部</option>
                  <option v-for="value in hierarchyOptions.location[i - 1]" :key="value">
                    {{ value }}
                  </option>
                </select></label
              ><label class="check-label"
                ><input type="checkbox" v-model="filters.showNoLocation" />显示无地点事件</label
              >
            </details>
            <details class="filter-section">
              <summary><Building2 :size="14" />组织 <small>1 级最高</small></summary>
              <label v-for="i in 5" :key="i" class="filter-level"
                ><span>{{ i }} 级</span
                ><select v-model="filters.organization[i - 1]" :aria-label="`筛选组织${i}级`">
                  <option value="">全部</option>
                  <option v-for="value in hierarchyOptions.organization[i - 1]" :key="value">
                    {{ value }}
                  </option>
                </select></label
              ><label class="check-label"
                ><input type="checkbox" v-model="filters.showNoOrganization" />显示无组织事件</label
              >
            </details>
            <label class="country-filter"
              >国家<select v-model="filters.country" aria-label="筛选国家">
                <option value="">全部国家</option>
                <option v-for="country in countries" :key="country">{{ country }}</option>
              </select></label
            >
            <div class="character-section">
              <button
                class="section-heading collapse-toggle"
                :aria-expanded="settings.charactersOpen"
                @click="settings.charactersOpen = !settings.charactersOpen"
              >
                <Users :size="14" /><span>已有角色</span
                ><span class="count">{{ characters.length }}</span
                ><ChevronDown :size="14" :class="{ rotated: settings.charactersOpen }" />
              </button>
              <div v-if="filters.character" class="active-character">
                <span>{{ filters.character }}</span
                ><button
                  class="icon-button small"
                  aria-label="清除角色筛选"
                  @click="filters.character = ''"
                >
                  <X :size="13" />
                </button>
              </div>
              <div v-if="settings.charactersOpen" class="character-list">
                <button :class="{ active: !filters.character }" @click="filters.character = ''">
                  全部角色</button
                ><button
                  v-for="name in characters"
                  :key="name"
                  :class="{ active: filters.character === name }"
                  @click="filters.character = name"
                >
                  {{ name }}
                </button>
                <p v-if="!characters.length" class="muted">添加事件时输入角色，以空格分隔。</p>
              </div>
            </div>
          </div>
          <div class="sidebar-bottom">
            <button
              class="primary-button full-width"
              :disabled="timeline.nodes.length >= MAX_NODES || loading"
              @click="addNode"
            >
              <Plus :size="16" />添加节点</button
            ><small>{{ timeline.nodes.length.toLocaleString() }} / 10,000 个节点</small>
          </div></template
        >
        <div v-else class="sidebar-empty">
          <BookOpen :size="32" />
          <p>收藏每个世界的时序</p>
          <button class="primary-button" @click="openProject(true)">
            <Plus :size="15" />新建时间轴
          </button>
        </div>
      </aside>
      <main class="main-area">
        <div class="content-body">
          <section class="timeline-panel">
            <div class="canvas-heading">
              <div>
                <div class="eyebrow">STORY TIMELINE</div>
                <h1>{{ timeline?.title || '故事，在时间里展开' }}</h1>
                <p>{{ timeline?.description || '为每一个世界，留下一条清晰的脉络。' }}</p>
              </div>
              <span v-if="timeline" class="view-badge"
                ><Clock3 :size="13" />{{ visible.length.toLocaleString() }} 个事件</span
              >
            </div>
            <TimelineView
              v-if="timeline"
              ref="view"
              :nodes="visible"
              :settings="settings"
              :selected-id="selectedId"
              :total="timeline.nodes.length"
              @select="chooseNode"
            />
            <div v-else class="welcome">
              <div class="welcome-axis"><span /><span /><span /></div>
              <span class="eyebrow">小说 · 游戏 · 世界设定</span>
              <h2>从第一条时间轴开始</h2>
              <p>
                记录跨越纪元的故事，也记下某一天的某一刻。<br />时间、地点、组织、角色，都可以慢慢补全。
              </p>
              <button class="primary-button" @click="openProject(true)">
                <Plus :size="16" />新建时间轴</button
              ><button class="inline-button" @click="run(importFile)">
                或导入已有 JSON 备份 <ArrowUpRight :size="14" />
              </button>
            </div>
          </section>
          <aside v-if="settings.inspector && timeline" class="inspector">
            <NodeForm
              v-if="editing && draft"
              :key="editorKey"
              :node="draft"
              :is-new="isNew"
              :known-characters="characters"
              @change="changeDraft"
              @done="(node) => run(() => finishNode(node))"
              @cancel="cancelEdit"
            /><template v-else-if="selected"
              ><div class="inspector-heading">
                <strong>事件详情</strong><span class="spacer" /><button
                  class="icon-button"
                  title="编辑节点"
                  aria-label="编辑节点"
                  @click="editNode"
                >
                  <Pencil :size="16" /></button
                ><button
                  class="icon-button danger"
                  title="删除节点"
                  aria-label="删除节点"
                  @click="askDeleteNode"
                >
                  <Trash2 :size="16" />
                </button>
              </div>
              <div class="detail-scroll">
                <div class="detail-event"><RichText :runs="selected.event" /></div>
                <div class="detail-section">
                  <h3>时间</h3>
                  <dl>
                    <template v-for="(value, i) in selected.time" :key="i"
                      ><template v-if="value"
                        ><dt>{{ timeLabels[i] }}</dt>
                        <dd>
                          {{ i === 3 ? displayDate(value, settings.dateFormat) : value }}
                        </dd></template
                      ></template
                    >
                  </dl>
                  <p v-if="selected.time.every((v) => !v)" class="muted">时间不确定</p>
                </div>
                <div
                  v-for="group in ['location', 'organization'] as const"
                  :key="group"
                  class="detail-section"
                >
                  <h3>{{ group === 'location' ? '地点' : '组织' }}</h3>
                  <dl>
                    <template v-for="(value, i) in selected[group]" :key="i"
                      ><template v-if="value"
                        ><dt>{{ i + 1 }} 级</dt>
                        <dd>{{ value }}</dd></template
                      ></template
                    >
                  </dl>
                  <p v-if="selected[group].every((v) => !v)" class="muted">未填写</p>
                </div>
                <div class="detail-section">
                  <h3>国家</h3>
                  <p>{{ selected.country || '未填写' }}</p>
                </div>
                <div class="detail-section">
                  <h3>角色</h3>
                  <div class="tags">
                    <span v-for="name in selected.characters" :key="name">{{ name }}</span
                    ><span v-if="!selected.characters.length" class="muted">未填写</span>
                  </div>
                </div>
              </div>
              <div class="inspector-foot">
                <button class="secondary-button full-width" @click="editNode">
                  <Pencil :size="14" />编辑这个节点
                </button>
              </div></template
            >
            <div v-else class="no-selection">
              <Clock3 :size="32" />
              <h3>每个事件，都有来处</h3>
              <p>点击时间轴中的节点，<br />查看完整事件与相关信息。</p>
            </div>
          </aside>
        </div>
        <footer class="status-bar">
          <span><Clock3 :size="13" />{{ timeline?.nodes.length || 0 }} 个节点</span
          ><span><Users :size="13" />{{ characters.length }} 位角色</span
          ><span class="spacer" /><span :class="{ 'error-text': saveState.includes('失败') }"
            ><CheckCheck :size="14" />{{ saveState }}</span
          ><span class="local-badge">{{ windowDesktop ? '本机 JSON' : '本浏览器存储' }}</span
          ><span v-if="timeline" class="last-edited"
            >最近编辑：{{
              new Date(timeline.updatedAt).toLocaleString('zh-CN', { hour12: false })
            }}</span
          >
        </footer>
      </main>
    </div>
    <div v-if="error" class="error-banner" role="alert">
      <AlertCircle :size="16" /><span>{{ error }}</span
      ><button class="text-button" @click="run(flush)">重试保存</button
      ><button class="icon-button" aria-label="关闭错误提示" @click="error = ''">
        <X :size="15" />
      </button>
    </div>
    <div v-if="toast" class="toast-message" role="status"><CheckCheck :size="16" />{{ toast }}</div>
    <input
      ref="fileInput"
      class="hidden-input"
      type="file"
      accept=".json,application/json"
      aria-label="导入 JSON 文件"
      @change="(e) => run(() => readFile(e))"
    />
    <div v-if="modal" class="modal-backdrop" @mousedown.self="closeModal">
      <section
        ref="dialog"
        class="modal"
        :class="{ 'wide-modal': modal === 'library' }"
        role="dialog"
        aria-modal="true"
        :aria-label="modalTitle"
      >
        <div class="modal-heading">
          <h2>{{ modalTitle }}</h2>
          <button class="icon-button" aria-label="关闭对话框" @click="closeModal">
            <X :size="18" />
          </button>
        </div>
        <template v-if="modal === 'settings'"
          ><div class="theme-grid">
            <button
              v-for="theme in themes"
              :key="theme.id"
              :class="{ active: settings.theme === theme.id }"
              :aria-pressed="settings.theme === theme.id"
              @click="settings.theme = theme.id"
            >
              <span :style="{ background: theme.background, color: theme.color }"
                ><GitBranch :size="22" /></span
              >{{ theme.name }}
            </button>
          </div>
          <div class="setting-row">
            <div>
              <strong>时间轴显示的时间层级</strong>
              <p>仅改变卡片显示，完整时间始终参与排序。</p>
            </div>
            <div class="time-options">
              <label v-for="(label, i) in timeLabels" :key="label" class="check-label"
                ><input type="checkbox" v-model="settings.visibleTime[i]" />{{ label }}</label
              >
            </div>
          </div>
          <div class="setting-row">
            <div>
              <strong>日期显示格式</strong>
              <p>数字日期可转换显示；自定义文字保留原样。</p>
            </div>
            <select v-model="settings.dateFormat" aria-label="日期显示格式">
              <option value="dots">1234.5.6</option>
              <option value="chinese">1234年5月6日</option>
            </select>
          </div>
          <p class="form-note">主题、时间显示、日期格式、角色清单折叠状态和筛选会自动保存。</p>
          <div class="about-line">
            <span>序时 {{ version }}</span
            ><span>© 2026 Symplatt · 版权所有</span>
          </div></template
        >
        <template v-else-if="modal === 'library'"
          ><div class="book-tools">
            <div class="search-box">
              <Search :size="15" /><input
                v-model="libraryQuery"
                placeholder="搜索时间轴…"
                aria-label="搜索时间轴"
              />
            </div>
            <button
              class="primary-button"
              :disabled="catalog.length >= MAX_TIMELINES"
              @click="openProject(true)"
            >
              <Plus :size="15" />新建时间轴
            </button>
          </div>
          <p class="form-note">{{ catalog.length }} / 1000 条时间轴 · 点击切换</p>
          <div class="book-list">
            <div
              v-for="item in filteredCatalog"
              :key="item.id"
              class="book-row"
              :class="{ active: item.id === timeline?.id }"
            >
              <button
                class="book-select"
                :disabled="loading"
                @click="
                  run(async () => {
                    await switchTimeline(item.id)
                    modal = ''
                  })
                "
              >
                <BookOpen :size="22" /><span
                  ><strong>{{ item.title }}</strong
                  ><small
                    >{{ item.count.toLocaleString() }} 个节点 ·
                    {{ new Date(item.updatedAt).toLocaleDateString('zh-CN') }}</small
                  ></span
                ><span v-if="item.id === timeline?.id" class="count">当前</span></button
              ><button
                class="icon-button danger"
                :aria-label="`删除时间轴 ${item.title}`"
                @click="askDeleteTimeline(item)"
              >
                <Trash2 :size="16" />
              </button>
            </div>
            <p v-if="!filteredCatalog.length" class="empty-list">
              {{ catalog.length ? '没有找到匹配的时间轴' : '还没有时间轴，创建一个或导入备份。' }}
            </p>
          </div></template
        >
        <form v-else-if="modal === 'project'" @submit.prevent="run(() => exclusive(finishProject))">
          <label
            >时间轴名称<input
              v-model="projectTitle"
              aria-label="时间轴名称"
              placeholder="如 黑铁纪元编年史"
              required /></label
          ><label
            >简介 <small>选填</small
            ><textarea
              v-model="projectDescription"
              aria-label="时间轴简介"
              rows="3"
              placeholder="关于这部作品、这个世界…"
            />
          </label>
          <div class="modal-actions">
            <button class="secondary-button" type="button" @click="closeModal">取消</button
            ><button class="primary-button" :disabled="!projectTitle.trim()">
              {{ projectNew ? '创建时间轴' : '完成' }}
            </button>
          </div>
        </form>
        <template v-else-if="modal === 'export'"
          ><p class="dialog-copy">
            JSON 用于完整备份；PNG 用于分享时间轴；Markdown 保留完整事件，方便阅读和整理。
          </p>
          <button
            class="export-option"
            :disabled="!timeline || exporting"
            @click="run(() => exportJson(false))"
          >
            <BookOpen :size="24" /><span
              ><strong>JSON · 当前时间轴</strong
              ><small
                >{{ timeline?.title }} ·
                {{ timeline?.nodes.length }} 个节点，含全部字段与格式</small
              ></span
            ><Upload :size="16" /></button
          ><button class="export-option" :disabled="exporting" @click="run(() => exportJson(true))">
            <FolderOpen :size="24" /><span
              ><strong>JSON · 完整时间轴库</strong
              ><small>{{ catalog.length }} 条时间轴 · 全部作品</small></span
            ><Upload :size="16" />
          </button>
          <div class="setting-row export-scope">
            <strong>PNG / Markdown 导出范围</strong
            ><select v-model="exportScope" aria-label="导出节点范围" :disabled="exporting">
              <option value="filtered">当前筛选结果（{{ visible.length }} 个节点）</option>
              <option value="all">当前时间轴全部节点（{{ ordered.length }} 个节点）</option>
            </select>
          </div>
          <div class="document-export-actions">
            <button
              class="secondary-button"
              :disabled="!timeline || exporting"
              @click="run(() => exportDocument('png'))"
            >
              <Upload :size="15" />导出 PNG 图片</button
            ><button
              class="secondary-button"
              :disabled="!timeline || exporting"
              @click="run(() => exportDocument('md'))"
            >
              <Upload :size="15" />导出 Markdown
            </button>
          </div>
          <p class="form-note">
            PNG 每张最多 14 个节点，卡片保留前 100 字，屏蔽文字保持黑色；Markdown
            包含全文。支持内嵌样式的 Markdown 阅读器可悬停查看屏蔽文字。
          </p>
          <p v-if="exporting" role="status" class="export-progress">
            {{ exportProgress }}
          </p></template
        >
        <template v-else-if="modal === 'import'"
          ><p class="dialog-copy">
            已检查 {{ imported.length }} 条时间轴、{{
              imported.reduce((n, t) => n + t.nodes.length, 0).toLocaleString()
            }}
            个节点。将作为新时间轴加入，已有作品保留。
          </p>
          <div class="import-list">
            <p v-for="(t, i) in imported" :key="i">
              {{ t.title }} <span class="muted">{{ t.nodes.length }} 个节点</span>
            </p>
          </div>
          <div class="modal-actions">
            <button class="secondary-button" @click="closeModal">取消</button
            ><button class="primary-button" @click="run(() => exclusive(commitImport))">
              确认导入
            </button>
          </div></template
        >
        <template v-else-if="modal === 'confirm'"
          ><p class="dialog-copy">{{ confirmCopy }}</p>
          <div class="modal-actions">
            <button class="secondary-button" @click="closeModal">取消</button
            ><button class="primary-button destructive" @click="run(() => exclusive(confirm))">
              确认删除
            </button>
          </div></template
        >
        <template v-else-if="modal === 'help'"
          ><div class="help-content">
            <p>
              <strong>01 · 建立时间轴</strong>从左上角打开时间轴库，管理最多 1000 条时间轴，每条最多
              10000 个节点。
            </p>
            <p>
              <strong>02 · 记录事件</strong
              >只有事件必填。角色以空格分隔，会进入按字母／拼音排列的已有角色清单。
            </p>
            <p>
              <strong>03 · 阅读与筛选</strong>时间轴仅上下滚动。卡片显示事件前 100
              字，点击右侧查看全文；黑色屏蔽文字悬停或键盘聚焦可见。
            </p>
            <p>
              <strong>04 · 时间排序</strong
              >时代、朝代、历法、日期、时刻依次按数字、字母自然排序。缺失层级位于相同上层分组末尾；全空时间位于最后。同一天缺失时刻的事件排在当天末尾，只有年份的日期排在该年末尾。不会推断真实历史朝代先后。
            </p>
            <p>
              <strong>05 · 地点与组织</strong>均为 5 级，1
              级最高。可同时选择不同层级；勾选“显示无地点／组织事件”时，无对应信息的节点也会显示。
            </p>
            <p>
              <strong>06 · 保存与备份</strong>修改后约 0.65 秒自动保存，Ctrl+S
              可立即保存。未完成节点以草稿恢复。桌面数据位于
              %APPDATA%\Xushi\workspace，更新和卸载保留数据；请定期导出完整 JSON。
            </p>
            <p class="form-note">屏蔽是阅读效果，JSON 内仍含原文，不是加密。</p>
          </div></template
        >
      </section>
    </div>
  </div>
</template>

<script lang="ts">
const windowDesktop = !!window.desktop
const titles: Record<string, string> = {
  settings: '显示设置',
  library: '时间轴库',
  project: '时间轴信息',
  export: '导出作品',
  import: '导入预览',
  help: '认识序时',
}
</script>
