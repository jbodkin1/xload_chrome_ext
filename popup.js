/**
 * xload Retro System Monitor - Chrome Popup Controller
 */

let config = {
  theme: 'classic',
  refreshRate: 1000,
  showGrid: true,
  scanlines: true,
  scaleMode: 'auto',
  fixedMax: 100,
  graphType: 'x11-fill'
};

let history = [];
const maxDataPoints = 120;
let prevCpuInfo = null;
let updateIntervalId = null;

const canvas = document.getElementById('xload-canvas');
const ctx = canvas.getContext('2d');

const themeSelect = document.getElementById('theme-select');
const intervalSelect = document.getElementById('interval-select');
const gridToggle = document.getElementById('grid-toggle');
const scanlinesToggle = document.getElementById('scanlines-toggle');
const loadValueEl = document.getElementById('load-value');
const scaleValueEl = document.getElementById('scale-value');
const scanlineOverlayEl = document.querySelector('.scanlines');

const themes = {
  'classic': { bg: '#ffffff', grid: '#dfdfdf', line: '#ff0000', fill: 'rgba(255, 0, 0, 0.15)', border: '#000000', text: '#000000' },
  'retro-dark': { bg: '#121214', grid: '#1a243a', line: '#00e1d9', fill: 'rgba(0, 225, 217, 0.12)', border: '#00e1d9', text: '#00e1d9' },
  'amber-crt': { bg: '#150900', grid: '#3a1b00', line: '#ff8100', fill: 'rgba(255, 129, 0, 0.12)', border: '#ff8100', text: '#ff8100' },
  'matrix-green': { bg: '#020d00', grid: '#003c00', line: '#15ff00', fill: 'rgba(21, 255, 0, 0.15)', border: '#15ff00', text: '#15ff00' },
  'vapor-cyber': { bg: '#1b001d', grid: '#44005c', line: '#ff0055', fill: 'rgba(255, 0, 85, 0.15)', border: '#ff0055', text: '#ff0055' },
  'mono-high': { bg: '#000000', grid: '#333333', line: '#ffffff', fill: 'rgba(255, 255, 255, 0.12)', border: '#ffffff', text: '#ffffff' }
};

document.addEventListener('DOMContentLoaded', () => {
  ctx.imageSmoothingEnabled = false;

  chrome.storage.local.get(['config', 'history'], (result) => {
    if (result.config) config = { ...config, ...result.config };
    if (result.history) history = result.history;

    themeSelect.value = config.theme;
    intervalSelect.value = config.refreshRate.toString();
    gridToggle.checked = config.showGrid;
    scanlinesToggle.checked = config.scanlines;

    updateScanlineOverlay();
    startMonitoringLoop();
    drawGraph();

    themeSelect.addEventListener('change', (e) => {
      config.theme = e.target.value;
      saveConfig();
      drawGraph();
    });

    intervalSelect.addEventListener('change', (e) => {
      config.refreshRate = parseInt(e.target.value, 10);
      saveConfig();
      startMonitoringLoop();
    });

    gridToggle.addEventListener('change', (e) => {
      config.showGrid = e.target.checked;
      saveConfig();
      drawGraph();
    });

    scanlinesToggle.addEventListener('change', (e) => {
      config.scanlines = e.target.checked;
      updateScanlineOverlay();
      saveConfig();
    });
  });
});

function updateScanlineOverlay() {
  scanlineOverlayEl.style.display = config.scanlines ? 'block' : 'none';
}

function saveConfig() {
  chrome.storage.local.set({ config });
}

function startMonitoringLoop() {
  if (updateIntervalId) clearInterval(updateIntervalId);
  queryCpuInfo();
  updateIntervalId = setInterval(queryCpuInfo, config.refreshRate);
}

function queryCpuInfo() {
  chrome.system.cpu.getInfo((cpuInfo) => {
    if (!cpuInfo) return;
    if (prevCpuInfo) {
      let activeTicksDiff = 0;
      let totalTicksDiff = 0;

      for (let i = 0; i < cpuInfo.processors.length; i++) {
        const pNow = cpuInfo.processors[i].usage;
        const pPrior = prevCpuInfo.processors[i] ? prevCpuInfo.processors[i].usage : null;
        if (pPrior) {
          const nowActive = pNow.user + pNow.kernel;
          const nowTotal = pNow.user + pNow.kernel + pNow.idle;
          const priorActive = pPrior.user + pPrior.kernel;
          const priorTotal = pPrior.user + pPrior.kernel + pPrior.idle;

          activeTicksDiff += (nowActive - priorActive);
          totalTicksDiff += (nowTotal - priorTotal);
        }
      }

      let loadPercent = 0;
      if (totalTicksDiff > 0) {
        loadPercent = (activeTicksDiff / totalTicksDiff) * 100;
      }
      loadPercent = Math.max(0, Math.min(100, loadPercent));
      history.push(loadPercent);
      if (history.length > maxDataPoints) history.shift();

      loadValueEl.textContent = "LOAD: " + loadPercent.toFixed(2) + "%";
      chrome.storage.local.set({ history });
      drawGraph();
    }
    prevCpuInfo = cpuInfo;
  });
}

function drawGraph() {
  const currentTheme = themes[config.theme] || themes['classic'];
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = currentTheme.bg;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = currentTheme.border;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

  let maxLoadVal = 20;
  for (const p of history) {
    if (p > maxLoadVal) maxLoadVal = p;
  }
  maxLoadVal = Math.ceil(maxLoadVal / 10) * 10;
  if (maxLoadVal > 100) maxLoadVal = 100;

  scaleValueEl.textContent = "SCALE: " + maxLoadVal + "% MAX";

  if (config.showGrid) {
    ctx.strokeStyle = currentTheme.grid;
    ctx.setLineDash([2, 3]);
    const colWidth = w / 5;
    for (let i = 1; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.floor(i * colWidth) + 0.5, 0);
      ctx.lineTo(Math.floor(i * colWidth) + 0.5, h);
      ctx.stroke();
    }
    const rowHeight = h / 4;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, Math.floor(i * rowHeight) + 0.5);
      ctx.lineTo(w, Math.floor(i * rowHeight) + 0.5);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  if (history.length > 1) {
    const step = (w - 2) / (maxDataPoints - 1);
    ctx.beginPath();
    ctx.moveTo(1, h - 1);
    for (let i = 0; i < history.length; i++) {
      const val = history[i];
      const x = 1 + i * step;
      const normY = val / maxLoadVal;
      const y = h - 1 - (normY * (h - 2));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(1 + (history.length - 1) * step, h - 1);
    ctx.closePath();

    ctx.fillStyle = currentTheme.fill;
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < history.length; i++) {
      const val = history[i];
      const x = 1 + i * step;
      const normY = val / maxLoadVal;
      const y = h - 1 - (normY * (h - 2));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = currentTheme.line;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}