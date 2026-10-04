<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Check, X } from 'lucide-vue-next'
import RichEditor from './RichEditor.vue'
import { characterList, plainText, timeLabels, type TimelineNode } from '../model'
const props = defineProps<{ node: TimelineNode; knownCharacters: string[]; isNew: boolean }>()
const emit = defineEmits<{ change: [node: TimelineNode]; done: [node: TimelineNode]; cancel: [] }>()
const draft = ref<TimelineNode>(JSON.parse(JSON.stringify(props.node)))
const names = ref(draft.value.characters.join(' '))
const knownOpen = ref(false)
const valid = computed(() => !!plainText(draft.value.event).trim())
function copy() {
  return JSON.parse(
    JSON.stringify({ ...draft.value, characters: characterList(names.value) }),
  ) as TimelineNode
}
watch([draft, names], () => emit('change', copy()), { deep: true })
function addCharacter(name: string) {
  names.value = characterList(names.value + ' ' + name).join(' ')
}
</script>
<template>
  <form class="node-form" @submit.prevent="valid && emit('done', copy())">
    <div class="inspector-heading">
      <strong>{{ isNew ? '添加节点' : '编辑节点' }}</strong
      ><button type="button" class="icon-button" aria-label="结束编辑" @click="emit('cancel')">
        <X :size="17" />
      </button>
    </div>
    <div class="form-scroll">
      <div class="section-label">事件 <span class="required">*</span></div>
      <RichEditor v-model="draft.event" />
      <p class="form-note">选中文字后设置格式；屏蔽文字在预览中悬停可见。</p>
      <p v-if="!valid" class="form-note">事件是唯一必填项。</p>
      <div class="section-label divided">时间 <small>全部选填</small></div>
      <label v-for="(label, i) in timeLabels" :key="label"
        >{{ label
        }}<input
          v-model="draft.time[i]"
          :aria-label="label"
          :placeholder="
            ['如 黄昏纪元', '如 唐', '如 光历10年', '如 1234.5.6 或 1234年5月6日', '如 17:00:73'][i]
          "
      /></label>
      <div class="section-label divided">地点</div>
      <div class="level-grid">
        <label v-for="i in 5" :key="i"
          >{{ i }} 级<input
            v-model="draft.location[i - 1]"
            :aria-label="`地点${i}级`"
            :placeholder="i === 1 ? '最高层级' : '选填'"
        /></label>
      </div>
      <label class="divided"
        >国家<input v-model="draft.country" aria-label="国家" placeholder="选填"
      /></label>
      <div class="section-label divided">组织</div>
      <div class="level-grid">
        <label v-for="i in 5" :key="i"
          >{{ i }} 级<input
            v-model="draft.organization[i - 1]"
            :aria-label="`组织${i}级`"
            placeholder="选填"
        /></label>
      </div>
      <label class="divided"
        >角色<input
          v-model="names"
          aria-label="角色标签"
          placeholder="输入多个角色，以空格分隔" /></label
      ><button
        type="button"
        class="inline-button"
        :aria-expanded="knownOpen"
        @click="knownOpen = !knownOpen"
      >
        {{ knownOpen ? '收起' : '展开' }}已有角色 · {{ knownCharacters.length }}
      </button>
      <div v-if="knownOpen" class="character-suggestions">
        <button
          v-for="name in knownCharacters"
          :key="name"
          type="button"
          class="tag"
          @click="addCharacter(name)"
        >
          {{ name }}</button
        ><span v-if="!knownCharacters.length" class="muted">还没有角色</span>
      </div>
    </div>
    <div class="form-actions">
      <small>{{
        isNew ? '完成后自动保存' : valid ? '修改自动保存' : '事件为空，尚未保存此修改'
      }}</small
      ><button class="primary-button" type="submit" :disabled="!valid">
        <Check :size="15" />完成
      </button>
    </div>
  </form>
</template>
