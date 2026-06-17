// Transport-agnostic data API. The concrete adapter (HTTP in the browser, Tauri SQL
// inside the desktop app) is selected at runtime in ./data/index via window.isTauri, so
// every existing `import … from '../api'` keeps working unchanged on both targets.
export * from './data/port';
export * from './data/index';
