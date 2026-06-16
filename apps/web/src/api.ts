// Transport-agnostic data API. The concrete adapter (HTTP in the browser, Tauri SQL
// inside the desktop app) is selected in ./data/index (Task A5). Until that exists this
// re-exports the HTTP adapter directly so every existing `import … from '../api'` keeps
// working unchanged.
export * from './data/port';
export * from './data/http';
