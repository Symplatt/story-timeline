<script setup lang="ts">
import { computed } from 'vue'
import { preview, type Run } from '../model'
const props = defineProps<{ runs: Run[]; limit?: number }>()
const content = computed(() =>
  props.limit === undefined
    ? { runs: props.runs, truncated: false }
    : preview(props.runs, props.limit),
)
</script>
<template>
  <span class="rich-text"
    ><span
      v-for="(run, i) in content.runs"
      :key="i"
      :class="run.marks"
      :tabindex="run.marks.includes('spoiler') ? 0 : undefined"
      :aria-label="run.marks.includes('spoiler') ? '屏蔽文字，悬停或聚焦查看' : undefined"
      >{{ run.text }}</span
    ><span v-if="content.truncated" class="ellipsis">…</span></span
  >
</template>
