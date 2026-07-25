import { ViperConnectApp } from './app.js?v=4.0.0-beta8-06f3a62c';
const root = document.getElementById('app');
if (!root)
    throw new Error('ViperConnect app root not found');
const app = new ViperConnectApp(root);
void app.start();
