const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const memory=new Map();
const ctx=vm.createContext({window:{location:{protocol:'http:'}},location:{protocol:'http:'},console,setTimeout,clearTimeout,
  localStorage:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)}});
vm.runInContext(fs.readFileSync('src/js/data.js','utf8')+'\nthis.testDB=DB;',ctx);
const med=ctx.testDB._normMed({id:'M1',price:10,cost:4,stock:100,controlled:1,purchase_unit:'علبة',sale_unit:'قرص',conversion_factor:20,has_image:1,sellable_stock:80});
assert.equal(med.conversionFactor,20);assert.equal(med.controlled,true);assert.equal(med.sellableStock,80);
assert.equal(med.imageData,undefined);assert.equal(med.imageUrl,'/api/medicine_image/M1');
assert.equal(Object.hasOwn(ctx.testDB._toSnakeMed(med),'image_data'),false);
let serverVersion=0,posted=[];const status={textContent:''};
const draft=vm.createContext({console,crypto:require('node:crypto').webcrypto,location:{protocol:'http:'},
  Auth:{getCurrent:()=>({id:'cashier'})},window:{addEventListener(){}},document:{getElementById:()=>status},
  _api:async(name,options)=>{if(!options)return null;assert.equal(options.body.version,serverVersion);posted.push(options.body);return {version:++serverVersion};}});
vm.runInContext(fs.readFileSync('src/js/pos-draft.js','utf8')+'\nthis.drafts=PosDraft;',draft);
(async()=>{
  await draft.drafts.load();draft.drafts.save({cart:[{qty:1}]});draft.drafts.save({cart:[{qty:2}]});
  const meta=await draft.drafts.flush();assert.equal(meta.draft_version,2);assert.equal(posted[1].payload.cart[0].qty,2);assert.equal(posted[1].owner,'cashier');
  assert.match(status.textContent,/محفوظة/);draft.drafts.completed();assert.equal((await draft.drafts.flush()).draft_version,0);
  console.log('PASS: medicine units, lightweight photos, serialized durable draft saves');
})().catch(error=>{console.error(error);process.exitCode=1;});
