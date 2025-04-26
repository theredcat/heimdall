import { createApp } from 'vue'

import PrimeVue from 'primevue/config'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'

import Aura from '@primeuix/themes/aura';

import App from './App.vue'
import Menubar from 'primevue/menubar'

const app = createApp(App)

app.use(PrimeVue, {
    theme: {
        preset: Aura
    }
})
app.component('Button', Button)
app.component('Checkbox', Checkbox)
app.component('Dialog', Dialog)
app.component('InputText', InputText)
app.component('DataTable', DataTable)
app.component('Column', Column)
app.component('Menubar', Menubar)

app.mount('#app')
