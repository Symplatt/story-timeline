<script setup lang="ts">
import RichText from './RichText.vue'
defineProps<{ text: string; query?: string }>()
</script>
<template><RichText :runs="[{ text, marks: [] }]" :query="query" /></template>
