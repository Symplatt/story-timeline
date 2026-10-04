<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  EyeOff,
  RemoveFormatting,
  Undo2,
  Redo2,
} from 'lucide-vue-next'
import type { Run, Mark } from '../model'
const props = defineProps<{ modelValue: Run[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: Run[]] }>()
const editor = ref<HTMLDivElement>()
const controls = [
  { mark: 'bold', command: 'bold', label: '加粗', icon: Bold },
  { mark: 'underline', command: 'underline', label: '下划线', icon: Underline },
  { mark: 'italic', command: 'italic', label: '斜体', icon: Italic },
  { mark: 'strike', command: 'strikeThrough', label: '删除线', icon: Strikethrough },
]
onMounted(() => {
  const tags: Record<Mark, string> = {
    bold: 'b',
    underline: 'u',
    italic: 'i',
    strike: 's',
    spoiler: 'span',
  }
  for (const run of props.modelValue) {
    let node: Node = document.createTextNode(run.text)
    for (const mark of run.marks) {
      const wrapper = document.createElement(tags[mark])
      if (mark === 'spoiler') wrapper.className = 'spoiler'
      wrapper.appendChild(node)
      node = wrapper
    }
    editor.value!.appendChild(node)
  }
})
function read() {
  const runs: Run[] = []
  function push(text: string, marks: Mark[]) {
    if (!text) return
    const sorted = [...new Set(marks)].sort() as Mark[]
    const last = runs.at(-1)
    if (last && last.marks.join() === sorted.join()) last.text += text
    else runs.push({ text, marks: sorted })
  }
  function walk(node: Node, marks: Mark[]) {
    if (node.nodeType === Node.TEXT_NODE) {
      push(node.textContent || '', marks)
      return
    }
    if (!(node instanceof HTMLElement)) return
    const next = [...marks]
    const tags: Record<string, Mark> = {
      B: 'bold',
      STRONG: 'bold',
      U: 'underline',
      I: 'italic',
      EM: 'italic',
      S: 'strike',
      STRIKE: 'strike',
      DEL: 'strike',
    }
    if (tags[node.tagName]) next.push(tags[node.tagName])
    for (const m of ['bold', 'underline', 'italic', 'strike', 'spoiler'] as Mark[])
      if (node.classList.contains(m)) next.push(m)
    if (node.style.fontWeight === 'bold' || Number(node.style.fontWeight) >= 600) next.push('bold')
    if (node.style.fontStyle === 'italic') next.push('italic')
    if (node.style.textDecoration.includes('underline')) next.push('underline')
    if (node.style.textDecoration.includes('line-through')) next.push('strike')
    if (node.tagName === 'BR') {
      push('\n', marks)
      return
    }
    if (['DIV', 'P'].includes(node.tagName) && runs.length && !runs.at(-1)!.text.endsWith('\n'))
      push('\n', marks)
    node.childNodes.forEach((child) => walk(child, next))
  }
  editor.value!.childNodes.forEach((node) => walk(node, []))
  emit('update:modelValue', runs)
}
function command(name: string) {
  editor.value!.focus()
  document.execCommand(name)
  read()
}
function spoiler() {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return
  const range = selection.getRangeAt(0)
  if (!editor.value!.contains(range.commonAncestorContainer) || range.collapsed) return
  const parent =
    range.commonAncestorContainer instanceof HTMLElement
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement
  const existing = parent?.closest('.spoiler')
  if (existing && editor.value!.contains(existing)) {
    existing.replaceWith(...existing.childNodes)
    read()
    return
  }
  const span = document.createElement('span')
  span.className = 'spoiler'
  span.appendChild(range.extractContents())
  range.insertNode(span)
  selection.removeAllRanges()
  range.selectNodeContents(span)
  selection.addRange(range)
  read()
}
function clear() {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return
  const range = selection.getRangeAt(0)
  if (!editor.value!.contains(range.commonAncestorContainer) || range.collapsed) return
  document.execCommand('insertText', false, selection.toString())
  read()
}
function paste(e: ClipboardEvent) {
  e.preventDefault()
  document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') || '')
  read()
}
</script>
<template>
  <div class="rich-editor">
    <div class="format-toolbar" role="toolbar" aria-label="事件格式">
      <button
        v-for="tool in controls"
        :key="tool.mark"
        type="button"
        :title="tool.label"
        :aria-label="tool.label"
        @mousedown.prevent
        @click="command(tool.command)"
      >
        <component :is="tool.icon" :size="16" /></button
      ><button
        type="button"
        title="屏蔽／取消屏蔽选中文字"
        aria-label="屏蔽文字"
        @mousedown.prevent
        @click="spoiler"
      >
        <EyeOff :size="16" /></button
      ><button
        type="button"
        title="清除选区格式"
        aria-label="清除格式"
        @mousedown.prevent
        @click="clear"
      >
        <RemoveFormatting :size="16" /></button
      ><span class="spacer" /><button
        type="button"
        title="撤销"
        aria-label="撤销文字编辑"
        @mousedown.prevent
        @click="command('undo')"
      >
        <Undo2 :size="15" /></button
      ><button
        type="button"
        title="重做"
        aria-label="重做文字编辑"
        @mousedown.prevent
        @click="command('redo')"
      >
        <Redo2 :size="15" />
      </button>
    </div>
    <div
      ref="editor"
      class="event-input rich-text"
      contenteditable="true"
      role="textbox"
      aria-label="事件内容"
      aria-multiline="true"
      data-placeholder="写下这个时刻发生的事…"
      @input="read"
      @paste="paste"
      @drop.prevent
    ></div>
  </div>
</template>
