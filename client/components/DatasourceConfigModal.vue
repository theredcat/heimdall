<template>
  <Dialog
    :header="datasource?.name"
    v-model:visible="visible"
    modal
    closable
    @hide="$emit('close')"
    style="width: 800px; max-width: 90vw;"
  >
    <DataView :value="entries" layout="list">
      <template #list="slotProps">
        <div
          v-for="(item, index) in slotProps.items"
          :key="item.key"
          class="flex items-center !p-5 gap-4"
          :class="{ 'border-t border-surface-200 dark:border-surface-700': index !== 0 }"
        >
          <div class="w-1/3 font-medium bg-red-500">
            {{ item.label }}
          </div>
  
          <div class="w-2/3">
            <InputText v-model="item.value" v-tooltip="item.description" class="w-full"/>
          </div>
        </div>
      </template>
    </DataView>

    <div class="flex justify-end mt-4">
      <Button label="Save" @click="saveConfig" class="bg-primary text-white" />
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { defineProps, defineEmits, ref, reactive } from 'vue'
import Dialog from 'primevue/dialog'
import DataView from 'primevue/dataview'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'

const props = defineProps<{
  datasource: {
    name: string
    config: Record<string, any>
    configSchema: Record<string, { name: string }>
  }
}>()

const emit = defineEmits(['close', 'save'])

const visible = ref(true)

const entries = reactive(
  Object.entries(props.datasource.config).map(([key, value]) => {
    const label = props.datasource.configSchema[key]?.name || key
    const description = props.datasource.configSchema[key]?.description || ""
    return { key, label, value, description }
  })
)

const saveConfig = () => {
  const updatedSettings = entries.reduce((acc, item) => {
    acc[item.key] = item.value
    return acc
  }, {} as Record<string, any>)

  emit('save', updatedSettings)
}
</script>
