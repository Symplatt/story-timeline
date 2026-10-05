<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Check, ChevronDown } from 'lucide-vue-next'
import RichEditor from './RichEditor.vue'
import {
  characterList,
  plainText,
  timeLabels,
  five,
  displayClock,
  nodeTimeError,
  type TimeName,
  type Settings,
  type TimelineNode,
} from '../model'
const props = defineProps<{
  node: TimelineNode
  knownCharacters: string[]
  knownCountries: string[]
  knownOrganizations: string[]
  isNew: boolean
  nodes: TimelineNode[]
  timeNames?: TimeName[]
}>()
const emit = defineEmits<{
  change: [node: TimelineNode]
  done: [node: TimelineNode]
  cancel: []
}>()
const draft = ref<TimelineNode>(JSON.parse(JSON.stringify(props.node)))
draft.value.time[4] = displayClock(draft.value.time[4])
if (draft.value.endTime) draft.value.endTime[4] = displayClock(draft.value.endTime[4])
const names = ref(draft.value.characters.join('，')),
  countries = ref(draft.value.countries.join('，')),
  organizations = ref(draft.value.organizations.join('，'))
const settings = defineModel<Settings>('settings', { required: true })
const organizationsOpen = computed({
  get: () => settings.value.organizationsOpen,
  set: (v) => (settings.value.organizationsOpen = v),
})
const knownOpen = computed({
  get: () => settings.value.charactersOpen,
  set: (v) => (settings.value.charactersOpen = v),
})
const countriesOpen = computed({
  get: () => settings.value.countriesOpen,
  set: (v) => (settings.value.countriesOpen = v),
})
const originalTimes = JSON.stringify([props.node.time, props.node.endTime])
const timeError = computed(() =>
  !props.isNew &&
  JSON.stringify([draft.value.time, draft.value.endTime]) === originalTimes
    ? ''
    : nodeTimeError(draft.value, props.nodes, props.timeNames),
)
const valid = computed(() => !!plainText(draft.value.event).trim() && !timeError.value)
function copy(): TimelineNode {
  return JSON.parse(
    JSON.stringify({
      ...draft.value,
      characters: characterList(names.value),
      countries: characterList(countries.value),
      organizations: characterList(organizations.value),
    }),
  )
}
watch([draft, names, countries, organizations], () => emit('change', copy()), {
  deep: true,
})
</script>
<template>
  <form class="node-form" @submit.prevent="valid && emit('done', copy())">
    <div class="section-label">事件 <span class="required">*</span></div>
    <RichEditor v-model="draft.event" />
    <p class="form-note">选中文字后设置格式；屏蔽文字在阅读时悬停可见。</p>
    <div class="section-label divided">时间 <small>（选填）</small></div>
    <div class="time-mode" role="group" aria-label="时间类型">
      <button
        type="button"
        :class="{ active: !draft.endTime }"
        :aria-pressed="!draft.endTime"
        @click="delete draft.endTime"
      >
        时间点</button
      ><button
        type="button"
        :class="{ active: !!draft.endTime }"
        :aria-pressed="!!draft.endTime"
        @click="draft.endTime ||= five()"
      >
        时间段
      </button>
    </div>
    <div v-if="draft.endTime" class="section-label">开始时间</div>
    <div class="time-grid">
      <label v-for="(label, i) in timeLabels" :key="label"
        >{{ label
        }}<input
          v-model="draft.time[i]"
          @blur="i === 4 && (draft.time[i] = displayClock(draft.time[i]))"
          :aria-label="draft.endTime ? '开始' + label : label"
      /></label>
    </div>
    <template v-if="draft.endTime"
      ><div class="section-label divided">结束时间</div>
      <div class="time-grid">
        <label v-for="(label, i) in timeLabels" :key="label"
          >{{ label
          }}<input
            v-model="draft.endTime[i]"
            @blur="i === 4 && (draft.endTime[i] = displayClock(draft.endTime[i]))"
            :aria-label="'结束' + label"
        /></label></div
    ></template>
    <div class="section-label divided">地点 <small>（选填）</small></div>
    <div class="level-grid">
      <label v-for="i in 5" :key="i"
        >{{ settings.locationLabels[i - 1] || `${i}级`
        }}<input v-model="draft.location[i - 1]" :aria-label="`地点${i}级`"
      /></label>
    </div>
    <label class="divided"
      ><span>国家 <small>（选填，多个以逗号分隔）</small></span
      ><input v-model="countries" aria-label="国家标签"
    /></label>
    <button
      type="button"
      class="collapse-toggle suggestion-toggle"
      :aria-expanded="countriesOpen"
      @click="countriesOpen = !countriesOpen"
    >
      已有国家 <span class="count">{{ knownCountries.length }}</span
      ><ChevronDown :size="14" :class="{ rotated: countriesOpen }" />
    </button>
    <div v-if="countriesOpen" class="character-suggestions">
      <button
        v-for="name in knownCountries"
        :key="name"
        type="button"
        class="tag"
        @click="countries = characterList(countries + ' ' + name).join('，')"
      >
        {{ name }}</button
      ><span v-if="!knownCountries.length" class="muted">暂无国家</span>
    </div>
    <label class="divided"
      ><span>组织 <small>（选填，多个以逗号分隔）</small></span
      ><input v-model="organizations" aria-label="组织标签"
    /></label>
    <button
      type="button"
      class="collapse-toggle suggestion-toggle"
      :aria-expanded="organizationsOpen"
      @click="organizationsOpen = !organizationsOpen"
    >
      已有组织 <span class="count">{{ knownOrganizations.length }}</span
      ><ChevronDown :size="14" :class="{ rotated: organizationsOpen }" />
    </button>
    <div v-if="organizationsOpen" class="character-suggestions">
      <button
        v-for="name in knownOrganizations"
        :key="name"
        type="button"
        class="tag"
        @click="organizations = characterList(organizations + ' ' + name).join('，')"
      >
        {{ name }}</button
      ><span v-if="!knownOrganizations.length" class="muted">暂无组织</span>
    </div>
    <label class="divided"
      ><span>人物 <small>（选填，多个以逗号分隔）</small></span
      ><input v-model="names" aria-label="人物标签"
    /></label>
    <button
      type="button"
      class="collapse-toggle suggestion-toggle"
      :aria-expanded="knownOpen"
      @click="knownOpen = !knownOpen"
    >
      已有人物 <span class="count">{{ knownCharacters.length }}</span
      ><ChevronDown :size="14" :class="{ rotated: knownOpen }" />
    </button>
    <div v-if="knownOpen" class="character-suggestions">
      <button
        v-for="name in knownCharacters"
        :key="name"
        type="button"
        class="tag"
        @click="names = characterList(names + ' ' + name).join('，')"
      >
        {{ name }}</button
      ><span v-if="!knownCharacters.length" class="muted">暂无人物</span>
    </div>
    <p v-if="timeError" class="required" role="alert">{{ timeError }}</p>
    <div class="form-actions">
      <small v-if="!isNew && !valid">尚未保存此修改</small
      ><span class="spacer" /><button
        class="secondary-button"
        type="button"
        @click="emit('cancel')"
      >
        {{ isNew ? '取消' : '结束编辑' }}</button
      ><button class="primary-button" type="submit" :disabled="!valid">
        <Check :size="15" />完成
      </button>
    </div>
  </form>
</template>
