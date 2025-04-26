<template>
  <AppNavbar
    :displayNetworks="displayNetworks"
    :displayApps="displayApps"
    :autoRefresh="autoRefresh"
    :datasources="datasources"
    @toggle-networks="displayNetworks = $event"
    @toggle-apps="displayApps = $event"
    @toggle-refresh="autoRefresh = $event"
    @rearrange="rearrangeNodes"
    @open-datasource-config="openConfig"
  />
  <GraphView ref="graphView" />
  <DatasourceConfigModal
    v-if="showConfig"
    :config="selectedConfig"
    @close="showConfig = false"
    @save="updateDatasourceConfig"
  />
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue'
import AppNavbar from './components/AppNavbar.vue'
import GraphView from './components/GraphView.vue'
import DatasourceConfigModal from './components/DatasourceConfigModal.vue'
import { DockerComposeClient } from '@src/datasources/dockerCompose'

const displayNetworks = ref(true)
const displayApps = ref(true)
const autoRefresh = ref(true)

const showConfig = ref(false)
const selectedConfig = ref<any>(null)

const datasources = ref([
  { name: 'Docker Compose', type: 'docker', instance: new DockerComposeClient() }
])

const graphView = ref()

const openConfig = (config: any = null) => {
  selectedConfig.value = config
  showConfig.value = true
}

const updateDatasourceConfig = (updatedConfig: any) => {
  showConfig.value = false
  selectedConfig.value = null
}

const rearrangeNodes = async () => {
  graphView.value?.rearrange()
}

onMounted(() => {
  datasources.value.forEach((ds) => {
    graphView.value?.addDatasource(ds.instance)
  })
})
</script>

