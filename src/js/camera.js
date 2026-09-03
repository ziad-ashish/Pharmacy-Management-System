/* Shared camera workspace. No video/photo leaves this device during capture or decoding. */
'use strict';
const CameraStudio = (() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const prefKey = 'ph_camera_preferences_v1';
  let active = null, library = null;
  const preferences = () => { try { return JSON.parse(localStorage.getItem(prefKey)) || {}; } catch { return {}; } };
  function savePreferences(patch) { localStorage.setItem(prefKey, JSON.stringify({...preferences(), ...patch})); }
  const errorText = err => ({
    NotAllowedError: 'إذن الكاميرا مرفوض. اسمح به من إعدادات الموقع وخصوصية الكاميرا في Windows ثم أعد المحاولة.',
    NotFoundError: 'لا توجد كاميرا متصلة. وصّل كاميرا أو اختر صورة محفوظة.',
    NotReadableError: 'الكاميرا مشغولة أو تعذّر الوصول إليها. أغلق برنامج التصوير الآخر ثم أعد المحاولة.',
    OverconstrainedError: 'الكاميرا المختارة غير متاحة بهذه الإعدادات. اختر الكاميرا الافتراضية.',
    SecurityError: 'الوصول للكاميرا محظور. استخدم نسخة البرنامج المحلية أو اتصال HTTPS.',
  }[err?.name] || err?.message || 'تعذر تشغيل الكاميرا. يمكنك استخدام صورة محفوظة أو إدخال الباركود يدويًا.');

  // A late permission response must never resurrect a closed camera.
  function createSession(acquire) {
    let revision = 0, stream = null;
    const stop = () => { revision++; stream?.getTracks().forEach(t => t.stop()); stream = null; };
    const start = async constraints => {
      stop(); const own = revision;
      const incoming = await acquire(constraints);
      if (own !== revision) { incoming.getTracks().forEach(t => t.stop()); return null; }
      stream = incoming; return stream;
    };
    return {start, stop, current: () => stream};
  }

  async function decoder() {
    const formats = ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf','data_matrix','qr_code'];
    let native = null;
    if (window.BarcodeDetector) {
      try {
        const supported = await BarcodeDetector.getSupportedFormats();
        const usable = formats.filter(f => supported.includes(f));
        if (usable.length) native = new BarcodeDetector({formats: usable});
      } catch (_) { /* Use the bundled decoder. */ }
    }
    let reader = null;
    async function fallback(canvas) {
      if (!library) library = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'assets/vendor/zxing-browser.min.js';
        script.onload = resolve;
        script.onerror = () => { library = null; script.remove(); reject(new Error('تعذر تحميل قارئ الباركود المحلي. استخدم الإدخال اليدوي.')); };
        document.head.append(script);
      });
      await library;
      reader ||= new ZXingBrowser.BrowserMultiFormatReader();
      try { const result = reader.decodeFromCanvas(canvas); return [result.getText()]; }
      catch (e) { if (['NotFoundException','ChecksumException','FormatException'].includes(e.name) || e.constructor?.name?.includes('NotFound')) return []; return []; }
    }
    return async canvas => {
      if (native) {
        try { const hits = await native.detect(canvas); if (hits.length) return [...new Set(hits.map(r => r.rawValue))]; }
        catch (_) { native = null; }
      }
      return fallback(canvas);
    };
  }

  async function imageFromFile(file) {
    if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('اختر صورة JPG أو PNG أو WebP.');
    if (file.size > 12 * 1024 * 1024) throw new Error('الصورة أكبر من 12 ميجابايت. اختر صورة أصغر.');
    const url = URL.createObjectURL(file), image = new Image();
    try { image.src = url; await image.decode(); if (image.width * image.height > 40e6) throw new Error('أبعاد الصورة كبيرة جدًا.'); return image; }
    finally { URL.revokeObjectURL(url); }
  }
  function toCanvas(source, maxSize=1600, rotation=0, crop=0) {
    const w = source.videoWidth || source.naturalWidth || source.width;
    const h = source.videoHeight || source.naturalHeight || source.height;
    if (!w || !h) throw new Error('انتظر حتى تصبح الصورة جاهزة.');
    const sw = w * (1 - 2*crop), sh = h * (1 - 2*crop), turn = rotation % 180 !== 0;
    const ratio = Math.min(1, maxSize / Math.max(sw, sh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((turn ? sh : sw) * ratio); canvas.height = Math.round((turn ? sw : sh) * ratio);
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.translate(canvas.width/2,canvas.height/2); ctx.rotate(rotation*Math.PI/180);
    ctx.drawImage(source,w*crop,h*crop,sw,sh,-sw*ratio/2,-sh*ratio/2,sw*ratio,sh*ratio);
    return canvas;
  }
  function encode(canvas) {
    let quality = .86, data;
    do { data = canvas.toDataURL('image/jpeg',quality); quality -= .1; } while (data.length > 1350000 && quality > .4);
    if (data.length > 1400000) throw new Error('الصورة كبيرة للحفظ. قص الحواف أو اختر دقة أقل.');
    return data;
  }
  async function compressFile(file) { return encode(toCanvas(await imageFromFile(file))); }
  function qualityWarning(source) {
    const small = toCanvas(source,160), pixels = small.getContext('2d').getImageData(0,0,small.width,small.height).data;
    let sum=0, edges=0, prev=0;
    for(let i=0;i<pixels.length;i+=4){const v=(pixels[i]+pixels[i+1]+pixels[i+2])/3;sum+=v;edges+=Math.abs(v-prev);prev=v;}
    const n=pixels.length/4;
    if(sum/n<45)return 'الإضاءة تبدو ضعيفة؛ راجع وضوح النص قبل استخدام الصورة.';
    if(sum/n>242)return 'الصورة شديدة السطوع؛ تأكد أن تفاصيل المستند ظاهرة.';
    if(edges/n<3)return 'التفاصيل قليلة؛ قد تكون الصورة غير واضحة. راجعها بالحجم الكامل.';
    return 'راجع وضوح الصورة واكتمال المستند قبل الحفظ؛ الفحص الآلي لا يضمن قراءة النص.';
  }

  function close() { active?.close(); }
  function open({mode='photo', title, onPhoto, lookup, onAccept, acceptLabel='استخدام النتيجة', allowAuto=false}={}) {
    close();
    const origin = document.activeElement, prefs = preferences(), scanning = mode === 'scan';
    const dialog = document.createElement('dialog'); dialog.className='capture-dialog';
    dialog.setAttribute('aria-labelledby','captureTitle');
    dialog.innerHTML = `<header class="capture-head"><div><span class="capture-eyebrow">الشفاء · مساحة التصوير</span><h2 id="captureTitle">${esc(title || (scanning?'مسح الباركود':'تصوير مستند أو منتج'))}</h2></div><button type="button" class="capture-icon" data-close aria-label="إغلاق الكاميرا">✕</button></header>
      <div class="capture-body"><div class="capture-controls"><label>الكاميرا<select data-device><option value="">الكاميرا الافتراضية</option></select></label><label>الأداء<select data-quality><option value="normal">متوازن</option><option value="eco">اقتصادي</option></select></label><span class="capture-state" data-status role="status">متوقفة</span></div>
      <div class="capture-stage ${scanning?'is-scanner':''}"><video playsinline muted autoplay aria-hidden="true"></video><img data-preview alt="معاينة الصورة قبل الحفظ" hidden><div class="capture-placeholder"><span class="capture-symbol" aria-hidden="true"><i class="fas ${scanning?'fa-barcode':'fa-camera'}"></i></span><strong>${scanning?'وجّه باركودًا واحدًا داخل الإطار':'ضع المنتج أو المستند كاملًا داخل الصورة'}</strong><p>التشغيل بإذنك فقط · لا يتم تسجيل الفيديو</p></div><div class="capture-guide" hidden></div></div>
      <p class="capture-message" data-message role="status">اختر تشغيل الكاميرا أو استخدم صورة محفوظة.</p>
      <div class="capture-options"><label data-zoom-wrap hidden>تكبير <input type="range" data-zoom aria-label="تكبير الكاميرا"></label><button type="button" data-torch hidden>الإضاءة</button><label><input type="checkbox" data-sound ${prefs.sound?'checked':''}> صوت النتيجة</label>${allowAuto?'<label><input type="checkbox" data-auto> إضافة مباشرة بعد القراءة</label>':''}</div>
      ${scanning?'<form class="capture-manual"><label for="captureCode">إدخال الباركود يدويًا</label><div><input id="captureCode" autocomplete="off" maxlength="120" dir="ltr"><button type="submit">بحث</button></div></form><section class="capture-result" hidden aria-live="polite"></section><details class="capture-history"><summary>آخر القراءات في هذه الجلسة</summary><ol></ol></details>':'<div class="capture-edit" hidden><button type="button" data-rotate>↻ تدوير الصورة</button><label>قص الحواف <input type="range" data-crop min="0" max="25" value="0" aria-label="قص الحواف بالنسبة المئوية"></label><button type="button" data-full>معاينة بالحجم الكامل</button></div>'}
      <input type="file" data-file accept="image/jpeg,image/png,image/webp" hidden></div>
      <footer class="capture-foot"><span>المعالجة على جهازك · الصور لا تُرسل لخدمات خارجية</span><div><button type="button" data-upload>اختيار صورة</button><button type="button" data-stop hidden>إيقاف</button><button type="button" data-retake hidden>إعادة التصوير</button><button type="button" class="capture-primary" data-main>تشغيل الكاميرا</button></div></footer>`;
    document.body.append(dialog); dialog.showModal();
    const $ = selector => dialog.querySelector(selector);
    const media = createSession(constraints => navigator.mediaDevices.getUserMedia(constraints));
    let closed=false, epoch=0, timer=null, decode=null, pending=false, busy=false, source=null, shot='', rotation=0, crop=0, paused=false, last='', absentAt=0, result=null;
    const status = (text, state='idle') => { $('[data-status]').textContent=text; $('[data-status]').dataset.state=state; };
    const message = text => { $('[data-message]').textContent=text; };
    const alive = token => !closed && dialog.isConnected && (token === undefined || token===epoch);
    function stop() {
      epoch++; clearTimeout(timer); timer=null; pending=false; media.stop(); $('video').srcObject=null;
      $('[data-stop]').hidden=true; $('[data-torch]').hidden=true; $('[data-zoom-wrap]').hidden=true;
      $('[data-main]').disabled=false;
      if(!shot){$('[data-main]').textContent='تشغيل الكاميرا';$('.capture-placeholder').hidden=false;$('.capture-guide').hidden=true;}
      status('متوقفة');
    }
    function finish() {
      if(closed)return; closed=true; stop(); observer.disconnect(); resizeObserver?.disconnect();
      navigator.mediaDevices?.removeEventListener?.('devicechange', devices);
      document.removeEventListener('visibilitychange', visibility);
      dialog.close(); dialog.remove(); if(active?.dialog===dialog)active=null;
      if(origin?.isConnected)origin.focus(); source=null; shot='';
    }
    active={close:finish,dialog};
    const observer=new MutationObserver(()=>{if(!dialog.isConnected)finish();}); observer.observe(document.body,{childList:true});
    // Match the decode crop to the contained video, excluding letterbox margins.
    function alignGuide() {
      const video=$('video'),stage=$('.capture-stage'),guide=$('.capture-guide');
      if(!video.videoWidth||!video.videoHeight)return;
      const scale=Math.min(stage.clientWidth/video.videoWidth,stage.clientHeight/video.videoHeight);
      const width=video.videoWidth*scale,height=video.videoHeight*scale,inset=scanning ? .12 : .03;
      Object.assign(guide.style,{inset:'auto',left:`${(stage.clientWidth-width)/2+width*inset}px`,top:`${(stage.clientHeight-height)/2+height*inset}px`,width:`${width*(1-2*inset)}px`,height:`${height*(1-2*inset)}px`,boxSizing:'border-box'});
    }
    const resizeObserver=window.ResizeObserver?new ResizeObserver(alignGuide):null;
    resizeObserver?.observe($('.capture-stage'));
    const visibility=()=>{if(document.hidden){stop(); message('توقفت الكاميرا لحماية الخصوصية. اضغط تشغيل للمتابعة.');}};
    document.addEventListener('visibilitychange',visibility);
    dialog.addEventListener('cancel',e=>{e.preventDefault();finish();}); $('[data-close]').onclick=finish;
    // Prevent POS shortcuts/scanner listeners from acting behind this dialog.
    dialog.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();finish();}});
    async function devices() {
      if(!navigator.mediaDevices?.enumerateDevices)return;
      try { const list=await navigator.mediaDevices.enumerateDevices(); if(!alive())return;
        const selected=$('[data-device]').value||preferences().device||'';
        $('[data-device]').innerHTML='<option value="">الكاميرا الافتراضية</option>'+list.filter(d=>d.kind==='videoinput').map((d,i)=>`<option value="${esc(d.deviceId)}">${esc(d.label||`كاميرا ${i+1}`)}</option>`).join('');
        if([...$('[data-device]').options].some(o=>o.value===selected))$('[data-device]').value=selected;
      }catch(e){message(errorText(e));}
    }
    navigator.mediaDevices?.addEventListener?.('devicechange',devices); devices();
    $('[data-quality]').value=prefs.quality==='eco'?'eco':'normal';
    $('[data-quality]').onchange=()=>{savePreferences({quality:$('[data-quality]').value});if(media.current())start();};
    $('[data-device]').onchange=()=>{savePreferences({device:$('[data-device]').value});if(media.current())start();};
    $('[data-sound]').onchange=()=>savePreferences({sound:$('[data-sound]').checked});
    function beep(ok=true){if(!$('[data-sound]').checked)return;try{const ctx=new (window.AudioContext||window.webkitAudioContext)(),o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=ok?880:260;g.gain.value=.035;o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+.09);o.onended=()=>ctx.close();}catch(_){}}
    async function start() {
      stop(); shot=''; source=null; $('[data-preview]').hidden=true; $('.capture-edit')?.setAttribute('hidden','');
      $('.capture-stage').classList.remove('full-image');
      $('[data-retake]').hidden=true;
      if(!navigator.mediaDevices?.getUserMedia){message('الكاميرا غير متاحة في هذا السياق. افتح النسخة المحلية أو HTTPS، أو اختر صورة.');status('غير مدعومة','error');return;}
      const token=epoch; pending=true; $('[data-main]').disabled=true; status('في انتظار الإذن','waiting');
      try{
        const device=$('[data-device]').value, eco=$('[data-quality]').value==='eco';
        const stream=await media.start({audio:false,video:{...(device?{deviceId:{exact:device}}:{facingMode:{ideal:'environment'}}),width:{ideal:eco?640:1280},height:{ideal:eco?480:720},frameRate:{ideal:eco?15:24,max:30}}});
        if(!stream||!alive(token))return;
        $('video').srcObject=stream;await $('video').play();if(!alive(token))return;
        pending=false;$('.capture-placeholder').hidden=true;$('.capture-guide').hidden=false;alignGuide();status('تعمل الآن','live');
        $('[data-main]').disabled=false;$('[data-main]').textContent=scanning?'إعادة المسح':'التقاط صورة';$('[data-stop]').hidden=false;
        const track=stream.getVideoTracks()[0], caps=track.getCapabilities?.()||{};
        track.addEventListener('ended',()=>{if(alive(token)){stop();message('انقطع اتصال الكاميرا. أعد توصيلها ثم شغّلها.');}});
        if(caps.zoom){const input=$('[data-zoom]');Object.assign(input,{min:caps.zoom.min,max:caps.zoom.max,step:caps.zoom.step||.1,value:track.getSettings().zoom||caps.zoom.min});$('[data-zoom-wrap]').hidden=false;input.oninput=()=>track.applyConstraints({advanced:[{zoom:Number(input.value)}]}).catch(e=>message(errorText(e)));}
        if(caps.torch){$('[data-torch]').hidden=false;let torch=false;$('[data-torch]').onclick=async()=>{try{await track.applyConstraints({advanced:[{torch:!torch}]});torch=!torch;$('[data-torch]').textContent=torch?'إطفاء الإضاءة':'تشغيل الإضاءة';}catch(e){message(errorText(e));}};}
        await devices(); if(!alive(token))return;
        message(scanning?'ثبّت باركودًا واحدًا داخل الإطار.':'راجع الإضاءة وحدود المستند ثم التقط الصورة.');
        if(scanning){decode ||= await decoder();if(alive(token)){paused=false;scanLoop(token);}}
      }catch(e){if(alive(token)){stop();status('غير متاحة','error');message(errorText(e));}}
    }
    async function scanLoop(token){
      if(!alive(token)||!media.current())return;
      if(!paused&&!busy&&$('video').readyState>=2){
        try{
          // Decode only the central guide to avoid selecting neighboring boxes.
          const frame=toCanvas($('video'),$('[data-quality]').value==='eco'?640:1000,0,.12);
          const codes=await decode(frame);if(!alive(token))return;
          if(!codes.length){if(!absentAt)absentAt=Date.now();if(Date.now()-absentAt>1000)last='';}
          else{absentAt=0;const unique=[...new Set(codes)].filter(Boolean);
            if(unique.length>1){paused=true;showChoices(unique);}
            else if(unique[0]!==last){last=unique[0];await resolveCode(unique[0]);}
          }
        }catch(e){message(errorText(e));paused=true;}
      }
      if(alive(token))timer=setTimeout(()=>scanLoop(token),$('[data-quality]').value==='eco'?650:300);
    }
    function showChoices(codes){const box=$('.capture-result');box.hidden=false;box.innerHTML='<strong>ظهر أكثر من باركود. اختر المقصود:</strong>'+codes.map((code,i)=>`<button type="button" data-choice="${i}">${esc(code)}</button>`).join('');box.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>resolveCode(codes[Number(b.dataset.choice)]));}
    async function resolveCode(raw){
      const code=String(raw||'').trim();if(!code||code.length>120){message('الباركود فارغ أو طويل أكثر من المسموح.');return;}
      if(busy)return;busy=true;paused=true;const token=epoch;
      try{
        status('جارٍ البحث','waiting'); result=lookup?await lookup(code):{title:'تمت قراءة الباركود',detail:code,code};
        if(!alive(token))return;
        const box=$('.capture-result');box.hidden=false;box.innerHTML=`<span class="capture-eyebrow">${esc(code)}</span><h3>${esc(result.title)}</h3><p>${esc(result.detail||'')}</p>${result.warning?`<p class="capture-warning">${esc(result.warning)}</p>`:''}<div class="capture-result-actions"></div>`;
        const actions=result.actions||[{label:result.acceptLabel||acceptLabel,disabled:result.disabled,run:()=>onAccept?.(result,code)}];
        for(const action of actions){const b=document.createElement('button');b.type='button';b.textContent=action.label;b.disabled=!!action.disabled;b.onclick=()=>accept(action,code);box.querySelector('.capture-result-actions').append(b);}
        const li=document.createElement('li');li.textContent=`${new Date().toLocaleTimeString('ar-EG')} · ${code} · ${result.title}`;$('.capture-history ol').prepend(li);while($('.capture-history ol').children.length>12)$('.capture-history ol').lastChild.remove();
        status(result.disabled?'تحتاج مراجعة':'تمت القراءة',result.disabled?'waiting':'success');beep(!result.disabled);
        if($('[data-auto]')?.checked&&!result.disabled&&actions.length===1)await accept(actions[0],code);
      }catch(e){if(alive()) {status('تعذر البحث','error');message(errorText(e));}}
      finally{busy=false;}
    }
    async function accept(action,code){
      if(action.disabled||!alive())return;
      $('.capture-result-actions')?.querySelectorAll('button').forEach(b=>b.disabled=true);
      try{await action.run?.();if(!alive())return;message('تم اعتماد النتيجة. أبعد الباركود قبل مسح العبوة التالية، أو اضغط إعادة المسح.');status('تم الاعتماد','success');paused=false;last=code;}
      catch(e){message(errorText(e));$('.capture-result-actions')?.querySelectorAll('button').forEach(b=>b.disabled=false);}
    }
    function renderShot(){const canvas=toCanvas(source,1800,rotation,crop);shot=encode(canvas);$('[data-preview]').src=shot;$('[data-preview]').hidden=false;$('.capture-placeholder').hidden=true;$('.capture-guide').hidden=true;$('.capture-edit').hidden=false;$('[data-retake]').hidden=false;$('[data-main]').textContent=onPhoto?'استخدام الصورة':'إنهاء الاختبار';message(`${canvas.width} × ${canvas.height} · ${Math.round(shot.length*.75/1024)} KB — ${qualityWarning(canvas)}`);status('راجع الصورة','success');}
    function capture(){try{source=toCanvas($('video'),2200);stop();rotation=0;crop=0;$('[data-crop]').value=0;renderShot();}catch(e){message(errorText(e));}}
    $('[data-main]').onclick=async()=>{if(pending)return;if(shot){try{$('[data-main]').disabled=true;await onPhoto?.(shot);finish();}catch(e){message(errorText(e));$('[data-main]').disabled=false;}}else if(!media.current())start();else if(scanning){paused=false;last='';$('.capture-result').hidden=true;message('في انتظار المسح…');}else capture();};
    $('[data-stop]').onclick=()=>{stop();message('تم إيقاف الكاميرا.');};
    $('[data-retake]').onclick=start;
    $('[data-upload]').onclick=()=>$('[data-file]').click();
    $('[data-file]').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;stop();const token=epoch;try{const image=await imageFromFile(file);if(!alive(token))return;if(scanning){decode ||= await decoder();const codes=await decode(toCanvas(image,1800));if(!alive(token))return;if(codes.length>1)showChoices(codes);else if(codes.length)await resolveCode(codes[0]);else message('لم تتم قراءة باركود واضح. قص الصورة حوله أو أدخله يدويًا.');}else{source=image;rotation=0;crop=0;$('[data-crop]').value=0;renderShot();}}catch(err){if(alive())message(errorText(err));}finally{e.target.value='';}};
    $('.capture-manual')?.addEventListener('submit',e=>{e.preventDefault();resolveCode($('#captureCode').value);});
    $('[data-rotate]')?.addEventListener('click',()=>{rotation=(rotation+90)%360;renderShot();});
    $('[data-crop]')?.addEventListener('input',e=>{crop=Number(e.target.value)/100;renderShot();});
    $('[data-full]')?.addEventListener('click',()=>{$('.capture-stage').classList.toggle('full-image');});
    return {close:finish, dialog};
  }
  window.addEventListener('pagehide',close);
  return {open,close,isOpen:()=>!!active,compressFile,createSession,esc};
})();
