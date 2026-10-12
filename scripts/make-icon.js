// Draws the app icon (MoM cheering on a red tile) from the same code that draws MoM.
// Writes build/icon.png (1024 px, which electron-builder turns into .icns and .ico) and src/assets/icon.png (256 px, the tray icon).
// Usage: npm run icon
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ show: false, width: 300, height: 300 });
    await win.loadFile(path.join(root, 'src', 'renderer', 'icon.html'));
    const images = await win.webContents.executeJavaScript('window.renderIcon()');
    for (const [file, dataUrl] of [['build/icon.png', images.large], ['src/assets/icon.png', images.small]]) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), Buffer.from(dataUrl.split(',')[1], 'base64'));
      console.log(`Wrote ${file}`);
    }
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  }
  app.quit();
});
