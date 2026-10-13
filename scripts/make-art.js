// Draws MoM's artwork from the same code that draws MoM in the app, plus the MCU logo:
//   build/icon.png              app icon, 1024 px (electron-builder turns it into .icns and .ico)
//   src/assets/icon.png         tray icon, 256 px
//   build/background(@2x).png   the macOS installer window
//   docs/banner.png             the README header
// Usage: npm run art
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

app.whenReady().then(async () => {
  try {
    const logo = fs.readFileSync(path.join(root, 'src', 'assets', 'mcu-logo.svg'));
    const win = new BrowserWindow({ show: false, width: 300, height: 300 });
    await win.loadFile(path.join(__dirname, 'art.html'));
    const dataUrl = `data:image/svg+xml;base64,${logo.toString('base64')}`;
    const images = await win.webContents.executeJavaScript(`window.renderArt(${JSON.stringify(dataUrl)})`);
    for (const [file, url] of Object.entries(images)) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), Buffer.from(url.split(',')[1], 'base64'));
      console.log(`Wrote ${file}`);
    }
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  }
  app.quit();
});
