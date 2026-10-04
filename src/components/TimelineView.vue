<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Clock3, MapPin, Users, ChevronUp, ChevronDown } from 'lucide-vue-next'
import { timeLabels, displayDate, type TimelineNode, type Settings } from '../model'
import RichText from './RichText.vue'
const props = defineProps<{
  nodes: TimelineNode[]
  settings: Settings
  selectedId: string
  total: number
}>()
const emit = defineEmits<{ select: [node: TimelineNode] }>()
const scroll = ref<HTMLElement>(),
  top = ref(0),
  height = ref(800)
const rowHeight = 228
const start = computed(() => Math.max(0, Math.floor(top.value / rowHeight) - 3))
const visible = computed(() =>
  props.nodes.slice(start.value, start.value + Math.ceil(height.value / rowHeight) + 7),
)
let observer: ResizeObserver
onMounted(() => {
  observer = new ResizeObserver(() => (height.value = scroll.value?.clientHeight || 800))
  observer.observe(scroll.value!)
})
onUnmounted(() => observer?.disconnect())
watch(
  () => props.nodes,
  () => {
    if (scroll.value && top.value > props.nodes.length * rowHeight) {
      scroll.value.scrollTop = 0
      top.value = 0
    }
  },
)
function jump(end: boolean) {
  scroll.value?.scrollTo({ top: end ? props.nodes.length * rowHeight : 0, behavior: 'auto' })
}
function reveal(id: string) {
  const i = props.nodes.findIndex((n) => n.id === id)
  if (i >= 0) scroll.value?.scrollTo({ top: i * rowHeight, behavior: 'auto' })
}
defineExpose({ reveal })
</script>
<template>
  <div
    class="timeline-viewport"
    ref="scroll"
    @scroll="top = ($event.target as HTMLElement).scrollTop"
    tabindex="0"
    aria-label="时间轴，上下滚动"
  >
    <div v-if="!nodes.length" class="canvas-empty">
      <Clock3 :size="42" />
      <h2>{{ total ? '没有符合筛选条件的事件' : '让故事，从一个时刻开始' }}</h2>
      <p>
        {{
          total
            ? '调整左侧筛选，或清除筛选查看全部节点。'
            : '点击“添加节点”，写下时间、人物与发生的事。'
        }}
      </p>
    </div>
    <div v-else class="virtual-track" :style="{ height: nodes.length * rowHeight + 'px' }">
      <article
        v-for="(node, i) in visible"
        :key="node.id"
        class="timeline-row"
        :style="{ transform: `translateY(${(start + i) * rowHeight}px)` }"
      >
        <div class="time-column">
          <template v-for="(value, level) in node.time" :key="level"
            ><div
              v-if="value && settings.visibleTime[level]"
              :class="{ 'time-major': level === 0 }"
            >
              <small>{{ timeLabels[level] }}</small
              ><span>{{ level === 3 ? displayDate(value, settings.dateFormat) : value }}</span>
            </div></template
          ><span v-if="node.time.every((v) => !v)" class="unknown-time">时间不确定</span
          ><span
            v-else-if="!node.time.some((v, j) => v && settings.visibleTime[j])"
            class="unknown-time"
            >时间层级已隐藏</span
          >
        </div>
        <div class="axis"><span :class="{ selected: selectedId === node.id }" /></div>
        <button
          class="event-card"
          :class="{ selected: selectedId === node.id }"
          @click="emit('select', node)"
          :aria-label="`查看第 ${start + i + 1} 个事件`"
        >
          <div class="event-card-head">
            <span>事件 {{ String(start + i + 1).padStart(2, '0') }}</span
            ><span v-if="node.country" class="country-tag">{{ node.country }}</span
            ><small>点击查看全文</small>
          </div>
          <div class="event-excerpt"><RichText :runs="node.event" :limit="100" /></div>
          <div class="event-meta">
            <span v-if="node.location.some(Boolean)"
              ><MapPin :size="12" />{{ node.location.filter(Boolean).join(' / ') }}</span
            ><span v-if="node.characters.length"
              ><Users :size="12" />{{ node.characters.join(' · ') }}</span
            >
          </div>
        </button>
      </article>
    </div>
  </div>
  <div v-if="nodes.length" class="scroll-controls">
    <button class="icon-button" title="回到顶部" aria-label="回到顶部" @click="jump(false)">
      <ChevronUp :size="18" /></button
    ><button class="icon-button" title="到达底部" aria-label="到达底部" @click="jump(true)">
      <ChevronDown :size="18" />
    </button>
  </div>
</template>
