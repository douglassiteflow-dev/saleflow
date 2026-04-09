const { contextBridge } = require("electron");

// Expose a flag so the frontend knows it's running in Electron
contextBridge.exposeInMainWorld("saleflowDesktop", {
  isDesktop: true,
  platform: process.platform,
  version: "1.27.0",
});
