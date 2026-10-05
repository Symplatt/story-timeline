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
  Flag,
  AlertCircle,
} from 'lucide-vue-next'
import {
  MAX_TIMELINES,
  MAX_NODES,
  defaults,
  newTimeline,
  newNode,
  summary,
  createNodeComparator,
  mergeTimeOrder,
  matches,
  emptyFilters,
  sortedCharacters,
  plainText,
  parseImport,
  validateTimeline,
  uid,
  themes,
  timeLabels,
  normalizeSettings,
  type Timeline,
  type TimelineNode,
  type Summary,
  type Settings,
} from './model'
import { storage } from './storage'
import TimelineView from './components/TimelineView.vue'
import HierarchyFilter from './components/HierarchyFilter.vue'
import TagFilter from './components/TagFilter.vue'
import TimeFilter from './components/TimeFilter.vue'
import NodeForm from './components/NodeForm.vue'
import TimeOrderEditor from './components/TimeOrderEditor.vue'
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
  modal.value === 'confirm'
    ? confirmTitle.value
    : modal.value === 'node'
      ? isNew.value
        ? '添加节点'
        : '编辑节点'
      : titles[modal.value] || '序时',
)
const mutationBusy = ref(false)
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
  if (mutationBusy.value) return
  if (modal.value === 'node') cancelEdit()
  else modal.value = ''
}
let revision = 0,
  saved = 0,
  settingsRevision = 0,
  settingsSaved = 0,
  timer: ReturnType<typeof setTimeout>,
  toastTimer: ReturnType<typeof setTimeout>,
  saving: Promise<void> | undefined
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
const ordered = computed(() =>
  [...(timeline.value?.nodes || [])].sort(
    createNodeComparator(timeline.value?.timeOrder),
  ),
)
const visible = computed(() =>
  ordered.value.filter((n) => matches(n, filters.value, timeline.value?.timeOrder)),
)
const characters = computed(() => sortedCharacters(timeline.value?.characters || []))
const countries = computed(() => sortedCharacters(timeline.value?.countries || []))
const hierarchyOpen = ref<'location' | ''>('')
const filteredCatalog = computed(() =>
  catalog.value
    .filter((s) => s.title.toLowerCase().includes(libraryQuery.value.toLowerCase()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
)
const hierarchyPaths = computed(() =>
  (timeline.value?.nodes || []).map((n) => n.location),
)
const organizations = computed(() =>
  sortedCharacters(timeline.value?.organizations || []),
)
const filterCount = computed(
  () =>
    Number(!!filters.value.query) +
    Number(!filters.value.countries.all) +
    Number(!filters.value.characters.all) +
    Number(!filters.value.organizations.all) +
    Number(!filters.value.showNoLocation) +
    Number(
      !!filters.value.startTime?.some(Boolean) || !!filters.value.endTime?.some(Boolean),
    ) +
    Number(
      !!filters.value.location.legacy?.values.length ||
        !!filters.value.location.legacy?.levels.length ||
        filters.value.location.selections
          .slice(0, filters.value.location.depth)
          .some((v) => v !== null),
    ),
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
  hierarchyOpen.value = ''
  if (loading.value) return
  if (
    editing.value &&
    draft.value &&
    (isNew.value || !plainText(draft.value.event).trim())
  )
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
    modal.value = 'node'
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
  modal.value = 'node'
  settings.value.draft = {
    timelineId: timeline.value.id,
    node: clone(draft.value),
    isNew: true,
  }
}
function chooseNode(node: TimelineNode) {
  selectedId.value = node.id
}
function editNode(node: TimelineNode) {
  selectedId.value = node.id
  draft.value = clone(node)
  isNew.value = false
  editing.value = true
  editorKey.value++
  modal.value = 'node'
}
function changeDraft(node: TimelineNode) {
  draft.value = node
  settings.value.draft = {
    timelineId: timeline.value!.id,
    node: clone(node),
    isNew: isNew.value,
  }
  if (!isNew.value && plainText(node.event).trim()) applyNode(node, false, false)
}
function applyNode(node: TimelineNode, append: boolean, remember = true) {
  const t = timeline.value!
  const normalized = clone(node)
  normalized.time = normalized.time.map((v) => v.trim()) as TimelineNode['time']
  if (normalized.endTime)
    normalized.endTime = normalized.endTime.map((v) => v.trim()) as TimelineNode['time']
  normalized.location = normalized.location.map((v) =>
    v.trim(),
  ) as TimelineNode['location']
  normalized.organizations = sortedCharacters(
    normalized.organizations.map((v) => v.trim()).filter(Boolean),
  )
  if (append && t.nodes.length >= MAX_NODES)
    throw new Error('本条时间轴已达到 10000 个节点')
  modify({
    ...t,
    nodes: append
      ? [...t.nodes, normalized]
      : t.nodes.map((n) => (n.id === node.id ? normalized : n)),
    // Keep autosaving the node, but only register completed labels. Otherwise
    // every keystroke while editing creates a spurious country or era name.
    characters: remember
      ? sortedCharacters([...t.characters, ...node.characters])
      : t.characters,
    countries: remember
      ? sortedCharacters([...t.countries, ...node.countries])
      : t.countries,
    organizations: remember
      ? sortedCharacters([...t.organizations, ...node.organizations])
      : t.organizations,
    timeOrder: remember ? mergeTimeOrder(t.timeOrder, [normalized]) : t.timeOrder,
  })
}
async function finishNode(node: TimelineNode) {
  applyNode(node, isNew.value)
  selectedId.value = node.id
  editing.value = false
  delete settings.value.draft
  await flush()
  modal.value = ''
  await nextTick()
  if (visible.value.some((n) => n.id === node.id)) view.value?.reveal(node.id)
  else notify('节点已保存；当前筛选条件隐藏了此节点')
}
function cancelEdit() {
  if (!isNew.value && draft.value && plainText(draft.value.event).trim())
    applyNode(draft.value, false)
  editing.value = false
  draft.value = undefined
  delete settings.value.draft
  modal.value = ''
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
function askDeleteNode(node: TimelineNode) {
  run(async () => {
    modify({
      ...timeline.value!,
      nodes: timeline.value!.nodes.filter((n) => n.id !== node.id),
    })
    if (selectedId.value === node.id) selectedId.value = ''
    if (settings.value.draft?.node.id === node.id) delete settings.value.draft
    await flush()
  })
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
  if (file.size > 512 * 1024 * 1024)
    throw new Error('单个文件不能超过 512 MB，请分批导入')
  await prepareImport(JSON.parse((await file.text()).replace(/^\uFEFF/, '')))
}
async function commitImport() {
  if (
    editing.value &&
    draft.value &&
    (isNew.value || !plainText(draft.value.event).trim())
  )
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
    for (const t of catalog.value)
      timelines.push(validateTimeline(await storage.read(t.id)))
  } else timelines.push(clone(timeline.value!))
  const data = {
      format: 'xushi',
      version: 4,
      exportedAt: new Date().toISOString(),
      timelines,
    },
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
    const config = normalizeSettings(loaded.settings)
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
        <button
          class="text-button"
          :disabled="!ready || !!blocked"
          @click="run(importFile)"
        >
          <Download :size="15" />导入 JSON
        </button>
        <button class="text-button" :disabled="!catalog.length" @click="modal = 'export'">
          <Upload :size="15" />导出 JSON
        </button>
        <span class="brand-divider" />
        <button
          class="save-button"
          :disabled="!ready || !!blocked"
          @click="
            run(async () => {
              await flush()
              notify('已保存')
            })
          "
        >
          <Save :size="15" />保存
        </button>
        <button
          class="icon-button"
          title="显示设置"
          aria-label="显示设置"
          @click="modal = 'settings'"
        >
          <SlidersHorizontal :size="18" />
        </button>
        <button
          class="icon-button"
          title="认识序时"
          aria-label="认识序时"
          @click="modal = 'help'"
        >
          <Info :size="18" />
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
          <button
            class="project-title"
            aria-label="切换时间轴"
            @click="modal = 'library'"
          >
            <span>{{ timeline?.title || '选择时间轴' }}</span
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
        <div v-if="timeline" class="sidebar-scroll">
          <div class="section-heading">
            <Filter :size="15" /><span>筛选事件</span
            ><span v-if="filterCount" class="count">{{ filterCount }}</span
            ><button
              class="clear-filters"
              title="清除筛选"
              aria-label="取消所有筛选"
              @click="filters = emptyFilters()"
            >
              <RotateCcw :size="14" />取消所有筛选
            </button>
          </div>
          <div class="search-box">
            <Search :size="15" /><input
              v-model="filters.query"
              aria-label="搜索事件"
            /><button
              v-if="filters.query"
              class="icon-button small"
              aria-label="清除搜索"
              @click="filters.query = ''"
            >
              <X :size="13" />
            </button>
          </div>
          <TimeFilter v-model="filters" :order="timeline.timeOrder" />
          <HierarchyFilter
            v-model="filters.location"
            v-model:show-empty="filters.showNoLocation"
            label="地点"
            :paths="hierarchyPaths"
            :open="hierarchyOpen === 'location'"
            @toggle="hierarchyOpen = hierarchyOpen ? '' : 'location'"
            @close="hierarchyOpen = ''"
            ><MapPin :size="15"
          /></HierarchyFilter>
          <TagFilter
            v-model="filters.countries"
            v-model:open="settings.countriesOpen"
            label="国家"
            :options="countries"
            ><Flag :size="15"
          /></TagFilter>
          <TagFilter
            v-model="filters.organizations"
            v-model:open="settings.organizationsOpen"
            label="组织"
            :options="organizations"
            ><Building2 :size="15"
          /></TagFilter>
          <TagFilter
            v-model="filters.characters"
            v-model:open="settings.charactersOpen"
            label="角色"
            :options="characters"
            ><Users :size="15"
          /></TagFilter>
        </div>
      </aside>
      <main class="main-area">
        <section class="timeline-panel">
          <TimelineView
            v-if="timeline"
            :key="timeline.id"
            ref="view"
            :nodes="visible"
            :settings="settings"
            :selected-id="selectedId"
            :total="timeline.nodes.length"
            @select="chooseNode"
            @clear="selectedId = ''"
            @edit="editNode"
            @delete="askDeleteNode"
          />
          <div v-else class="welcome">
            <BookOpen :size="36" />
            <h2>暂无时间轴</h2>
            <button class="primary-button" @click="openProject(true)">
              <Plus :size="16" />新建时间轴</button
            ><button class="inline-button" @click="run(importFile)">
              导入 JSON 备份
            </button>
          </div>
          <button
            v-if="timeline"
            class="add-node-button"
            aria-label="添加节点"
            title="添加节点"
            :disabled="timeline.nodes.length >= MAX_NODES || loading"
            @click="addNode"
          >
            <Plus :size="24" />
          </button>
        </section>
        <footer class="status-bar">
          <span
            ><Clock3 :size="13" />{{ (timeline?.nodes.length || 0).toLocaleString() }} /
            10,000 个节点</span
          ><span class="filtered-count"
            >筛选后 {{ visible.length.toLocaleString() }} 个节点</span
          ><span class="spacer" /><span
            :class="{ 'error-text': saveState.includes('失败') }"
            ><CheckCheck :size="14" />{{ saveState }}</span
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
    <div v-if="toast" class="toast-message" role="status">
      <CheckCheck :size="16" />{{ toast }}
    </div>
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
        :class="{
          'wide-modal': modal === 'library',
          'node-modal': modal === 'node',
        }"
        role="dialog"
        aria-modal="true"
        :aria-label="modalTitle"
      >
        <div class="modal-heading">
          <h2>{{ modalTitle }}</h2>
          <button
            class="icon-button"
            aria-label="关闭对话框"
            :disabled="mutationBusy"
            @click="closeModal"
          >
            <X :size="18" />
          </button>
        </div>
        <NodeForm
          v-if="modal === 'node' && draft"
          :key="editorKey"
          :node="draft"
          :is-new="isNew"
          :known-characters="characters"
          :known-countries="countries"
          :known-organizations="organizations"
          @change="changeDraft"
          @done="(node) => run(() => exclusive(() => finishNode(node)))"
          @cancel="cancelEdit"
        />
        <template v-else-if="modal === 'settings'">
          <div class="theme-grid">
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
            <strong>显示的时间层级</strong>
            <p>仅改变卡片显示，完整时间始终参与排序。</p>
            <div class="time-options">
              <label v-for="(label, i) in timeLabels" :key="label" class="check-label"
                ><input type="checkbox" v-model="settings.visibleTime[i]" />{{
                  label
                }}</label
              >
            </div>
          </div>
          <TimeOrderEditor
            v-if="timeline"
            :model-value="timeline.timeOrder"
            @update:model-value="(value) => modify({ ...timeline!, timeOrder: value })"
          />
        </template>
        <template v-else-if="modal === 'library'">
          <div class="book-tools">
            <div class="search-box">
              <Search :size="15" /><input
                v-model="libraryQuery"
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
                    if (modal !== 'node') modal = ''
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
                :aria-label="'删除时间轴 ' + item.title"
                @click="askDeleteTimeline(item)"
              >
                <Trash2 :size="16" />
              </button>
            </div>
            <p v-if="!filteredCatalog.length" class="empty-list">
              {{ catalog.length ? '没有找到匹配的时间轴' : '暂无时间轴' }}
            </p>
          </div>
        </template>
        <form
          v-else-if="modal === 'project'"
          @submit.prevent="run(() => exclusive(finishProject))"
        >
          <label
            >时间轴名称<input v-model="projectTitle" aria-label="时间轴名称" required
          /></label>
          <label
            ><span>简介 <small>（选填）</small></span
            ><textarea v-model="projectDescription" aria-label="时间轴简介" rows="3" />
          </label>
          <div class="modal-actions">
            <button class="secondary-button" type="button" @click="closeModal">
              取消</button
            ><button
              class="primary-button"
              :disabled="!projectTitle.trim() || mutationBusy"
            >
              {{ projectNew ? '创建时间轴' : '完成' }}
            </button>
          </div>
        </form>
        <template v-else-if="modal === 'export'">
          <button
            class="export-option"
            :disabled="!timeline || mutationBusy"
            @click="run(() => exclusive(() => exportJson(false)))"
          >
            <BookOpen :size="24" /><span
              ><strong>当前时间轴</strong
              ><small
                >{{ timeline?.title }} ·
                {{ timeline?.nodes.length }} 个节点，含全部字段与格式</small
              ></span
            ><Upload :size="16" />
          </button>
          <button
            class="export-option"
            :disabled="mutationBusy"
            @click="run(() => exclusive(() => exportJson(true)))"
          >
            <FolderOpen :size="24" /><span
              ><strong>完整时间轴库</strong
              ><small>{{ catalog.length }} 条时间轴 · 全部作品</small></span
            ><Upload :size="16" />
          </button>
          <p class="form-note">JSON 备份包含完整事件，不受当前筛选或折叠状态影响。</p>
        </template>
        <template v-else-if="modal === 'import'">
          <p class="dialog-copy">
            已检查 {{ imported.length }} 条时间轴、{{
              imported.reduce((n, t) => n + t.nodes.length, 0).toLocaleString()
            }}
            个节点。将作为新时间轴加入，已有作品保留。
          </p>
          <div class="import-list">
            <p v-for="(t, i) in imported" :key="i">
              {{ t.title }}
              <span class="muted">{{ t.nodes.length }} 个节点</span>
            </p>
          </div>
          <div class="modal-actions">
            <button class="secondary-button" @click="closeModal">取消</button
            ><button
              class="primary-button"
              :disabled="mutationBusy"
              @click="run(() => exclusive(commitImport))"
            >
              确认导入
            </button>
          </div>
        </template>
        <template v-else-if="modal === 'confirm'"
          ><p class="dialog-copy">{{ confirmCopy }}</p>
          <div class="modal-actions">
            <button class="secondary-button" @click="closeModal">取消</button
            ><button
              class="primary-button destructive"
              :disabled="mutationBusy"
              @click="run(() => exclusive(confirm))"
            >
              确认删除
            </button>
          </div></template
        >
        <template v-else-if="modal === 'help'">
          <div class="help-content">
            <p>
              <strong>时间轴与节点</strong
              >点击左上角时间轴名称切换或新建时间轴，右下角加号添加节点。最多 1000
              条时间轴，每条最多 10000 个节点。只有事件必填。
            </p>
            <p>
              <strong>阅读与编辑</strong>时间轴上下滚动。超过 100
              字的事件点击“显示全文”在原卡片展开；屏蔽文字悬停或键盘聚焦可见。节点旁的编辑、删除按钮在悬停或键盘聚焦时出现；删除节点立即生效。点击空白处取消选择。
            </p>
            <p>
              <strong>时间排序</strong
              >时代、朝代、历法在“显示设置”中长按条目上下拖动编排，日期、时刻按数字与字母自然排序。共同时间部分相同时，模糊时间在前，例如
              1999 年先于 1999 年 5
              月；全部时间未知的节点仍在最后。时间段按开始时间排列，同一起点的时间段排在时间点前。数字日期统一显示为年月日。
            </p>
            <p>
              <strong>筛选</strong
              >地点在二级侧栏选择展示层级与各级选项，缺失上级的条目按下级内容单独列出。国家、组织、角色均可多选；勾选“全部”全选，取消则全不选。时间范围包含边界及部分相交的时间段，可只填一端。不同筛选类别同时生效。
            </p>
            <p>
              <strong>国家、组织与角色</strong
              >输入时以空格分隔，按字母／拼音排列，已有清单可折叠。
            </p>
            <p>
              <strong>自动保存与备份</strong>修改后约 0.65 秒自动保存，Ctrl+S
              立即保存。未完成节点在重启后恢复。JSON
              可备份当前时间轴或完整库，导入时作为新时间轴加入。数据位于
              %APPDATA%\Xushi\workspace，更新和卸载保留数据。
            </p>
            <p class="form-note">屏蔽是阅读效果，JSON 内仍含原文，不是加密。</p>
          </div>
          <div class="about-line">
            <span>序时 {{ version }}</span
            ><span>© 2026 Symplatt · 版权所有</span>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<script lang="ts">
const titles: Record<string, string> = {
  settings: '显示设置',
  library: '时间轴库',
  project: '时间轴信息',
  export: '导出 JSON',
  import: '导入预览',
  help: '认识序时',
}
</script>
