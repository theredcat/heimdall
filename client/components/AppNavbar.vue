<template>
  <Menubar :model="items" />

  <Dialog header="Display Options" v-model:visible="showOptions" modal>
    <div class="p-3">
      <div class="field-checkbox">
        <Checkbox v-model="localDisplayNetworks.value" binary />
        <label class="ml-2">Networks</label>
      </div>
      <div class="field-checkbox">
        <Checkbox v-model="localDisplayApps.value" binary />
        <label class="ml-2">Applications</label>
      </div>
      <div class="field-checkbox">
        <Checkbox v-model="localAutoRefresh.value" binary />
        <label class="ml-2">Auto Refresh</label>
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, defineProps, defineEmits, computed } from 'vue'
import Menubar from 'primevue/menubar'
import Dialog from 'primevue/dialog'
import Checkbox from 'primevue/checkbox'
import Button from 'primevue/button'

const props = defineProps({
  displayNetworks: Boolean,
  displayApps: Boolean,
  autoRefresh: Boolean,
  datasources: Array,
})

const emit = defineEmits([
  'toggle-networks',
  'toggle-apps',
  'toggle-refresh',
  'rearrange',
  'open-datasource-config',
])

const localDisplayNetworks = ref(props.displayNetworks)
const localDisplayApps = ref(props.displayApps)
const localAutoRefresh = ref(props.autoRefresh)
const showOptions = ref(false)

watch(localDisplayNetworks, (val) => emit('toggle-networks', val))
watch(localDisplayApps, (val) => emit('toggle-apps', val))
watch(localAutoRefresh, (val) => emit('toggle-refresh', val))
const datasourceMenuItems = computed(() => {
  return (props.datasources || []).map((ds) => ({
    label: ds.name,
    icon: 'pi pi-cog',
    command: () => emit('open-datasource-config', ds)
  }))
})

const items = computed(() => [
  {
    label: 'Heimdall',
    icon: 'pi pi-home'
  },
  {
    label: 'Display',
    icon: 'pi pi-cog',
    items: [
      {
        label: 'Re-arrange Nodes',
        icon: 'pi pi-sort-alt',
        command: () => emit('rearrange')
      },
      {
        separator: true
      },
      {
        label: 'Options...',
        icon: 'pi pi-sliders-h',
        command: () => showOptions.value = true
      }
    ]
  },
  {
    label: 'Datasources',
    icon: 'pi pi-database',
    items: datasourceMenuItems.value
  }
])
</script>

