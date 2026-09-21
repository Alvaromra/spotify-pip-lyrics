const path = require("node:path");
const { app, BrowserWindow, globalShortcut, ipcMain, shell } = require("electron");

const auth = require("./auth.cjs");
const spotify = require("./spotify.cjs");
const lyrics = require("./lyrics.cjs");

// ---------------------------------------------------------------------------
// Flags de GPU / overlay
// ---------------------------------------------------------------------------

app.commandLine.appendSwitch("enable-transparent-visuals");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("ignore-gpu-blocklist");

const isDev = !app.isPackaged;
const DEV_URL = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";

let win = null;
let topMostTimer = null;

const state = {
  karaoke: false,
  clickThrough: false,
  gamerMode: false,
};

// ---------------------------------------------------------------------------

function createWindow() {
  win = new BrowserWindow({
    width: 520,
    height: 720,
    transparent: true,
    frame: false,
    resizable: true,
    movable: true,
    skipTaskbar: true,
    hasShadow: false,
    roundedCorners: false,
    thickFrame: false,
    focusable: true,
    fullscreenable: false,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    visualEffectState: "active",
    webPreferences: {
      // Sem nodeIntegration: o renderer carrega conteudo servido por HTTP.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  if (isDev) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  // Nada abre janela dentro do app: links vao para o navegador do sistema.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(false);

  // Reforca o topo periodicamente porque alguns jogos em fullscreen roubam a
  // camada. O timer e limpo no close para nao vazar.
  topMostTimer = setInterval(() => {
    if (win && !win.isDestroyed() && win.isVisible()) win.moveTop();
  }, 3000);

  win.on("closed", () => {
    clearInterval(topMostTimer);
    topMostTimer = null;
    win = null;
  });
}

// ---------------------------------------------------------------------------
// Atalhos globais
// ---------------------------------------------------------------------------

function register(accelerator, handler) {
  const ok = globalShortcut.register(accelerator, handler);
  if (!ok) console.warn("Falha ao registrar hotkey:", accelerator);
}

function withWindow(fn) {
  return () => {
    if (win && !win.isDestroyed()) fn(win);
  };
}

function registerShortcuts() {
  register(
    "CommandOrControl+Alt+K",
    withWindow((w) => {
      state.karaoke = !state.karaoke;
      w.webContents.send("toggle-karaoke", state.karaoke);
    })
  );

  register(
    "CommandOrControl+Alt+G",
    withWindow((w) => {
      state.gamerMode = !state.gamerMode;
      w.setOpacity(state.gamerMode ? 0.28 : 1);
    })
  );

  register(
    "CommandOrControl+Alt+R",
    withWindow((w) => {
      state.gamerMode = false;
      state.clickThrough = false;
      w.setOpacity(1);
      w.setIgnoreMouseEvents(false);
    })
  );

  register(
    "CommandOrControl+Alt+X",
    withWindow((w) => {
      state.clickThrough = !state.clickThrough;
      w.setIgnoreMouseEvents(state.clickThrough, { forward: true });
    })
  );

  register(
    "CommandOrControl+Alt+H",
    withWindow((w) => {
      if (w.isVisible()) {
        w.hide();
      } else {
        w.show();
        w.moveTop();
      }
    })
  );

  register(
    "CommandOrControl+Alt+=",
    withWindow((w) => w.setOpacity(Math.min(w.getOpacity() + 0.05, 1)))
  );

  register(
    "CommandOrControl+Alt+-",
    withWindow((w) => w.setOpacity(Math.max(w.getOpacity() - 0.05, 0.1)))
  );

  register(
    "CommandOrControl+Alt+B",
    withWindow((w) => {
      if (w.isMinimized()) {
        w.restore();
        w.moveTop();
      } else {
        w.minimize();
      }
    })
  );

  // DevTools so em desenvolvimento.
  if (isDev) {
    register(
      "CommandOrControl+Alt+J",
      withWindow((w) => w.webContents.toggleDevTools())
    );
  }
}

// ---------------------------------------------------------------------------
// IPC: mantem main e renderer com o mesmo estado de karaoke
// ---------------------------------------------------------------------------

ipcMain.on("set-karaoke", (_event, enabled) => {
  state.karaoke = Boolean(enabled);
});

// Allowlist: o renderer so consegue abrir http(s), e so no host da propria API.
const EXTERNAL_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "accounts.spotify.com",
  "open.spotify.com",
]);

function openExternal(rawUrl) {
  let url;

  try {
    url = new URL(rawUrl);
  } catch {
    return;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (!EXTERNAL_HOSTS.has(url.hostname)) return;

  shell.openExternal(url.toString());
}

ipcMain.on("open-external", (_event, url) => openExternal(url));

// ---------------------------------------------------------------------------
// IPC do Spotify
// ---------------------------------------------------------------------------

// Erro cru do main nao atravessa o IPC de forma util: vira string. Entao cada
// handler devolve um envelope com `ok`, e o renderer decide o que mostrar.
function fail(err) {
  return { ok: false, status: err.status ?? 500, error: err.message, retryAfter: err.retryAfter };
}

ipcMain.handle("spotify:status", () => ({
  ok: true,
  configured: auth.isConfigured(),
  authenticated: auth.isAuthenticated(),
}));

ipcMain.handle("spotify:login", async () => {
  try {
    await auth.login();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
});

ipcMain.handle("spotify:logout", () => {
  auth.logout();
  return { ok: true };
});

ipcMain.handle("spotify:now-playing", async () => {
  try {
    return { ok: true, ...(await spotify.nowPlaying()) };
  } catch (err) {
    return fail(err);
  }
});

ipcMain.handle("spotify:lyrics", async (_event, track) => {
  try {
    return { ok: true, ...(await lyrics.lookup(track ?? {})) };
  } catch (err) {
    return fail(err);
  }
});

// ---------------------------------------------------------------------------

// Uma instancia so: evita dois overlays sobrepostos.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win && !win.isDestroyed()) {
      win.show();
      win.moveTop();
    }
  });

  app.whenReady().then(() => {
    auth.init();

    createWindow();
    registerShortcuts();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
