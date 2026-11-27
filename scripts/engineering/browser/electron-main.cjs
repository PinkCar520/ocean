const {app,BrowserWindow}=require('electron');
app.whenReady().then(async()=>{
 const window=new BrowserWindow({width:1280,height:800,show:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
 await window.loadURL('http://127.0.0.1:5192/engineering-ui-fixture/');
});
app.on('window-all-closed',()=>app.quit());
