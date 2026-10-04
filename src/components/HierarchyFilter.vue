<script setup lang="ts">
import { computed, ref } from 'vue'
import { type HierarchyFilter, sortedCharacters } from '../model'
const props = defineProps<{ label: string; options: string[][] }>()
const filter = defineModel<HierarchyFilter>({ required: true })
const showEmpty = defineModel<boolean>('showEmpty', { required: true })
const query = ref('')
const names = computed(() =>
  sortedCharacters(props.options.flat()).filter((name) =>
    name.toLocaleLowerCase().includes(query.value.toLocaleLowerCase()),
  ),
)
function toggleLevel(level: number) {
  const levels = filter.value.levels.includes(level)
    ? filter.value.levels.filter((n) => n !== level)
    : [...filter.value.levels, level]
  filter.value = { ...filter.value, levels }
}
</script>
<template>
  <details class="filter-section">
    <summary>
      <slot />{{ label
      }}<span v-if="filter.values.length || filter.levels.length" class="count">已筛选</span>
    </summary>
    <div class="filter-body">
      <span class="filter-label">层级</span>
      <div class="level-options" :aria-label="`${label}层级筛选`">
        <button
          :class="{ active: !filter.levels.length }"
          :aria-pressed="!filter.levels.length"
          @click="filter.levels = []"
        >
          全部
        </button>
        <button
          v-for="level in 5"
          :key="level"
          :class="{ active: filter.levels.includes(level) }"
          :aria-pressed="filter.levels.includes(level)"
          @click="toggleLevel(level)"
        >
          {{ level }} 级
        </button>
      </div>
      <div class="filter-label value-heading">
        {{ label
        }}<button
          class="inline-button"
          :disabled="!filter.values.length"
          @click="filter.values = []"
        >
          清除选择
        </button>
      </div>
      <input
        v-if="options.flat().length > 8"
        v-model="query"
        :aria-label="`搜索${label}`"
        :placeholder="`搜索${label}…`"
      />
      <div class="filter-values">
        <label v-for="name in names" :key="name" class="check-label"
          ><input
            v-model="filter.values"
            type="checkbox"
            :value="name"
            :aria-label="`筛选${label} ${name}`"
          /><span>{{ name }}</span></label
        >
        <p v-if="!names.length" class="muted">
          {{ query ? '没有匹配项' : `暂无${label}` }}
        </p>
      </div>
      <label class="check-label empty-option"
        ><input v-model="showEmpty" type="checkbox" />显示无{{ label }}事件</label
      >
    </div>
  </details>
</template>
