<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { GripVertical } from 'lucide-vue-next'
import { timeLabels, type TimeOrder } from '../model'
const order = defineModel<TimeOrder>({ required: true })
const drag = ref<{
  level: number
  from: number
  to: number
  active: boolean
}>()
let timer: ReturnType<typeof setTimeout> | undefined
let element: HTMLElement | undefined,
  pointer = -1,
  startY = 0,
  lastY = 0,
  frame = 0
function reorder(level: number, from: number, to: number) {
  if (from === to || to < 0 || to >= order.value[level].length) return
  const next = order.value.map((values) => [...values]) as TimeOrder
  next[level].splice(to, 0, next[level].splice(from, 1)[0])
  order.value = next
}
function scrollFrame() {
  const list = element?.parentElement
  if (!drag.value?.active || !list) return
  const box = list.getBoundingClientRect()
  if (lastY < box.top + 30) list.scrollTop -= 7
  if (lastY > box.bottom - 30) list.scrollTop += 7
  const rows = [...list.children] as HTMLElement[]
  drag.value.to = Math.max(
    0,
    rows.findIndex((row) => lastY < row.getBoundingClientRect().bottom),
  )
  if (lastY >= rows[rows.length - 1].getBoundingClientRect().bottom)
    drag.value.to = rows.length - 1
  frame = requestAnimationFrame(scrollFrame)
}
function start(event: PointerEvent, level: number, index: number) {
  if (event.button !== 0) return
  finish(false)
  element = event.currentTarget as HTMLElement
  pointer = event.pointerId
  startY = lastY = event.clientY
  drag.value = { level, from: index, to: index, active: false }
  element.setPointerCapture(pointer)
  timer = setTimeout(() => {
    if (drag.value) {
      drag.value.active = true
      frame = requestAnimationFrame(scrollFrame)
    }
  }, 350)
}
function move(event: PointerEvent) {
  lastY = event.clientY
  if (!drag.value) return
  if (!drag.value.active && Math.abs(lastY - startY) > 7) finish(false)
  else if (drag.value.active) event.preventDefault()
}
function finish(commit: boolean) {
  clearTimeout(timer)
  cancelAnimationFrame(frame)
  if (commit && drag.value?.active)
    reorder(drag.value.level, drag.value.from, drag.value.to)
  if (element?.hasPointerCapture(pointer)) element.releasePointerCapture(pointer)
  drag.value = undefined
  element = undefined
}
onUnmounted(() => finish(false))
</script>
<template>
  <div class="setting-row time-order-settings">
    <strong>当前时间轴的时间顺序</strong>
    <p>长按条目后上下拖动；键盘可按 Alt + 上下方向键。新增名称加入末尾。</p>
    <details v-for="(values, level) in order" :key="level" class="order-section">
      <summary>
        {{ timeLabels[level] }} <span class="count">{{ values.length }}</span>
      </summary>
      <ol class="time-order-list">
        <li
          v-for="(name, index) in values"
          :key="name"
          tabindex="0"
          :aria-label="`${timeLabels[level]} ${name}`"
          :class="{
            dragging: drag?.active && drag.level === level && drag.from === index,
            'drop-target': drag?.active && drag.level === level && drag.to === index,
          }"
          @pointerdown="start($event, level, index)"
          @pointermove="move"
          @pointerup="finish(true)"
          @pointercancel="finish(false)"
          @lostpointercapture="finish(false)"
          @keydown.esc.stop="finish(false)"
          @keydown.alt.up.prevent="reorder(level, index, index - 1)"
          @keydown.alt.down.prevent="reorder(level, index, index + 1)"
        >
          <span class="order-number">{{ index + 1 }}</span
          ><span class="order-name">{{ name }}</span
          ><GripVertical :size="16" />
        </li>
      </ol>
      <p v-if="!values.length" class="form-note">
        在节点中填写{{ timeLabels[level] }}后，可在这里编排。
      </p>
    </details>
  </div>
</template>
