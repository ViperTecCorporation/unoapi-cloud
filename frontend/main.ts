import { ViperConnectApp } from './app.js'

const root = document.getElementById('app')
if (!root) throw new Error('ViperConnect app root not found')

const app = new ViperConnectApp(root)
void app.start()
