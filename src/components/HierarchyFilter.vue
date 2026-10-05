<script setup lang="ts">
import FilterPanel from './FilterPanel.vue'
import { computed } from 'vue'
import { ChevronDown, X, CheckCheck, Minus } from 'lucide-vue-next'
import {
  type HierarchyFilter,
  type Five,
  hierarchyOption,
  emptyHierarchy,
  natural,
} from '../model'
const props = defineProps<{ label: string; paths: Five[]; open: boolean }>()
const emit = defineEmits<{ toggle: []; close: [] }>()
const filter = defineModel<HierarchyFilter>({ required: true })
const showEmpty = defineModel<boolean>('showEmpty', { required: true })
const options = computed(() =>
  Array.from({ length: 5 }, (_, i) => {
    const unique = new Map<string, { key: string; label: string }>()
    for (const path of props.paths.filter((path) => path.some(Boolean))) {
      const option = hierarchyOption(path, i)
      unique.set(option.key, option)
    }
    return [...unique.values()].sort((a, b) => natural.compare(a.label, b.label))
  }),
)
function reset() { filter.value = emptyHierarchy(); showEmpty.value = true }
const active = computed(
  () =>
    !!filter.value.legacy?.values.length ||
    !!filter.value.legacy?.levels.length ||
    !showEmpty.value ||
    filter.value.selections.slice(0, filter.value.depth).some((v) => v !== null),
)
function depth(value: number) {
  filter.value = {
    depth: value,
    selections: filter.value.selections.map((v, i) => (i < value ? v : null)),
  }
}
function select(level: number, key: string) {
  const selections = filter.value.selections.map((v) => v && [...v])
  const values = selections[level] ?? options.value[level].map((option) => option.key)
  const next = values.includes(key)
    ? values.filter((value) => value !== key)
    : [...values, key]
  selections[level] = options.value[level].every((option) => next.includes(option.key))
    ? null
    : next
  filter.value = { depth: filter.value.depth, selections }
}
function all(level: number) {
  const selections = filter.value.selections.map((v) => v && [...v])
  selections[level] = selections[level] === null ? [] : null
  filter.value = { depth: filter.value.depth, selections }
}
</script>
<template>
  <section class="filter-section hierarchy-trigger">
    <button
      class="section-heading collapse-toggle"
      :aria-expanded="open"
      :aria-label="`${label}筛选`"
      @click="emit('toggle')"
    >
      <slot /><strong>{{ label }}</strong
      ><span v-if="active" class="count">已筛选</span><ChevronDown :size="14" :class="{ rotated: open }" />
    </button>
    <FilterPanel v-if="open" :label="label" @close="emit('close')" @clear="reset">
      <div class="hierarchy-toolbar">
        <span>层级精确度</span>
        <div class="depth-options">
          <button
            v-for="level in 5"
            :key="level"
            :aria-pressed="filter.depth === level"
            :class="{ active: filter.depth === level }"
            @click="depth(level)"
          >
            {{ level }}级
          </button>
        </div>

      </div>
      <p v-if="filter.legacy" class="form-note">
        已保留旧版筛选；修改层级或选项后使用当前筛选方式。
      </p>
      <div class="hierarchy-columns">
        <section v-for="level in filter.depth" :key="level" class="hierarchy-column">
          <h3>{{ level }} 级</h3>
          <button
            class="select-all-button"
            role="checkbox"
            :aria-label="`全部${level}级${label}`"
            :aria-checked="
              filter.selections[level - 1] === null
                ? true
                : filter.selections[level - 1]!.length
                  ? 'mixed'
                  : false
            "
            @click="all(level - 1)"
          >
            <span
              class="all-checkbox"
              :class="{ checked: filter.selections[level - 1] === null }"
              > <CheckCheck v-if="filter.selections[level - 1] === null" :size="13" /><Minus v-else-if="filter.selections[level - 1]!.length" :size="13" /></span>全部
          </button>
          <div class="hierarchy-values">
            <label
              v-for="option in options[level - 1]"
              :key="option.key"
              class="check-label"
              ><input
                type="checkbox"
                :checked="
                  filter.selections[level - 1] === null ||
                  filter.selections[level - 1]!.includes(option.key)
                "
                :aria-label="`${label}${level}级 ${option.label}`"
                @change="select(level - 1, option.key)"
              /><span>{{ option.label }}</span></label
            >
            <p v-if="!options[level - 1].length" class="muted">暂无选项</p>
          </div>
        </section>
      </div>
      <footer>
        <label class="check-label"
          ><input v-model="showEmpty" type="checkbox" />显示无{{ label }}事件</label
        ><span class="form-note">未填上级的条目按下级内容分别列出，可单独筛选。</span>
      </footer>
    </FilterPanel>
  </section>
</template>
