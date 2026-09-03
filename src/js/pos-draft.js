'use strict';

// One durable draft per account. Saves are serialized; a stale tab cannot overwrite it.
const PosDraft = (() => {
  let id = '', version = 0, queue = Promise.resolve(), pending = 0, failure = null;
  let ready = false;
  let owner = null;
  const newId = () => crypto.randomUUID();
  const status = text => { const el=document.getElementById('posDraftStatus'); if(el)el.textContent=text; };
  async function load() {
    await queue;
    ready=false;failure=null;
    owner=Auth.getCurrent()?.id;
    if(location.protocol==='file:') {status('حفظ المسودة يحتاج تشغيل run.bat');return null;}
    const saved=await _api('pos_draft');
    id=saved?.id||newId();version=saved?.version||0;ready=true;
    status(saved?'تم استرجاع المسودة المحفوظة':'المسودة تُحفظ تلقائيًا للحساب الحالي');
    return saved?.payload||null;
  }
  function save(payload) {
    if(!ready)return;
    const snapshot=JSON.parse(JSON.stringify(payload));
    const snapshotOwner=owner;
    pending++;status('جارٍ حفظ المسودة…');
    queue=queue.then(async()=>{
      if(failure)throw failure;
      const result=await _api('pos_draft',{body:{id,version,owner:snapshotOwner,payload:snapshot}});
      version=result.version;
    }).catch(error=>{failure=error;status(`لم يتم الحفظ: ${error.message}`);})
      .finally(()=>{pending--;if(!pending&&!failure)status('المسودة محفوظة — المخزون لم يتغير');});
  }
  async function flush() {
    await queue;
    if(!ready)throw new Error('تعذر تحميل مسودة الحساب؛ أعد فتح نقطة البيع');
    if(failure)throw failure;
    return {draft_id:id,draft_version:version};
  }
  function completed() {id=newId();version=0;failure=null;status('تم إصدار الفاتورة — سلة جديدة');}
  window.addEventListener('beforeunload',event=>{if(pending||failure){event.preventDefault();event.returnValue='';}});
  return {load,save,flush,completed};
})();
