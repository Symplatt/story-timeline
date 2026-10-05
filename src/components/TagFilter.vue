<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, CheckCheck, Minus, X } from 'lucide-vue-next'
import FilterPanel from './FilterPanel.vue'
import { type TagSelection } from '../model'
const props = defineProps<{ label: string; options: string[] }>()
const selection = defineModel<TagSelection>({ required: true })
const open = defineModel<boolean>('open', { required: true })
const query = ref('')
const visible = computed(() =>
  props.options.filter((name) =>
    name.toLocaleLowerCase().includes(query.value.toLocaleLowerCase()),
  ),
)
const all = computed(
  () =>
    selection.value.all ||
    (props.options.length > 0 &&
      props.options.every((name) => selection.value.values.includes(name))),
)
const partial = computed(() => !all.value && selection.value.values.length > 0)
function toggle(name: string) {
  const values = selection.value.all ? [...props.options] : [...selection.value.values]
  const next = values.includes(name)
    ? values.filter((value) => value !== name)
    : [...values, name]
  selection.value = {
    all: next.length > 0 && props.options.every((value) => next.includes(value)),
    values: next,
  }
}
</script>
<template>
  <section class="filter-section tag-filter">
    <button
      class="section-heading collapse-toggle"
      :aria-expanded="open"
      @click="open = !open"
    >
      <slot /><strong>已有{{ label }}</strong
      ><span class="count">{{ options.length }}</span
      ><ChevronDown :size="14" :class="{ rotated: open }" />
    </button>
    <FilterPanel v-if="open" :label="label" @close="open = false" @clear="selection = { all: true, values: [] }">
    <div v-if="!selection.all" class="active-filter">
      <span>{{ selection.values.length ? selection.values.join('，') : '全不选' }}</span
      ><button
        class="icon-button small"
        :aria-label="`清除${label}筛选`"
        @click="selection = { all: true, values: [] }"
      >
        <X :size="13" />
      </button>
    </div>
    <div v-if="open" class="filter-body">
      <button
        class="select-all-button"
        role="checkbox"
        :aria-checked="partial ? 'mixed' : all"
        :aria-label="`全部${label}`"
        @click="selection = { all: !all, values: [] }"
      >
        <span class="all-checkbox" :class="{ checked: all || partial }"
          ><CheckCheck v-if="all" :size="13" /><Minus v-else-if="partial" :size="13" /></span
        >全部{{ label }}
      </button>
      <label v-if="options.length > 8" class="filter-search"
        >搜索{{ label }}<input v-model="query" :aria-label="`搜索${label}`"
      /></label>
      <div class="filter-values">
        <label v-for="name in visible" :key="name" class="check-label"
          ><input
            type="checkbox"
            :checked="selection.all || selection.values.includes(name)"
            :aria-label="`筛选${label} ${name}`"
            @change="toggle(name)"
          /><span>{{ name }}</span></label
        >
        <p v-if="!visible.length" class="muted">
          {{ query ? '没有匹配项' : `暂无${label}` }}
        </p>
      </div>
    </div>
    </FilterPanel>
  </section>
</template>
