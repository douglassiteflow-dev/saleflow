const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require("electron");
const path = require("path");

// Production API URL
const API_URL = "https://saleflow-staging.fly.dev";

let mainWindow = null;
let tray = null;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: "Saleflow Dialer",
    icon: path.join(__dirname, "icons", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: "#F8FAFC",
    show: false,
  });

  // Load the standalone dialer (no sidebar/topbar)
  mainWindow.loadURL(`${API_URL}/app`);

  // Show when ready
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Handle external links — open in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Intercept navigation — keep user in dialer
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const parsed = new URL(url);
    // Only allow /app, /login, and auth routes — everything else redirects to /app
    if (parsed.origin === new URL(API_URL).origin) {
      const allowedPaths = ["/app", "/login", "/forgot-password", "/reset-password"];
      const isAllowed = allowedPaths.some((p) => parsed.pathname.startsWith(p)) || parsed.pathname.startsWith("/api/");

      if (!isAllowed) {
        event.preventDefault();
        mainWindow.loadURL(`${API_URL}/app`);
      }
    }
  });

  // Catch client-side routing that lands on wrong page
  mainWindow.webContents.on("did-navigate-in-page", (_event, url) => {
    const parsed = new URL(url);
    if (parsed.origin === new URL(API_URL).origin) {
      const p = parsed.pathname;
      if (p !== "/app" && p !== "/login" && !p.startsWith("/forgot") && !p.startsWith("/reset")) {
        mainWindow.webContents.executeJavaScript(`
          window.history.replaceState(null, '', '/app');
          window.dispatchEvent(new PopStateEvent('popstate'));
        `);
      }
    }
  });

  // Minimize to tray instead of closing
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, "icons", "tray-icon.png");
  let trayIcon;

  try {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch {
    // Fallback if icon doesn't exist
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip("Saleflow Dialer");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Öppna Saleflow",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: "Avsluta",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("activate", () => {
  if (mainWindow) {
    mainWindow.show();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
