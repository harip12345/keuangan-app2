// Local browser smoke check. Firebase and AI are stubbed; no live account is used.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
let playwright;
try{playwright=require('playwright');}catch{playwright=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const {chromium}=playwright;
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  for(const width of [320,390,1280]){
   const page=await browser.newPage({viewport:{width,height:844}});
   page.setDefaultTimeout(5000);
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname!=='finance.local')return route.abort();
    if(url.pathname==='/api/ai-chat')return route.fulfill({json:{reply:'Contoh respons panjang: '+ 'https://contoh.test/'.repeat(35)+'\n**Ringkasan**\nKeuangan Anda tercatat.'}});
    const file=path.resolve(url.pathname==='/app'?'app.html':'.'+url.pathname);
    if(!file.startsWith(process.cwd()+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
    return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html'});
   });
   await page.addInitScript(()=>{
    const empty={exists:false,docs:[],metadata:{fromCache:false},forEach(){}};
    const chain={doc(){return this},collection(){return this},orderBy(){return this},limit(){return this},get:async()=>empty,onSnapshot(){return ()=>{}},enablePersistence:async()=>{}};
    const auth=()=>({currentUser:null,onAuthStateChanged(){}});auth.GoogleAuthProvider=function(){};
    window.firebase={initializeApp(){},auth,firestore:()=>chain};
   });
   await page.goto('http://finance.local/app');
   await page.evaluate(()=>{
    document.getElementById('appSplash')?.remove();
    document.getElementById('cloudLoader')?.remove();
    document.getElementById('loginScreen').style.display='none';
    document.getElementById('mainAppContainer').style.display='flex';
    wallets=['Tunai'];renderWalletOptions();switchView('transaksi');
   });
   await page.locator('#fabAddBtn').click();
   await page.locator('#viewCatat').waitFor({state:'visible'});
   assert.equal(await page.locator('#viewTransaksi').evaluate(el=>!el.classList.contains('hidden')),true);
   const box=await page.locator('.transaction-dialog').boundingBox();
   assert.ok(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=845);
   await page.keyboard.press('Escape');
   await page.locator('#viewCatat').waitFor({state:'hidden'});
   await page.evaluate(()=>toggleAiModal());
   await page.waitForTimeout(50);
   await page.evaluate(()=>performAiClose());
   await page.evaluate(()=>toggleAiModal());
   await page.waitForTimeout(400);
   assert.equal(await page.locator('#aiModal').isVisible(),true,'quick reopen stays visible');
   await page.locator('#aiChatInput').fill('Analisis pengeluaran saya');
   await page.locator('#aiSendBtn').click();
   await page.locator('.ai-bubble-bot').filter({hasText:'Contoh respons panjang'}).waitFor();
   const dims=await page.locator('#aiChatMessages').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));
   assert.ok(dims.scroll<=dims.width+1,'long response stays within chat');
   const inputBox=await page.locator('#aiChatInput').boundingBox();
   assert.ok(inputBox.y+inputBox.height<=844,'chat input stays inside viewport');
   await page.evaluate(()=>{
    Object.defineProperty(window,'visualViewport',{configurable:true,value:{height:480,offsetTop:0,addEventListener(){}}});
    adjustDrawerForKeyboard();
   });
   const keyboardInputBox=await page.locator('#aiChatInput').boundingBox();
   assert.ok(keyboardInputBox.y+keyboardInputBox.height<=480,'input stays above simulated keyboard');
   assert.deepEqual(errors,[]);
   console.log(`UI smoke OK: ${width}px (popup, quick reopen, long reply, input position)`);
   await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
