'use strict';
const CameraWorkflows = (() => {
  const esc = value => CameraStudio.esc(value);
  const apiCall = (name, body) => {
    if(location.protocol==='file:') throw new Error('هذه العملية تحتاج تشغيل البرنامج من run.bat لحفظ البيانات في قاعدة الصيدلية.');
    return _api(name, body===undefined?{}:{body});
  };
  function sheet(title, body, footer='') {
    const dialog=document.createElement('dialog');dialog.className='capture-dialog';dialog.setAttribute('aria-label',title);
    dialog.innerHTML=`<header class="capture-head"><h2>${esc(title)}</h2><button type="button" data-close aria-label="إغلاق">✕</button></header><div class="capture-body">${body}</div>${footer?`<footer class="capture-foot">${footer}</footer>`:''}`;
    document.body.append(dialog);dialog.showModal();
    const close=()=>{dialog.close();dialog.remove();document.removeEventListener('pharmacy:navigate',close);};dialog.querySelector('[data-close]').onclick=close;
    document.addEventListener('pharmacy:navigate',close);
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('keydown',e=>e.stopPropagation());
    return {dialog,close};
  }
  async function resolve(code) {
    const raw=await apiCall(`scan_resolve?code=${encodeURIComponent(code)}`);
    return raw?{...DB._normMed(raw),scanQuantity:Number(raw.scan_quantity)||1,scanUnit:raw.scan_unit||raw.sale_unit||raw.unit}:null;
  }
  function scan({title='مسح صنف بالكاميرا',onAccept,acceptLabel='استخدام الصنف',context='lookup',allowAuto=false,lookup}={}) {
    return CameraStudio.open({mode:'scan',title,acceptLabel,allowAuto,
      lookup:async code=>{
        const med=await resolve(code);
        if(!med)return {title:'باركود غير مسجّل',detail:code,disabled:true,actions:[
          {label:'ربط بصنف موجود',run:()=>link(code)},
          {label:'إضافة صنف جديد',run:async()=>{if(!await DB.checkPermission('medicines'))throw new Error('لا توجد صلاحية إضافة أصناف');CameraStudio.close();App.navigate('medicines');await MedicinesPage.openAddModal();const input=document.getElementById('fMedCompanyBarcode');if(input){input.value=code;input.dispatchEvent(new Event('input'));}}}
        ]};
        if(med.scanRequiresConfiguration)return {title:med.name,detail:'وحدة هذا الباركود غير محددة. يلزم تحديد هل يمثل علبة أو شريطًا أو وحدة بيع قبل استخدامه.',disabled:true,actions:[{label:'ضبط وحدات الباركود',run:()=>configureUnits(med.id)}]};
        if(lookup)return lookup(med,code);
        const expired=med.expiry&&med.expiry<new Date().toLocaleDateString('en-CA');
        const disabled=context==='sale'&&med.sellableStock<med.scanQuantity;
        return {med,title:med.name,detail:`${med.scientificName||med.category||''}\n${med.scanUnit}: ${med.scanQuantity} ${med.saleUnit||med.unit} · ${Fmt.money(med.price*med.scanQuantity)}\nالمخزون: ${med.stock} ${med.saleUnit||med.unit} · المتاح للصرف: ${med.sellableStock}`,
          warning:[expired?'توجد دفعات منتهية لا تُصرف':'',med.stock<=0?'المخزون نافد':'',med.controlled?'صنف خاضع للرقابة؛ لا يمكن إصدار الفاتورة دون روشتة':''].filter(Boolean).join(' — '),disabled};
      },onAccept:async result=>onAccept?.(result.med)});
  }
  async function link(code) {
    if(!await DB.checkPermission('medicines'))throw new Error('ربط الباركود يحتاج صلاحية إدارة الأدوية');
    const meds=await DB.getMedicines();
    const {dialog,close}=sheet('ربط الباركود بوحدة مسجّلة',`<p>الباركود: <b dir="ltr">${esc(code)}</b></p><p>لن يتم تغيير الباركود الأساسي أو مخزون الصنف.</p><label>الصنف<select class="form-control" data-med><option value="">اختر الصنف</option>${meds.map(m=>`<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')}</select></label><label>اسم الوحدة<input class="form-control" data-unit placeholder="علبة / شريط / قرص"></label><label>تمثّل كام وحدة بيع؟<input class="form-control" data-quantity type="number" min="1" max="10000" value="1"></label><p data-info></p><p role="alert" data-error></p>`,`<button type="button" class="capture-primary" data-save>تأكيد الربط</button>`);
    dialog.querySelector('[data-med]').onchange=e=>{const m=meds.find(x=>x.id===e.target.value);dialog.querySelector('[data-info]').textContent=m?`وحدة البيع: ${m.saleUnit||m.unit}. وحدة الشراء: ${m.purchaseUnit} = ${m.conversionFactor} وحدة بيع.`:'';};
    dialog.querySelector('[data-save]').onclick=async e=>{e.target.disabled=true;try{await apiCall('link_barcode',{barcode:code,medicine_id:dialog.querySelector('[data-med]').value,unit:dialog.querySelector('[data-unit]').value,quantity:Number(dialog.querySelector('[data-quantity]').value)});close();Toast.ok('تم الربط','أعد مسح الباركود لاستخدام الوحدة الجديدة');}catch(err){dialog.querySelector('[data-error]').textContent=err.message;e.target.disabled=false;}};
  }
  function album(host, initial=[], onChange=()=>{}) {
    let images=[...initial].filter(Boolean),working=false;
    const refresh=(notify=true)=>{
      if(notify)onChange([...images]);
      host.innerHTML=`<div class="camera-actions"><button type="button" class="btn btn-primary" data-photo><i class="fas fa-camera"></i> تصوير صفحة</button><button type="button" class="btn btn-ghost" data-files>اختيار صور</button><input data-input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></div><p>حتى 5 صفحات · راجع وضوح النص قبل ربط الروشتة.</p><div class="photo-album">${images.map((image,i)=>`<figure><img src="${image}" alt="صفحة ${i+1}"><figcaption><button type="button" data-view="${i}">تكبير ${i+1}</button><button type="button" data-remove="${i}" aria-label="حذف الصفحة ${i+1}">حذف</button>${i?`<button type="button" data-up="${i}" aria-label="تقديم الصفحة ${i+1}">↑</button>`:''}</figcaption></figure>`).join('')}</div>`;
      host.querySelector('[data-photo]').onclick=()=>{if(images.length>=5){Toast.warn('الحد الأقصى خمس صفحات');return;}CameraStudio.open({title:'تصوير صفحة الروشتة',onPhoto:async image=>{images.push(image);refresh();}});};
      host.querySelector('[data-files]').onclick=()=>host.querySelector('[data-input]').click();
      host.querySelector('[data-input]').onchange=async e=>{if(working)return;working=true;try{const files=[...e.target.files];if(images.length+files.length>5)throw new Error('الحد الأقصى خمس صور');const added=[];for(const file of files)added.push(await CameraStudio.compressFile(file));images.push(...added);refresh();}catch(err){Toast.err('تعذر إضافة الصور',err.message);}finally{working=false;}};
      host.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>showImages([images[+b.dataset.view]],'معاينة صفحة الروشتة'));
      host.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{images.splice(+b.dataset.remove,1);refresh();});
      host.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>{const i=+b.dataset.up;[images[i-1],images[i]]=[images[i],images[i-1]];refresh();});
    };refresh(false);return {images:()=>{if(working)throw new Error('انتظر انتهاء تجهيز الصور');return [...images];}};
  }
  function showImages(images,title='صور الروشتة') {
    sheet(title,images.length?images.map((src,i)=>`<p>صفحة ${i+1}</p><img src="${esc(src)}" alt="صفحة ${i+1}" style="display:block;width:100%;height:auto;margin-bottom:20px">`).join(''):'<p>لا توجد صور محفوظة لهذه الروشتة.</p>');
  }
  async function viewPrescription(saleId){try{const rx=await apiCall(`prescription_images/${encodeURIComponent(saleId)}`);if(!rx){Toast.info('لا توجد روشتة مرتبطة بالفاتورة');return;}showImages(rx.images,`روشتة د. ${rx.doctor}`);}catch(err){Toast.err('تعذر عرض الروشتة',err.message);}}

  async function count({scope='inventory',purchase=null,onApply}={}) {
    let draft;
    try{draft=await apiCall(`scan_draft/${encodeURIComponent(scope)}`);}catch(e){Toast.err('تعذر فتح المسودة',e.message);return;}
    let items=draft.items,version=draft.version,busy=false,undo=[];
    const {dialog,close}=sheet(purchase?'مراجعة الاستلام بالمسح':'الجرد بالكاميرا',`<p class="scan-draft-summary">المسودة محفوظة لحسابك ويمكن استكمالها لاحقًا. الكميات هنا بوحدة البيع. لا يتم تعديل المخزون من شاشة المسح.</p><div class="camera-actions"><button type="button" class="capture-primary" data-scan>مسح صنف</button><button type="button" data-undo>تراجع عن آخر تعديل</button><button type="button" data-clear>مسودة جديدة</button><label><input type="checkbox" data-repeat> عدّ العلب المتكررة</label><button type="button" data-export>تصدير المراجعة CSV</button></div><p data-note role="status"></p><div class="tbl-wrap"><table class="dtable"><thead><tr><th>الصنف</th><th>المعدود بوحدة البيع</th><th>${purchase?'المطلوب المتبقي':'الرصيد الحالي'}</th><th>الفرق</th></tr></thead><tbody data-rows></tbody></table></div>`,purchase?'<button type="button" class="capture-primary" data-apply>نقل الكميات لشاشة الاستلام للمراجعة</button>':'');
    const meds=await DB.getMedicines();if(!dialog.isConnected)return;
    const expected=id=>{const med=meds.find(m=>m.id===id);if(!purchase)return med?.stock||0;return purchase.items.filter(i=>i.med_id===id).reduce((sum,i)=>sum+(i.qty_ordered-i.qty_received)*(i.conversion_factor||1),0);};
    const render=()=>{dialog.querySelector('[data-rows]').innerHTML=items.map((item,i)=>`<tr><td>${esc(item.name)}</td><td><input aria-label="كمية ${esc(item.name)}" class="form-control" type="number" min="0" max="1000000" data-index="${i}" value="${item.quantity}"></td><td>${expected(item.id)}</td><td>${item.quantity-expected(item.id)}</td></tr>`).join('')||'<tr><td colspan="4">ابدأ بمسح أول صنف.</td></tr>';dialog.querySelectorAll('[data-index]').forEach(input=>input.onchange=()=>save(items.map((item,i)=>i===+input.dataset.index?{...item,quantity:Number(input.value)}:item)).catch(()=>{}));};
    async function save(next,record=true){if(busy)throw new Error('انتظر حفظ التعديل السابق');busy=true;dialog.querySelector('[data-note]').textContent='جارٍ حفظ المسودة…';try{const saved=await apiCall(`scan_draft/${encodeURIComponent(scope)}`,{items:next,version});if(record){undo.push(items.map(x=>({...x})));if(undo.length>20)undo.shift();}items=saved.items;version=saved.version;dialog.querySelector('[data-note]').textContent='تم الحفظ — المخزون لم يتغير';render();}catch(e){dialog.querySelector('[data-note]').textContent=e.message;render();throw e;}finally{busy=false;}}
    dialog.querySelector('[data-scan]').onclick=()=>scan({title:purchase?'مسح أصناف الاستلام':'عدّ الأصناف للجرد',acceptLabel:'تسجيل المسحة',allowAuto:true,
      lookup:(med)=>{const target=purchase?.items.some(i=>i.med_id===med.id);return {med,title:med.name,detail:`كل مسحة = ${med.scanQuantity} ${med.saleUnit||med.unit}\n${purchase?'المطلوب المتبقي':'المخزون'}: ${expected(med.id)}`,disabled:purchase&&!target,warning:purchase&&!target?'الصنف غير موجود في أمر الشراء. لن تتم إضافته للمسودة.':''};},
      onAccept:async med=>{const old=items.find(i=>i.id===med.id);if(old&&!dialog.querySelector('[data-repeat]').checked)throw new Error('الصنف موجود. فعّل عدّ العلب المتكررة أو عدّل الكمية من الجدول.');const next=items.map(i=>({...i}));const row=next.find(i=>i.id===med.id);if(row)row.quantity+=med.scanQuantity;else next.push({id:med.id,name:med.name,quantity:med.scanQuantity});await save(next);}});
    dialog.querySelector('[data-undo]').onclick=async()=>{if(!undo.length||busy)return;const previous=undo[undo.length-1];try{await save(previous,false);undo.pop();}catch(_){}};
    dialog.querySelector('[data-clear]').onclick=()=>{
      if(busy||!items.length)return;
      const confirmation=sheet('بدء مسودة جديدة','<p>سيتم تفريغ العدّ الحالي فقط، ولن يتغير المخزون. يمكنك التراجع ما دامت شاشة الجرد مفتوحة.</p>','<button type="button" class="capture-primary" data-confirm>تفريغ المسودة</button>');
      confirmation.dialog.querySelector('[data-confirm]').onclick=async event=>{event.currentTarget.disabled=true;try{await save([]);confirmation.close();}catch(_){confirmation.close();}};
    };
    dialog.querySelector('[data-export]').onclick=()=>exportCSV(purchase?'مراجعة_الاستلام':'مسودة_الجرد',['الصنف','المعدود بوحدة البيع','المتوقع','الفرق'],items.map(i=>[i.name,i.quantity,expected(i.id),i.quantity-expected(i.id)]));
    dialog.querySelector('[data-apply]')?.addEventListener('click',async()=>{if(busy)return;try{const received={};for(const item of items){const med=meds.find(m=>m.id===item.id),factor=purchase.items.find(i=>i.med_id===item.id)?.conversion_factor||1;if(item.quantity%factor)throw new Error(`${item.name}: الكمية لا تمثل وحدات شراء كاملة (${factor} وحدات بيع لكل ${med?.purchaseUnit})`);let quantity=item.quantity/factor;const matches=purchase.items.filter(i=>i.med_id===item.id);if(quantity>matches.reduce((s,i)=>s+i.qty_ordered-i.qty_received,0))throw new Error(`${item.name}: الكمية أكبر من المتبقي في أمر الشراء`);for(const line of matches){const take=Math.min(quantity,line.qty_ordered-line.qty_received);received[line.id]=take;quantity-=take;}}await onApply?.(received);close();}catch(e){dialog.querySelector('[data-note]').textContent=e.message;}});
    render();
  }
  async function configureUnits(mid) {
    try {
      const data=await apiCall(`barcode_units/${encodeURIComponent(mid)}`);
      const {dialog,close}=sheet('وحدات الباركود — '+data.name,
        `<p>وحدة البيع: <b>${esc(data.saleUnit)}</b> · ${esc(data.purchaseUnit)} = ${data.factor} ${esc(data.saleUnit)}. الأرقام لا تغيّر المخزون.</p>
        ${data.entries.map((item,i)=>`<fieldset style="margin:12px 0;padding:14px;border:1px solid var(--border);border-radius:8px"><legend dir="ltr">${esc(item.barcode)}</legend><label>نوع العبوة<input class="form-control" data-unit="${i}" value="${esc(item.unit||'')}" placeholder="علبة / شريط / قرص"></label><label>عدد وحدات البيع في المسحة<input class="form-control" data-qty="${i}" type="number" min="1" max="10000" value="${item.quantity??''}" placeholder="مثال: 20"></label><small>لو الباركود على علبة كاملة، اكتب عدد وحدات البيع داخلها.</small></fieldset>`).join('')}<p role="alert" data-error></p>`,
        '<button type="button" class="capture-primary" data-save>حفظ وحدات الباركود</button>');
      dialog.querySelector('[data-save]').onclick=async event=>{
        event.currentTarget.disabled=true;
        try {
          const entries=data.entries.map((item,i)=>({barcode:item.barcode,unit:dialog.querySelector(`[data-unit="${i}"]`).value,quantity:Number(dialog.querySelector(`[data-qty="${i}"]`).value)}));
          await apiCall(`barcode_units/${encodeURIComponent(mid)}`,{entries});close();Toast.ok('تم تحديد الوحدات','أعد مسح الباركود لاستخدام الإعداد الجديد');
        } catch(error){dialog.querySelector('[data-error]').textContent=error.message;event.currentTarget.disabled=false;}
      };
    }catch(error){Toast.err('تعذر ضبط الباركود',error.message);}
  }
  return {scan,resolve,album,count,viewPrescription,link,configureUnits};
})();
