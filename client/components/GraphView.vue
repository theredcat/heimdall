<template>
  <div id="cy" class="uk-container uk-container-expand" uk-height-viewport="offset-top: true; offset-bottom: true"
       style="min-height: calc((100vh - 150px) - 152px);"></div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Infrastructure } from '@src/infrastructure'
import style from '@src/style/graph.json'

const graph = ref<Infrastructure | null>(null)

const addDatasource = (ds: any) => {
  graph.value?.addDataSource(ds)
}

const rearrange = async () => {
  await graph.value?.update(true)
}

onMounted(async () => {
  const el = document.getElementById('cy')
  graph.value = new Infrastructure(el!, style)
})

defineExpose({ addDatasource, rearrange })
</script>
