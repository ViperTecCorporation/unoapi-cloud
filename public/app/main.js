import { ViperConnectApp } from './app.js?v=4.0.8-c5975654';
const root = document.getElementById('app');
if (!root)
    throw new Error('ViperConnect app root not found');
const app = new ViperConnectApp(root);
void app.start();
