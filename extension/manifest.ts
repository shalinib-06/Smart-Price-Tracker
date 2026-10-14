import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Price-Drop & Restock Tracker',
  version: '0.1.0',
  action: { default_popup: 'src/popup/index.html' },
  background: { service_worker: 'src/background/service-worker.ts', type: 'module' },
  content_scripts: [
    { matches: ['<all_urls>'], js: ['src/content/index.ts'], run_at: 'document_idle' },
  ],
  permissions: ['activeTab', 'storage', 'notifications'],
  host_permissions: ['<all_urls>'],
})