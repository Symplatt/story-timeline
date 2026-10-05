<script setup lang="ts">
import FilterPanel from './FilterPanel.vue'
import { computed } from 'vue'
import { Clock3, ChevronDown } from 'lucide-vue-next'
import {
  five,
  timeLabels,
  compareTimeBounds,
  type Filters,
  type TimeOrder,
} from '../model'
const props = defineProps<{ order: TimeOrder }>()
const open = defineModel<boolean>('open', { required: true })
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
  <section class="filter-section time-filter">
    <button class="section-heading collapse-toggle" :aria-expanded="open" @click="open = !open">
      <Clock3 :size="15" /><strong>时间范围</strong><span v-if="filters.startTime?.some(Boolean) || filters.endTime?.some(Boolean)" class="count">已筛选</span><ChevronDown :size="14" :class="{ rotated: open }" />
    </button>
    <FilterPanel v-if="open" label="时间" @close="open = false" @clear="filters = { ...filters, startTime: five(), endTime: five() }">
    <div class="filter-body">
      <fieldset v-for="key in ['startTime', 'endTime'] as const" :key="key">
        <legend>{{ key === 'startTime' ? '开始时间' : '结束时间' }}</legend>
        <label v-for="(label, index) in timeLabels" :key="label"
          >{{ label
          }}<select v-if="index < 3" :value="filters[key]?.[index] || ''" :aria-label="`筛选${key === 'startTime' ? '开始' : '结束'}${label}`" @change="update(key, index, ($event.target as HTMLSelectElement).value)">
            <option value="">不限</option><option v-for="value in order[index]" :key="value" :value="value">{{ value }}</option>
            <option v-if="filters[key]?.[index] && !order[index].includes(filters[key]![index])" :value="filters[key]![index]">{{ filters[key]![index] }}</option>
          </select><input v-else
            :value="filters[key]?.[index] || ''"

            :aria-label="`筛选${key === 'startTime' ? '开始' : '结束'}${label}`"
            @input="update(key, index, ($event.target as HTMLInputElement).value)"
        /></label>
      </fieldset>
      <p v-if="unknown" class="required" role="status">
        时代、朝代或历法尚未编入当前时间轴顺序。
      </p>
      <p v-if="!unknown && reversed" class="required" role="status">
        开始时间晚于结束时间。
      </p>
      <p class="form-note">可只填写一端；包含边界及部分相交的事件。</p>
    </div>
    </FilterPanel>
  </section>
</template>
