<script setup lang="ts">
import { computed } from 'vue'
import { Clock3 } from 'lucide-vue-next'
import {
  five,
  timeLabels,
  compareTimeBounds,
  type Filters,
  type TimeOrder,
} from '../model'
const props = defineProps<{ order: TimeOrder }>()
const filters = defineModel<Filters>({ required: true })
function update(key: 'startTime' | 'endTime', index: number, value: string) {
  const time = [...(filters.value[key] || five())] as ReturnType<typeof five>
  time[index] = value.trim()
  filters.value = { ...filters.value, [key]: time }
}
const unknown = computed(() =>
  [filters.value.startTime, filters.value.endTime].some((bound) =>
    bound?.slice(0, 3).some((value, i) => value && !props.order[i].includes(value)),
  ),
)
const reversed = computed(
  () =>
    filters.value.startTime?.some(Boolean) &&
    filters.value.endTime?.some(Boolean) &&
    compareTimeBounds(filters.value.startTime, filters.value.endTime, props.order) > 0,
)
</script>
<template>
  <details class="filter-section time-filter">
    <summary>
      <Clock3 :size="15" /><strong>时间范围</strong
      ><span
        v-if="filters.startTime?.some(Boolean) || filters.endTime?.some(Boolean)"
        class="count"
        >已筛选</span
      >
    </summary>
    <div class="filter-body">
      <fieldset v-for="key in ['startTime', 'endTime'] as const" :key="key">
        <legend>{{ key === 'startTime' ? '开始时间' : '结束时间' }}</legend>
        <label v-for="(label, index) in timeLabels" :key="label"
          >{{ label
          }}<input
            :value="filters[key]?.[index] || ''"
            :list="index < 3 ? `filter-time-${index}` : undefined"
            :aria-label="`筛选${key === 'startTime' ? '开始' : '结束'}${label}`"
            @input="update(key, index, ($event.target as HTMLInputElement).value)"
        /></label>
      </fieldset>
      <datalist
        v-for="(values, index) in order"
        :id="`filter-time-${index}`"
        :key="index"
      >
        <option v-for="value in values" :key="value" :value="value" />
      </datalist>
      <p v-if="unknown" class="required" role="status">
        时代、朝代或历法尚未编入当前时间轴顺序。
      </p>
      <p v-if="!unknown && reversed" class="required" role="status">
        开始时间晚于结束时间。
      </p>
      <p class="form-note">可只填写一端；包含边界及部分相交的事件。</p>
    </div>
  </details>
</template>
