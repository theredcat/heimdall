<template>
  <Dialog header="Datasource Configuration" v-model:visible="visible" :modal="true" :closable="true" @hide="$emit('close')">
    <div class="p-fluid">
      <div v-for="(setting, key) in config" :key="key" class="field">
        <label :for="key">{{ setting.name }}</label>
        <InputText :id="key" v-model="config[key].default" />
      </div>
      <Button label="Save" @click="saveConfig" />
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { defineProps, defineEmits, ref, watch } from 'vue'

const props = defineProps({
  config: Object
})
const emit = defineEmits(['close', 'save'])

const visible = ref(true)

const saveConfig = () => {
  emit('save', props.config)
}
</script>

