import { ipcMain, BrowserWindow } from "electron";

ipcMain.handle("app:get-version", async () => "1.0.0");
ipcMain.on("app:log", (_e, msg: string) => {
  console.log(msg);
});

console.log("main");
void BrowserWindow;
