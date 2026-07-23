import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("prismDesktop", {
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  log: (msg: string) => ipcRenderer.send("app:log", msg),
});
