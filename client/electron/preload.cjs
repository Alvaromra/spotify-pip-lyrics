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

  // Abre no navegador padrao. Sem isso, target="_blank" cria uma
  // BrowserWindow nova herdando as webPreferences do overlay: o login do
  // Spotify apareceria numa janela transparente, sem moldura e always-on-top.
  openExternal(url) {
    ipcRenderer.send("open-external", String(url));
  },
});
