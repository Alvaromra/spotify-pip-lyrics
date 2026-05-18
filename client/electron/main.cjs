const {
  app,
  BrowserWindow,
  globalShortcut,
} = require("electron");

//
// GPU / OVERLAY FLAGS
//
app.commandLine.appendSwitch(
  "enable-transparent-visuals"
);

app.commandLine.appendSwitch(
  "disable-renderer-backgrounding"
);

app.commandLine.appendSwitch(
  "enable-gpu-rasterization"
);

app.commandLine.appendSwitch(
  "enable-zero-copy"
);

app.commandLine.appendSwitch(
  "ignore-gpu-blocklist"
);

let win;

// Estado karaoke
let karaokeEnabled =
  false;

// Click-through
let clickThrough =
  false;

// Gamer mode
let gamerMode =
  false;

function createWindow() {

  //
  // JANELA GAMER
  //
  win =
    new BrowserWindow({

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

      // IMPORTANTE PRA JOGOS
      focusable: true,

      fullscreenable: false,

      backgroundColor:
        "#00000000",

      alwaysOnTop: true,

      visualEffectState:
        "active",

      webPreferences: {

        nodeIntegration: true,

        contextIsolation: false,

        backgroundThrottling: false,
      },
    });

  //
  // FRONTEND
  //
  win.loadURL(
    "http://localhost:5173"
  );

  //
  // OVERLAY MODE
  //
  win.setAlwaysOnTop(
    true,
    "screen-saver"
  );

  win.setVisibleOnAllWorkspaces(
    true,
    {
      visibleOnFullScreen: true,
    }
  );

  //
  // OVERLAY GAMER
  //
  win.setIgnoreMouseEvents(
    false
  );

  win.setAlwaysOnTop(
    true,
    "screen-saver",
    999
  );

  // força topo
  win.moveTop();

  //
  // REGISTRAR HOTKEY
  //
  function registerShortcut(
    shortcut,
    callback
  ) {

    const success =
      globalShortcut.register(
        shortcut,
        callback
      );

    if (!success) {

      console.log(
        "Falha ao registrar:",
        shortcut
      );

    } else {

      console.log(
        "Hotkey registrada:",
        shortcut
      );
    }
  }

  //
  // HOTKEY KARAOKE
  //
  registerShortcut(
    "CommandOrControl+Alt+K",
    () => {

      karaokeEnabled =
        !karaokeEnabled;

      win.webContents.send(
        "toggle-karaoke",
        karaokeEnabled
      );

      console.log(
        "Karaoke:",
        karaokeEnabled
      );
    }
  );

  //
  // HOTKEY GAMER MODE
  //
  registerShortcut(
    "CommandOrControl+Alt+G",
    () => {

      gamerMode =
        !gamerMode;

      if (gamerMode) {

        // modo gamer
        win.setOpacity(
          0.28
        );

        console.log(
          "Gamer Mode ON"
        );

      } else {

        // modo normal
        win.setOpacity(
          1
        );

        console.log(
          "Gamer Mode OFF"
        );
      }
    }
  );

  //
  // HOTKEY RESTORE NORMAL
  //
  registerShortcut(
    "CommandOrControl+Alt+R",
    () => {

      gamerMode =
        false;

      clickThrough =
        false;

      win.setOpacity(
        1
      );

      win.setIgnoreMouseEvents(
        false
      );

      console.log(
        "Overlay Restaurado"
      );
    }
  );

  //
  // HOTKEY CLICK THROUGH
  //
  registerShortcut(
    "CommandOrControl+Alt+X",
    () => {

      clickThrough =
        !clickThrough;

      win.setIgnoreMouseEvents(
        clickThrough,
        {
          forward: true,
        }
      );

      console.log(
        "Click Through:",
        clickThrough
      );
    }
  );

  //
  // HOTKEY HIDE / SHOW
  //
  registerShortcut(
    "CommandOrControl+Alt+H",
    () => {

      if (
        win.isVisible()
      ) {

        win.hide();

        console.log(
          "Overlay Hidden"
        );

      } else {

        win.show();

        win.moveTop();

        console.log(
          "Overlay Visible"
        );
      }
    }
  );

  //
  // HOTKEY DEVTOOLS
  //
  registerShortcut(
    "CommandOrControl+Alt+J",
    () => {

      win.webContents.toggleDevTools();
    }
  );

  //
  // HOTKEY OPACITY +
  //
  registerShortcut(
    "CommandOrControl+Alt+=",
    () => {

      let opacity =
        win.getOpacity();

      opacity =
        Math.min(
          opacity + 0.05,
          1
        );

      win.setOpacity(
        opacity
      );

      console.log(
        "Opacity:",
        opacity
      );
    }
  );

  //
  // HOTKEY OPACITY -
  //
  registerShortcut(
    "CommandOrControl+Alt+-",
    () => {

      let opacity =
        win.getOpacity();

      opacity =
        Math.max(
          opacity - 0.05,
          0.10
        );

      win.setOpacity(
        opacity
      );

      console.log(
        "Opacity:",
        opacity
      );
    }
  );

  //
  // HOTKEY MINIMIZE
  //
  registerShortcut(
    "CommandOrControl+Alt+B",
    () => {

      if (
        win.isMinimized()
      ) {

        win.restore();

        win.moveTop();

      } else {

        win.minimize();
      }
    }
  );

  //
  // HOTKEY FULLSCREEN
  //
  registerShortcut(
    "CommandOrControl+Alt+Enter",
    () => {

      win.setFullScreen(
        !win.isFullScreen()
      );

      setTimeout(() => {

        win.moveTop();

      }, 500);
    }
  );

  //
  // MANTÉM NO TOPO
  //
  setInterval(() => {

    if (
      win &&
      !win.isDestroyed()
    ) {

      win.moveTop();
    }

  }, 3000);

  //
  // FECHAMENTO
  //
  win.on(
    "closed",
    () => {

      globalShortcut.unregisterAll();

      win = null;
    }
  );
}

//
// APP READY
//
app.whenReady().then(() => {

  createWindow();

  app.on(
    "activate",
    () => {

      if (
        BrowserWindow.getAllWindows()
          .length === 0
      ) {

        createWindow();
      }
    }
  );
});

//
// FECHAR APP
//
app.on(
  "window-all-closed",
  () => {

    globalShortcut.unregisterAll();

    if (
      process.platform !==
      "darwin"
    ) {

      app.quit();
    }
  }
);