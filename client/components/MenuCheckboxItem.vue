<template>
  <div>
    <span>aa{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
import { defineProps, defineEmits, computed } from 'vue'
import Checkbox from 'primevue/checkbox'

const props = defineProps<{
  modelValue: boolean,
  label: string
}>()

const emit = defineEmits(['update:modelValue'])

const value = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val)
})

const onUpdate = (val: boolean) => {
  emit('update:modelValue', val)
}
</script>
