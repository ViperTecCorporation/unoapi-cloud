import { ViperConnectApp } from './app.js?v=4.0.0-beta9-6cbd5fc8';
const root = document.getElementById('app');
if (!root)
    throw new Error('ViperConnect app root not found');
const app = new ViperConnectApp(root);
void app.start();
