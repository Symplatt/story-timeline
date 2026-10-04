<script setup lang="ts">
import { ArrowUp, ArrowDown } from 'lucide-vue-next'
import { timeLabels, type TimeOrder } from '../model'
const order = defineModel<TimeOrder>({ required: true })
function move(level: number, index: number, delta: number) {
  const next = order.value.map((values) => [...values]) as TimeOrder
  const values = next[level],
    target = index + delta
  if (target < 0 || target >= values.length) return
  ;[values[index], values[target]] = [values[target], values[index]]
  order.value = next
}
</script>
<template>
  <div class="setting-row time-order-settings">
    <strong>当前时间轴的时间顺序</strong>
    <p>从上到下依次排列，新增名称会加入列表末尾。</p>
    <details v-for="(values, level) in order" :key="level" class="order-section">
      <summary>
        {{ timeLabels[level] }} <span class="count">{{ values.length }}</span>
      </summary>
      <ol class="time-order-list">
        <li v-for="(name, index) in values" :key="name">
          <span class="order-number">{{ index + 1 }}</span
          ><span class="order-name">{{ name }}</span
          ><button
            class="icon-button"
            :disabled="index === 0"
            :aria-label="'上移' + timeLabels[level] + ' ' + name"
            @click="move(level, index, -1)"
          >
            <ArrowUp :size="15" /></button
          ><button
            class="icon-button"
            :disabled="index === values.length - 1"
            :aria-label="'下移' + timeLabels[level] + ' ' + name"
            @click="move(level, index, 1)"
          >
            <ArrowDown :size="15" />
          </button>
        </li>
      </ol>
      <p v-if="!values.length" class="form-note">
        在节点中填写{{ timeLabels[level] }}后，可在这里编排。
      </p>
    </details>
  </div>
</template>
