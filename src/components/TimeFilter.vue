<script setup lang="ts">
import FilterPanel from './FilterPanel.vue'
import { computed } from 'vue'
import { Clock3, ChevronDown } from 'lucide-vue-next'
import {
  five,
  MISSING_TIME,
  timeParents,
  updateTimeBound,
  timeResolver,
  displayClock,
  type TimelineNode,
  timeLabels,
  compareTimeBounds,
  type Filters,
  type TimeOrder,
} from '../model'
const props = defineProps<{ order: TimeOrder; nodes: TimelineNode[] }>()
const open = defineModel<boolean>('open', { required: true })
const filters = defineModel<Filters>({ required: true })
const parents = computed(() => timeParents(props.nodes))
const conflicting = computed(() =>
  parents.value.some((map) => [...map.values()].some((v) => v.length > 1)),
)
const resolve = computed(() => timeResolver(props.order, props.nodes))
function update(key: 'startTime' | 'endTime', index: number, value: string) {
  const time = updateTimeBound(
    filters.value[key] || five(),
    index,
    value.trim(),
    parents.value,
  )
  filters.value = { ...filters.value, [key]: time }
}
const unknown = computed(() =>
  [filters.value.startTime, filters.value.endTime].some((bound) =>
    bound
      ?.slice(0, 3)
      .some(
        (value, i) => value && value !== MISSING_TIME && !props.order[i].includes(value),
      ),
  ),
)
const reversed = computed(
  () =>
    filters.value.startTime?.some(Boolean) &&
    filters.value.endTime?.some(Boolean) &&
    compareTimeBounds(
      filters.value.startTime,
      filters.value.endTime,
      props.order,
      resolve.value,
    ) > 0,
)
</script>
<template>
  <section class="filter-section time-filter">
    <button
      class="section-heading collapse-toggle"
      :aria-expanded="open"
      @click="open = !open"
    >
      <Clock3 :size="15" /><strong>时间范围</strong
      ><span
        v-if="filters.startTime?.some(Boolean) || filters.endTime?.some(Boolean)"
        class="count"
        >已筛选</span
      ><ChevronDown :size="14" :class="{ rotated: open }" />
    </button>
    <FilterPanel
      v-if="open"
      label="时间"
      @close="open = false"
      @clear="filters = { ...filters, startTime: five(), endTime: five() }"
    >
      <div class="filter-body">
        <fieldset v-for="key in ['startTime', 'endTime'] as const" :key="key">
          <legend>{{ key === 'startTime' ? '开始时间' : '结束时间' }}</legend>
          <label v-for="(label, index) in timeLabels" :key="label"
            >{{ label
            }}<select
              v-if="index < 3"
              :value="filters[key]?.[index] || ''"
              :aria-label="`筛选${key === 'startTime' ? '开始' : '结束'}${label}`"
              @change="update(key, index, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">不限</option>
              <option :value="MISSING_TIME">未填写</option>
              <option
                v-for="value in order[index]"
                :key="value"
                :value="value"
                :disabled="(parents[index].get(value)?.length || 0) > 1"
              >
                {{ value
                }}{{ (parents[index].get(value)?.length || 0) > 1 ? '（上级冲突）' : '' }}
              </option>
              <option
                v-if="
                  filters[key]?.[index] &&
                  filters[key]![index] !== MISSING_TIME &&
                  !order[index].includes(filters[key]![index])
                "
                :value="filters[key]![index]"
              >
                {{ filters[key]![index] }}
              </option></select
            ><input
              v-else
              :value="filters[key]?.[index] || ''"
              :aria-label="`筛选${key === 'startTime' ? '开始' : '结束'}${label}`"
              @input="update(key, index, ($event.target as HTMLInputElement).value)"
              @blur="
                index === 4 &&
                update(
                  key,
                  index,
                  displayClock(($event.target as HTMLInputElement).value),
                )
              "
          /></label>
        </fieldset>
        <p
          v-if="[filters.startTime, filters.endTime].some((t) => t?.[4] && !t[3])"
          class="required"
          role="status"
        >
          填写时刻前，请先填写日期。
        </p>
        <p v-if="conflicting" class="required" role="status">
          存在同名时间层级对应多个上级的旧数据，请编辑这些节点并区分名称。
        </p>
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
