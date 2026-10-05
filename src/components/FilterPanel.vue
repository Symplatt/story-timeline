<script setup lang="ts">
import { X } from 'lucide-vue-next'
defineProps<{ label: string }>()
defineEmits<{ close: []; clear: [] }>()
</script>
<template>
  <Teleport to="#filter-dock" defer>
    <section
      class="filter-panel"
      role="region"
      :aria-label="`${label}二级筛选栏`"
      @keydown.esc.stop="$emit('close')"
    >
      <header>
        <strong>{{ label }}筛选</strong
        ><button class="clear-filter-link" @click="$emit('clear')">取消筛选</button
        ><button
          class="icon-button"
          :aria-label="`关闭${label}筛选`"
          @click="$emit('close')"
        >
          <X :size="18" />
        </button>
      </header>
      <slot />
    </section>
  </Teleport>
</template>
