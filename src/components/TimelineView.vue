<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  Clock3,
  ArrowUpToLine,
  ArrowDownToLine,
  MapPin,
  Users,
  Building2,
  ChevronUp,
  ChevronDown,
  Pencil,
  Trash2,
  ChevronsUp,
  ChevronsDown,
} from 'lucide-vue-next'
import {
  timeDisplay,
  plainText,
  PREVIEW_LIMIT,
  type TimelineNode,
  type Settings,
} from '../model'
import RichText from './RichText.vue'
import TextMatch from './TextMatch.vue'
const props = defineProps<{
  nodes: TimelineNode[]
  usedTimeLevels: boolean[]
  query: string
  settings: Settings
  selectedId: string
  total: number
}>()
const emit = defineEmits<{
  select: [node: TimelineNode]
  clear: []
  edit: [node: TimelineNode]
  delete: [node: TimelineNode]
}>()
const scroll = ref<HTMLElement>(),
  top = ref(0),
  height = ref(800),
  measurement = ref(0)
const expanded = ref(new Set<string>())
watch(
  () => props.query,
  (query) => {
    const q = query.trim().toLocaleLowerCase()
    if (q)
      for (const node of props.nodes)
        if (
          plainText(node.event).toLocaleLowerCase().includes(q) &&
          !Array.from(plainText(node.event))
            .slice(0, PREVIEW_LIMIT)
            .join('')
            .toLocaleLowerCase()
            .includes(q)
        )
          expanded.value.add(node.id)
  },
  { immediate: true },
)
const sizes = new Map<string, number>(),
  rows = new Map<string, HTMLElement>()
let observer: ResizeObserver,
  containerObserver: ResizeObserver,
  width = 0,
  atEnd = false
// Measured offsets keep short cards compact and allow expansion without imposing
// an event height limit. Only nearby rows are mounted, even with 10000 nodes.
const offsets = computed(() => {
  measurement.value
  const result = [0]
  for (const node of props.nodes)
    result.push(result[result.length - 1] + (sizes.get(node.id) ?? 156))
  return result
})
function indexAt(y: number) {
  let low = 0,
    high = props.nodes.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (offsets.value[mid + 1] <= y) low = mid + 1
    else high = mid
  }
  return low
}
const start = computed(() => Math.max(0, indexAt(top.value) - 3))
const visible = computed(() =>
  props.nodes.slice(
    start.value,
    Math.min(props.nodes.length, indexAt(top.value + height.value) + 4),
  ),
)
function rowRef(id: string, element: unknown) {
  const previous = rows.get(id)
  if (previous && previous !== element) {
    observer?.unobserve(previous)
    rows.delete(id)
  }
  if (element instanceof HTMLElement) {
    rows.set(id, element)
    observer?.observe(element)
  }
}
onMounted(() => {
  observer = new ResizeObserver((entries) => {
    const anchor = indexAt(top.value),
      oldOffset = offsets.value[anchor] || 0
    let changed = false
    for (const entry of entries) {
      const el = entry.target as HTMLElement,
        id = el.dataset.nodeId!
      const size =
        entry.borderBoxSize[0]?.blockSize ?? el.getBoundingClientRect().height
      if (Math.abs((sizes.get(id) ?? 156) - size) > 0.5) {
        sizes.set(id, size)
        changed = true
      }
    }
    if (!changed) return
    measurement.value++
    const delta = (offsets.value[anchor] || 0) - oldOffset
    if (scroll.value && delta) {
      scroll.value.scrollTop += delta
      top.value = scroll.value.scrollTop
    }
    if (atEnd)
      nextTick(() => scroll.value?.scrollTo({ top: offsets.value.at(-1) || 0 }))
  })
  rows.forEach((row) => observer.observe(row))
  containerObserver = new ResizeObserver(() => {
    height.value = scroll.value?.clientHeight || 800
    const nextWidth = scroll.value?.clientWidth || 0
    if (nextWidth !== width) {
      width = nextWidth
      sizes.clear()
      measurement.value++
      rows.forEach((row) => {
        observer.unobserve(row)
        observer.observe(row)
      })
    }
  })
  containerObserver.observe(scroll.value!)
})
onUnmounted(() => {
  observer?.disconnect()
  containerObserver?.disconnect()
})
watch(
  () => props.nodes,
  () => {
    atEnd = false
    nextTick(() => {
      if (scroll.value) top.value = scroll.value.scrollTop
    })
  },
)
function jump(end: boolean) {
  atEnd = end
  scroll.value?.scrollTo({
    top: end ? offsets.value.at(-1) || 0 : 0,
    behavior: 'auto',
  })
}
function reveal(id: string) {
  atEnd = false
  const i = props.nodes.findIndex((n) => n.id === id)
  if (i >= 0) scroll.value?.scrollTo({ top: offsets.value[i], behavior: 'auto' })
}
function toggle(id: string) {
  expanded.value.has(id) ? expanded.value.delete(id) : expanded.value.add(id)
}
function expandAll(open: boolean) {
  // Apply to every filtered node, including rows outside the virtual viewport.
  for (const node of props.nodes)
    open ? expanded.value.add(node.id) : expanded.value.delete(node.id)
  atEnd = false
  sizes.clear()
  measurement.value++
  jump(false)
  nextTick(() =>
    rows.forEach((row) => {
      observer?.unobserve(row)
      observer?.observe(row)
    }),
  )
}
defineExpose({ reveal })
</script>
<template>
  <div
    class="timeline-viewport"
    ref="scroll"
    @click="emit('clear')"
    @wheel.passive="atEnd = false"
    @touchstart.passive="atEnd = false"
    @scroll="top = ($event.target as HTMLElement).scrollTop"
    tabindex="0"
    aria-label="时间轴，上下滚动"
  >
    <div v-if="!nodes.length" class="canvas-empty">
      <Clock3 :size="36" />
      <h2>{{ total ? '没有符合筛选条件的节点' : '暂无节点' }}</h2>
      <p>{{ total ? '调整或清除左侧筛选。' : '点击右下角的加号添加节点。' }}</p>
    </div>
    <div v-else class="virtual-track" :style="{ height: offsets.at(-1) + 'px' }">
      <article
        v-for="(node, i) in visible"
        :key="node.id"
        :ref="(element) => rowRef(node.id, element)"
        :data-node-id="node.id"
        class="timeline-row"
        :style="{ transform: `translateY(${offsets[start + i]}px)` }"
      >
        <div class="time-column">
          <template
            v-for="(value, level) in timeDisplay(node.time, usedTimeLevels)"
            :key="level"
            ><div v-if="value" :class="{ 'time-major': level === 0 }">
              <TextMatch :text="value" :query="query" /></div
          ></template>
          <span v-if="node.time.every((v) => !v)" class="unknown-time">时间不确定</span>

          <template v-if="node.endTime"
            ><div class="range-separator" aria-label="至">—</div>
            <template
              v-for="(value, level) in timeDisplay(node.endTime, usedTimeLevels)"
              :key="'end-' + level"
              ><div v-if="value" :class="{ 'time-major': level === 0 }">
                <TextMatch :text="value" :query="query" /></div></template
            ><span v-if="node.endTime.every((v) => !v)" class="unknown-time"
              >结束时间不确定</span
            ></template
          >
        </div>
        <div class="axis">
          <span :class="{ selected: selectedId === node.id }" />
        </div>
        <div
          class="event-card"
          :class="{ selected: selectedId === node.id }"
          role="group"
          tabindex="0"
          :aria-label="`第 ${start + i + 1} 个事件`"
          @click.stop="emit('select', node)"
          @dblclick.stop="toggle(node.id)"
          @keydown.enter.self.prevent="emit('select', node)"
          @keydown.space.self.prevent="emit('select', node)"
        >
          <div v-if="node.countries.length" class="event-card-head">
            <span
              v-for="(country, index) in node.countries"
              :key="country"
              class="country-entry"
              ><span class="country-tag"
                ><TextMatch :text="country" :query="query" /></span
              ><span v-if="index < node.countries.length - 1" class="tag-comma"
                >，</span
              ></span
            >
          </div>
          <h3 v-if="node.title" class="event-title">
            <TextMatch :text="node.title" :query="query" />
          </h3>
          <div
            class="event-excerpt"
            @copy.prevent
            @cut.prevent
            @dragstart.prevent
            @selectstart.prevent
          >
            <RichText
              :runs="node.event"
              :query="query"
              :limit="expanded.has(node.id) ? undefined : PREVIEW_LIMIT"
            />
          </div>
          <button
            v-if="Array.from(plainText(node.event)).length > PREVIEW_LIMIT"
            class="expand-event inline-button"
            :aria-expanded="expanded.has(node.id)"
            @click.stop="toggle(node.id)"
          >
            {{ expanded.has(node.id) ? '收起全文' : '显示全文'
            }}<ChevronUp v-if="expanded.has(node.id)" :size="13" /><ChevronDown
              v-else
              :size="13"
            />
          </button>
          <div
            v-if="
              node.location.some(Boolean) ||
              node.organizations.length ||
              node.characters.length
            "
            class="event-meta"
          >
            <span v-if="node.location.some(Boolean)" title="地点"
              ><MapPin :size="14" /><span class="location-path"
                ><TextMatch
                  :text="node.location.filter(Boolean).join('-')"
                  :query="query" /></span
            ></span>
            <span v-if="node.organizations.length" title="组织"
              ><Building2 :size="14" /><span class="organization-names"
                ><TextMatch
                  :text="node.organizations.join('，')"
                  :query="query" /></span
            ></span>
            <span v-if="node.characters.length" title="人物"
              ><Users :size="14" /><span
                ><TextMatch :text="node.characters.join('，')" :query="query" /></span
            ></span>
          </div>
        </div>
        <div class="node-actions">
          <button
            class="icon-button"
            title="编辑节点"
            :aria-label="`编辑第 ${start + i + 1} 个节点`"
            @click.stop="emit('edit', node)"
          >
            <Pencil :size="16" /></button
          ><button
            class="icon-button danger"
            title="删除节点"
            :aria-label="`删除第 ${start + i + 1} 个节点`"
            @click.stop="emit('delete', node)"
          >
            <Trash2 :size="16" />
          </button>
        </div>
      </article>
    </div>
  </div>
  <div v-if="nodes.length" class="scroll-controls">
    <button
      class="icon-button"
      title="全部展开"
      aria-label="全部展开"
      @click="expandAll(true)"
    >
      <ChevronsDown :size="18" />
    </button>
    <button
      class="icon-button"
      title="全部折叠"
      aria-label="全部折叠"
      @click="expandAll(false)"
    >
      <ChevronsUp :size="18" />
    </button>
    <button
      class="icon-button"
      title="回到顶部"
      aria-label="回到顶部"
      @click="jump(false)"
    >
      <ArrowUpToLine :size="18" /></button
    ><button
      class="icon-button"
      title="到达底部"
      aria-label="到达底部"
      @click="jump(true)"
    >
      <ArrowDownToLine :size="18" />
    </button>
  </div>
</template>
