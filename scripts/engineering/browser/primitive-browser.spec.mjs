import {test,expect,_electron} from '@playwright/test';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const desktopRequire=createRequire(path.join(root,'apps/desktop/package.json'));
async function verify(page,testInfo){
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await expect(page.getByRole('heading',{name:'Ocean primitive regression fixture'})).toBeVisible();
 const increment=page.getByRole('button',{name:'Increment'});
 await increment.click();
 await expect(page.getByLabel('Clicks')).toHaveText('1');
 await expect(page.getByRole('button',{name:'Disabled',exact:true})).toBeDisabled();
 await expect(page.getByRole('link',{name:'Link'})).toHaveAttribute('href','#anchor');
 const email=page.getByRole('textbox',{name:'Email'});
 await email.fill('ocean@example.com');
 await expect(email).toHaveValue('ocean@example.com');
 await expect(email).toHaveCSS('height','36px');
 for(const profile of ['legacy','shared']){
  const trigger=page.getByRole('button',{name:'Open '+profile+' dialog'});
  await trigger.click();
  const dialog=page.getByRole('dialog',{name:profile+' dialog'});
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS('z-index',profile==='legacy'?'50':'10000');
  await expect(dialog).toHaveCSS('position','fixed');
  await expect(dialog.getByRole('textbox')).toBeFocused();
  await dialog.getByRole('textbox').fill('edited');
  await expect(dialog.getByRole('textbox')).toHaveValue('edited');
  await page.screenshot({path:testInfo.outputPath(profile+'-dialog.png'),animations:'disabled'});
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  const menuTrigger=page.getByRole('button',{name:'Open '+profile+' menu'});
  await menuTrigger.focus();
  await page.keyboard.press('Enter');
  const menu=page.getByRole('menu');
  await expect(menu).toBeVisible();
  const item=menu.getByRole('menuitem',{name:'Select item'});
  await expect(item).toBeFocused();
  await expect(item.locator('svg')).toHaveCSS('width',profile==='legacy'?'32px':'16px');
  await expect(menu.getByRole('menuitem',{name:'Disabled item'})).toHaveAttribute('data-disabled','');
  await page.screenshot({path:testInfo.outputPath(profile+'-menu.png'),animations:'disabled'});
  await page.keyboard.press('Enter');
  await expect(page.getByLabel(profile+' selection')).toHaveText('selected');
  await expect(menu).toBeHidden();
  await expect(menuTrigger).toBeFocused();
 }
 expect(errors).toEqual([]);
}
test('Next.js browser: native primitive interactions and style contracts',async({page},testInfo)=>{
 await page.goto('http://127.0.0.1:5191/engineering-ui-fixture');
 await verify(page,testInfo);
});
test('Electron renderer: native primitive interactions and style contracts',async({},testInfo)=>{
 const electron=await _electron.launch({executablePath:desktopRequire('electron'),args:[path.join(root,'scripts/engineering/browser/electron-main.cjs'),'--no-sandbox'],env:{...process.env}});
 try{
  const page=await electron.firstWindow();
  await verify(page,testInfo);
 }finally{await electron.close()}
});
