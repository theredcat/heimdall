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
    @open-datasource-config="openDatasourceConfig"
  />
  <GraphView ref="graphView" />
  <DatasourceConfigModal
    v-if="showDatasourceConfig"
    :datasource="selectedDatasource"
    @close="showDatasourceConfig = false"
    @save="updateDatasourceConfig"
  />
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue'
import AppNavbar from './components/AppNavbar.vue'
import GraphView from './components/GraphView.vue'
import DatasourceConfigModal from './components/DatasourceConfigModal.vue'

// Datasources
import type { ClientModule } from '@src/datasources/index.ts'
import { DockerComposeClient } from '@src/datasources/dockerCompose/client.ts'
import { DockerComposeClientConfig } from '@src/datasources/dockerCompose/common.ts'

type AllDatasourceConfigs = DockerComposeClientConfig

const displayNetworks = ref(true)
const displayApps = ref(true)
const autoRefresh = ref(true)
const showDatasourceConfig = ref(false)
const selectedDatasource = ref<ClientModule<AllDatasourceConfigs> | null>(null)

const datasources = ref<ClientModule<AllDatasourceConfigs>[]>([])

const socket = ref<WebSocket | null>(null)

const connectWebSocket = () => {
  socket.value = new WebSocket('ws://localhost:1337') // Remplace par l'URL de ton serveur

  socket.value.onopen = () => {
    console.log('WebSocket connecté')
  }

  socket.value.onmessage = (event) => {
    const message = JSON.parse(event.data)

    if (message.type === 'datasource-list') {
      updateDatasources(message.data)
    }
  }

  socket.value.onclose = () => {
    console.log('WebSocket fermé')
  }

  socket.value.onerror = (error) => {
    console.error('WebSocket erreur:', error)
  }
}

const updateDatasources = (modules: string[]) => {
  const availableDatasources = []

  console.log(modules)
  
  if (modules.includes('dockerCompose')) {
    availableDatasources.push(new DockerComposeClient())
  }
  console.log(availableDatasources)
  datasources.value = availableDatasources
}

const openDatasourceConfig = (datasource: ClientModule<AllDatasourceConfigs> | null) => {
  selectedDatasource.value = datasource
  showDatasourceConfig.value = true
}

const updateDatasourceConfig = (updatedDatasourceConfig: any) => {
  console.log(updatedDatasourceConfig)
  showDatasourceConfig.value = false
  selectedDatasource.value = null
}

const rearrangeNodes = async () => {
  graphView.value?.rearrange()
}

onMounted(() => {
  connectWebSocket() // Connexion WebSocket au moment du montage du composant

  datasources.value.forEach((ds) => {
    graphView.value?.addDatasource(ds.instance)
  })
})
</script>
