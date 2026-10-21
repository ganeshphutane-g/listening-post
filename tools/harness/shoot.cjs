// Electron harness: open a page, forward its console, wait for document.title === 'SHOT_READY',
// save a PNG. Usage: electron shoot.cjs <url> <out.png> [mode]   mode: webgpu-vulkan | webgpu-swiftshader | webgl
// In a cloud session: xvfb-run -a .tools/bin/electron --no-sandbox tools/harness/shoot.cjs ... (root needs
// --no-sandbox on the command line; appendSwitch below is too late for Electron's root check).
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const args = process.argv.slice(process.argv.findIndex((a) => a.endsWith('shoot.cjs')) + 1);
const [url, out, mode = 'webgpu-vulkan'] = args;
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
if (mode === 'webgpu-vulkan') { app.commandLine.appendSwitch('enable-features', 'Vulkan'); app.commandLine.appendSwitch('use-vulkan', 'native'); }
if (mode === 'webgpu-swiftshader') app.commandLine.appendSwitch('use-webgpu-adapter', 'swiftshader');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 960, height: 540, useContentSize: true, show: true, webPreferences: { backgroundThrottling: false } });
  win.webContents.on('console-message', (e) => console.log('PAGE:', e.message ?? e));
  const t0 = Date.now();
  await win.loadURL(url);
  const probe = await win.webContents.executeJavaScript(`(async()=>{ if(!navigator.gpu) return 'navigator.gpu missing'; const a = await navigator.gpu.requestAdapter(); if(!a) return 'no adapter'; const i = a.info || {}; return 'adapter: ' + [i.vendor, i.architecture, i.description].filter(Boolean).join(' / '); })()`);
  console.log('WEBGPU_PROBE', probe);
  const deadline = Date.now() + 15 * 60 * 1000;
  while (win.webContents.getTitle() !== 'SHOT_READY' && Date.now() < deadline) await new Promise((r) => setTimeout(r, 500));
  const dataUrl = await win.webContents.executeJavaScript('window.__png || null');
  if (dataUrl) fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  else fs.writeFileSync(out, (await win.webContents.capturePage()).toPNG());
  console.log('CAPTURE', dataUrl ? 'readback' : 'compositor');
  console.log('SHOT_SAVED', out, 'seconds', Math.round((Date.now() - t0) / 1000), 'title', win.webContents.getTitle());
  app.quit();
});
