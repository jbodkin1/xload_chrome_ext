/**
 * xload Retro System Monitor - MV3 Background Service Worker
 */

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['config', 'history'], (result) => {
    const defaultConfig = {
      theme: 'classic',
      refreshRate: 1000,
      showGrid: true,
      scanlines: true,
      scaleMode: 'auto',
      fixedMax: 100,
      graphType: 'x11-fill',
      simulatedJitter: false
    };

    if (!result.config) {
      chrome.storage.local.set({ config: defaultConfig });
    }
    if (!result.history) {
      chrome.storage.local.set({ history: [] });
    }
  });
});