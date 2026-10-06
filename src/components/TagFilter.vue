<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, CheckCheck, Minus, Search } from 'lucide-vue-next'
import FilterPanel from './FilterPanel.vue'
import { includesUntagged, toggleTag, type TagSelection } from '../model'
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
    (includesUntagged(selection.value) &&
      props.options.every((name) => selection.value.values.includes(name))),
)
const partial = computed(
  () =>
    !all.value &&
    (includesUntagged(selection.value) ||
      props.options.some((name) => selection.value.values.includes(name))),
)
function toggle(name?: string) {
  selection.value = toggleTag(selection.value, props.options, name)
}
</script>
<template>
  <section class="filter-section tag-filter">
    <button
      class="section-heading collapse-toggle"
      :aria-expanded="open"
      @click="open = !open"
    >
      <slot /><strong>{{ label }}</strong
      ><span class="count">{{ options.length }}</span
      ><ChevronDown :size="14" :class="{ rotated: open }" />
    </button>
    <FilterPanel
      v-if="open"
      :label="label"
      @close="open = false"
      @clear="selection = { all: true, values: [] }"
    >
      <div v-if="open" class="filter-body tag-filter-body">
        <label class="tag-search"
          ><Search :size="17" /><input
            v-model="query"
            placeholder="搜索"
            :aria-label="`搜索${label}`"
        /></label>
        <button
          class="select-all-button"
          role="checkbox"
          :aria-checked="partial ? 'mixed' : all"
          :aria-label="`全部${label}`"
          @click="selection = { all: !all, values: [] }"
        >
          <span class="all-checkbox" :class="{ checked: all || partial }"
            ><CheckCheck v-if="all" :size="13" /><Minus
              v-else-if="partial"
              :size="13" /></span
          >全选
        </button>
        <div class="filter-values">
          <label v-if="!query || `未填写${label}`.includes(query)" class="check-label">
            <input
              type="checkbox"
              :checked="includesUntagged(selection)"
              :aria-label="`未填写${label}`"
              @change="toggle()"
            />
            <span>未填写{{ label }}</span>
          </label>
          <label v-for="name in visible" :key="name" class="check-label"
            ><input
              type="checkbox"
              :checked="selection.all || selection.values.includes(name)"
              :aria-label="`筛选${label} ${name}`"
              @change="toggle(name)"
            /><span>{{ name }}</span></label
          >
          <p
            v-if="!visible.length && query && !`未填写${label}`.includes(query)"
            class="muted"
          >
            {{ query ? '没有匹配项' : `暂无${label}` }}
          </p>
        </div>
      </div>
    </FilterPanel>
  </section>
</template>
