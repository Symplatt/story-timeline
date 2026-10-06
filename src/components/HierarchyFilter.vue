<script setup lang="ts">
import FilterPanel from './FilterPanel.vue'
import { computed } from 'vue'
import { ChevronDown, CheckCheck, Minus } from 'lucide-vue-next'
import {
  type HierarchyFilter,
  type Five,
  emptyHierarchy,
  matchesHierarchy,
  natural,
} from '../model'
const props = defineProps<{
  label: string
  paths: Five[]
  labels: Five
  open: boolean
}>()
const emit = defineEmits<{ toggle: []; close: [] }>()
const filter = defineModel<HierarchyFilter>({ required: true })
const showEmpty = defineModel<boolean>('showEmpty', { required: true })
const precision = defineModel<number>('precision', { default: 0 })
const paths = computed(() =>
  [
    ...new Map(
      props.paths.filter((p) => p.some(Boolean)).map((p) => [JSON.stringify(p), p]),
    ).values(),
  ].sort((a, b) => {
    for (let i = 0; i < 5; i++) {
      const c = !a[i] ? (b[i] ? -1 : 0) : !b[i] ? 1 : natural.compare(a[i], b[i])
      if (c) return c
    }
    return 0
  }),
)
const selected = computed(
  () =>
    new Set(
      paths.value
        .filter((p) => matchesHierarchy(p, filter.value))
        .map((p) => JSON.stringify(p)),
    ),
)
const branches = computed(() => {
  const maps = Array.from(
    { length: 5 },
    () => new Map<string, { value: string; row: number; members: string[] }>(),
  )
  paths.value.forEach((path, row) =>
    path.forEach((value, level) => {
      const prefix = JSON.stringify(path.slice(0, level + 1))
      const group = maps[level].get(prefix) || { value, row, members: [] }
      group.members.push(JSON.stringify(path))
      maps[level].set(prefix, group)
    }),
  )
  return maps
})
// Terminal events belong to the parent checkbox; they do not need an empty
// display row beside its children. Selection still keeps their full paths.
const displayPaths = computed(() => {
  const prefixes = new Set<string>()
  const last = (path: Five) => path.reduce((n, v, i) => (v ? i : n), -1)
  for (const path of paths.value)
    for (let i = 0; i < last(path); i++)
      prefixes.add(JSON.stringify(path.slice(0, i + 1)))
  return paths.value.filter(
    (path) => !prefixes.has(JSON.stringify(path.slice(0, last(path) + 1))),
  )
})
const groups = computed(() => {
  const layout = Array.from(
    { length: 5 },
    () => new Map<string, { row: number; span: number }>(),
  )
  displayPaths.value.forEach((path, row) =>
    path.forEach((_, level) => {
      const key = JSON.stringify(path.slice(0, level + 1)),
        cell = layout[level].get(key) || { row, span: 0 }
      cell.span++
      layout[level].set(key, cell)
    }),
  )
  return displayPaths.value.map((path, row) =>
    path.map((value, level) => {
      const key = JSON.stringify(path.slice(0, level + 1)),
        group = branches.value[level].get(key)!,
        cell = layout[level].get(key)!
      return {
        value,
        before: row !== cell.row,
        span: cell.span,
        members: group.members,
        missingAncestor: !value && path.slice(level + 1).some(Boolean),
      }
    }),
  )
})
const selectionState = computed(() => {
  const states = new Map<string[], boolean | 'mixed'>()
  for (const map of branches.value)
    for (const group of map.values()) {
      const count = group.members.filter((key) => selected.value.has(key)).length
      states.set(
        group.members,
        count === 0 ? false : count === group.members.length ? true : 'mixed',
      )
    }
  return states
})
function state(members: string[]): boolean | 'mixed' {
  if (selectionState.value.has(members)) return selectionState.value.get(members)!
  const count = members.filter((key) => selected.value.has(key)).length
  return count === 0 ? false : count === members.length ? true : 'mixed'
}
function atLevel(level: number) {
  return paths.value.filter((p) => p[level]).map((p) => JSON.stringify(p))
}
function toggle(members: string[]) {
  const next = new Set(selected.value),
    on = state(members) !== true
  members.forEach((key) => (on ? next.add(key) : next.delete(key)))
  // Selecting every child restores the branch, including events that end at it.
  if (on)
    for (let level = 3; level >= 0; level--)
      for (const group of branches.value[level].values()) {
        if (!group.value) continue
        const children = group.members.filter((key) =>
          (JSON.parse(key) as Five).slice(level + 1).some(Boolean),
        )
        if (children.length && children.every((key) => next.has(key)))
          group.members.forEach((key) => next.add(key))
      }
  filter.value = {
    ...emptyHierarchy(),
    paths: next.size === paths.value.length ? null : [...next],
  }
}
function reset() {
  filter.value = emptyHierarchy()
  showEmpty.value = true
  precision.value = 0
}
const active = computed(
  () =>
    !!precision.value ||
    !showEmpty.value ||
    paths.value.some((p) => !matchesHierarchy(p, filter.value)),
)
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
      ><span v-if="active" class="count">已筛选</span
      ><ChevronDown :size="14" :class="{ rotated: open }" />
    </button>
    <FilterPanel v-if="open" :label="label" @close="emit('close')" @clear="reset">
      <div class="place-tree-scroll">
        <table class="place-tree">
          <thead>
            <tr>
              <th v-for="(name, level) in labels" :key="level" scope="col">
                <button
                  class="select-all-button"
                  role="checkbox"
                  :aria-label="`全部${level + 1}级地点`"
                  :aria-checked="state(atLevel(level))"
                  :disabled="!atLevel(level).length"
                  @click="toggle(atLevel(level))"
                >
                  <span
                    class="all-checkbox"
                    :class="{ checked: !!state(atLevel(level)) }"
                    ><CheckCheck
                      v-if="state(atLevel(level)) === true"
                      :size="13" /><Minus
                      v-else-if="state(atLevel(level)) === 'mixed'"
                      :size="13" /></span
                  ><span class="place-level-name">{{ name || `${level + 1}级` }}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(cells, row) in groups" :key="JSON.stringify(displayPaths[row])">
              <template v-for="(cell, level) in cells" :key="level">
                <td v-if="!cell.before" :rowspan="cell.span">
                  <label v-if="cell.value" class="check-label"
                    ><input
                      type="checkbox"
                      :checked="state(cell.members) === true"
                      :indeterminate="state(cell.members) === 'mixed'"
                      :aria-label="`地点${level + 1}级 ${cell.value}`"
                      @change="toggle(cell.members)"
                    /><span>{{ cell.value }}</span></label
                  >
                  <span
                    v-else-if="cell.missingAncestor"
                    class="place-placeholder"
                    aria-label="未填写"
                    >—</span
                  >
                </td>
              </template>
            </tr>
          </tbody>
        </table>
        <p v-if="!paths.length" class="muted">暂无地点</p>
      </div>
      <footer>
        <label class="filter-policy"
          >地点信息要求
          <select v-model="precision" aria-label="地点信息要求">
            <option :value="0">允许信息不完整</option>
            <option v-for="(name, i) in labels" :key="i" :value="i + 1">
              完整填写至 {{ name || `${i + 1}级` }}
            </option>
          </select>
        </label>
        <label class="check-label"
          ><input v-model="showEmpty" type="checkbox" />显示无地点事件</label
        >
      </footer>
    </FilterPanel>
  </section>
</template>
