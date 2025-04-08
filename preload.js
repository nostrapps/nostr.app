// Preload script
const { contextBridge } = require('electron');

// Expose protected methods that allow the renderer process to access
// specific Node.js APIs without exposing the entire Node.js API
contextBridge.exposeInMainWorld(
  'electronAPI', {
  // If you need to expose any APIs from Electron to your web page,
  // you would define them here. For example:
  // Example: getVersion: () => process.versions.electron

  // This is placeholder for actual API implementations
  getAppVersion: () => require('electron').app.getVersion(),

  // You might want to add methods for file access, IPC communication, etc.
  // Always design these with security in mind
}
);
