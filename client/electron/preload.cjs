const { contextBridge, ipcRenderer } = require("electron");

// Superficie minima exposta ao renderer. Nada de `require` solto na pagina.
contextBridge.exposeInMainWorld("overlay", {
  isElectron: true,

  onKaraokeToggle(callback) {
    const handler = (_event, enabled) => callback(enabled);
    ipcRenderer.on("toggle-karaoke", handler);

    // Devolve o unsubscribe para o React limpar no cleanup do efeito.
    return () => ipcRenderer.removeListener("toggle-karaoke", handler);
  },

  setKaraoke(enabled) {
    ipcRenderer.send("set-karaoke", Boolean(enabled));
  },
});
