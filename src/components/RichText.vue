<script setup lang="ts">
import { computed } from 'vue'
import { preview, plainText, type Run } from '../model'
const props = defineProps<{ runs: Run[]; limit?: number; query?: string }>()
const content = computed(() => {
  const query = props.query?.trim().toLocaleLowerCase() || ''
  const full = plainText(props.runs).toLocaleLowerCase()
  const limit = props.limit
  const shown =
    limit === undefined
      ? { runs: props.runs, truncated: false }
      : preview(props.runs, limit)
  const intervals: [number, number][] = []
  if (query)
    for (
      let start = full.indexOf(query);
      start >= 0;
      start = full.indexOf(query, start + query.length)
    )
      intervals.push([start, start + query.length])
  let offset = 0
  const runs = shown.runs.flatMap((run) => {
    const start = offset,
      end = offset + run.text.length
    offset = end
    const boundaries = [
      ...new Set([start, end, ...intervals.flat().filter((n) => n > start && n < end)]),
    ].sort((a, b) => a - b)
    return boundaries.slice(0, -1).map((a, i) => ({
      text: run.text.slice(a - start, boundaries[i + 1] - start),
      marks: run.marks,
      hit: intervals.some(([lo, hi]) => a >= lo && a < hi),
    }))
  })
  // Paragraph wrappers affect reading layout only; saved runs and their marks stay intact.
  const paragraphs: (typeof runs)[] = [[]]
  for (const run of runs) {
    const lines = run.text.split(/\r\n|\r|\n/)
    lines.forEach((text, i) => {
      if (i) paragraphs.push([])
      if (text) paragraphs.at(-1)!.push({ ...run, text })
    })
  }
  return { paragraphs, truncated: shown.truncated }
})
</script>
<template>
  <span class="rich-text"
    ><span v-for="(paragraph, p) in content.paragraphs" :key="p" class="rich-paragraph"
      ><span
        v-for="(run, i) in paragraph"
        :key="i"
        :class="run.marks"
        :tabindex="run.marks.includes('spoiler') ? 0 : undefined"
        :aria-label="
          run.marks.includes('spoiler') ? '屏蔽文字，悬停或聚焦查看' : undefined
        "
        ><mark v-if="run.hit" class="search-hit">{{ run.text }}</mark
        ><template v-else>{{ run.text }}</template></span
      ><span
        v-if="content.truncated && p === content.paragraphs.length - 1"
        class="ellipsis"
        >…</span
      ></span
    ></span
  >
</template>
