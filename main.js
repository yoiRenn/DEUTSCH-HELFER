const { app, BrowserWindow } = require('electron')
const path = require('path')

function createWindow() {
    const win = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            // 关键：允许读取本地文件，解决 fetch 跨域问题
            webSecurity: false,
            nodeIntegration: true,
            contextIsolation: false
        },
        // 隐藏默认菜单栏（可选）
        autoHideMenuBar: true
    })

    // 加载你的 index.html
    win.loadFile('index.html')
}

app.whenReady().then(() => {
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})