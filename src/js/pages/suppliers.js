/* ════════════════════════════════════════════════════════════
   PAGE: SUPPLIERS  (async)
════════════════════════════════════════════════════════════ */
'use strict';

const SuppliersPage = (() => {
  let _search   = '';
  let _allSups  = [];
  let _allMeds  = [];

  function render() {
    return `
<div class="page active" id="page-suppliers">
  <div class="pg-header">
    <div class="pg-title-group">
      <h1 class="pg-title">
        <div class="pg-title-icon" style="background:var(--amb-100);color:var(--amb-700)"><i class="fas fa-truck-medical"></i></div>
        إدارة الموردين
      </h1>
      <p class="pg-subtitle">موردو الأدوية والمستلزمات الطبية</p>
    </div>
    <div class="pg-actions">
      <button class="btn btn-ghost btn-sm" id="supExportBtn"><i class="fas fa-download"></i> تصدير</button>
      <button class="btn btn-amber" id="supAddBtn"><i class="fas fa-plus"></i> إضافة مورد</button>
    </div>
  </div>

  <div class="toolbar">
    <div class="tb-srch">
      <i class="fas fa-magnifying-glass"></i>
      <input type="search" id="supSearch" placeholder="بحث بالاسم أو جهة الاتصال..." />
    </div>
  </div>

  <div class="g2" id="supCards" style="margin-bottom:1rem">
    ${Array(4).fill('<div class="skeleton" style="height:160px;border-radius:14px"></div>').join('')}
  </div>

  <div class="card">
    <div class="card-body p0">
      <div class="tbl-wrap">
        <table class="dtable">
          <thead><tr>
            <th>الكود</th><th>اسم الشركة</th><th>جهة الاتصال</th><th>الهاتف</th>
            <th>شروط الدفع</th><th>الطلبات</th><th>التقييم</th><th>الحالة</th><th>الإجراءات</th>
          </tr></thead>
          <tbody id="supTbody"></tbody>
        </table>
      </div>
    </div>
    <div class="card-foot"><div class="pagination" id="supPager"></div></div>
  </div>
</div>`;
  }

  async function afterRender() {
    document.getElementById('supAddBtn')?.addEventListener('click', openAdd);
    document.getElementById('supExportBtn')?.addEventListener('click', exportData);
    document.getElementById('supSearch')?.addEventListener('input', debounce(e=>{_search=e.target.value.trim();renderAll();},300));
    await _load();
  }

  async function _load() {
    try {
      [_allSups, _allMeds] = await Promise.all([DB.getSuppliers(), DB.getMedicines()]);
      renderAll();
    } catch(e){Toast.err('خطأ',e.message);}
  }

  function _filtered() {
    let l=[..._allSups];
    // FEAT [1]: Arabic-aware search
    if(_search) {
      const q = normalizeArabicText(_search);
      l = l.filter(s =>
        normalizeArabicText(s.name).includes(q) ||
        normalizeArabicText(s.contact).includes(q) ||
        s.phone.includes(_search)
      );
    }
    return l;
  }

  function renderAll() {
    const list=_filtered();
    _renderCards(list);
    _renderTable(list);
  }

  function _renderCards(list) {
    const el=document.getElementById('supCards'); if(!el) return;
    if(!list.length){el.innerHTML='';return;}
    el.innerHTML=list.slice(0,4).map(s=>`
      <div class="sup-card" data-id="${s.id}">
        <div class="sup-head">
          <div class="sup-ico"><i class="fas fa-building"></i></div>
          <div>
            <div class="sup-name">${s.name}</div>
            <div class="sup-contact"><i class="fas fa-user" style="font-size:.65rem"></i> ${s.contact}</div>
            <div style="margin-top:.3rem">${renderStars(s.rating)}</div>
          </div>
          <span class="badge ${s.status==='نشط'?'bdg-ok':'bdg-err'}" style="margin-right:auto">${s.status}</span>
        </div>
        <div class="sup-stats">
          <div class="sup-stat"><div class="sup-stat-val">${s.totalOrders}</div><div class="sup-stat-lbl">إجمالي الطلبات</div></div>
          <div class="sup-stat"><div class="sup-stat-val" style="font-size:.8rem">${s.paymentTerms}</div><div class="sup-stat-lbl">شروط الدفع</div></div>
        </div>
        <div style="display:flex;gap:.5rem;margin-top:.75rem;justify-content:flex-end">
          <button class="btn btn-outline btn-sm" data-action="edit" data-id="${s.id}"><i class="fas fa-pen"></i> تعديل</button>
          <button class="btn btn-danger btn-sm"  data-action="del"  data-id="${s.id}"><i class="fas fa-trash"></i></button>
        </div>
      </div>`).join('');

    el.querySelectorAll('.sup-card').forEach(card=>{
      card.addEventListener('click',e=>{if(!e.target.closest('[data-action]')) viewSup(card.dataset.id);});
    });
    el.querySelectorAll('[data-action]').forEach(btn=>{
      btn.addEventListener('click',e=>{e.stopPropagation();
        if(btn.dataset.action==='edit') openEdit(btn.dataset.id);
        if(btn.dataset.action==='del')  deleteSup(btn.dataset.id);
      });
    });
  }

  function _renderTable(list) {
    const tbody=document.getElementById('supTbody');
    const pager=document.getElementById('supPager');
    if(!tbody) return;
    if(!list.length){
      tbody.innerHTML=`<tr><td colspan="9"><div class="empty-state">
        <div class="es-icon"><i class="fas fa-truck-medical"></i></div>
        <h3 class="es-title">لا يوجد موردون</h3>
        <button class="btn btn-amber btn-sm" id="tblAddSupBtn"><i class="fas fa-plus"></i> إضافة مورد</button>
      </div></td></tr>`;
      document.getElementById('tblAddSupBtn')?.addEventListener('click',openAdd);
      if(pager)pager.innerHTML=''; return;
    }
    const pg=Paginator(list,8);
    const draw=()=>{
      tbody.innerHTML=pg.slice().map(s=>`
        <tr>
          <td><code style="font-size:.75rem">${s.id}</code></td>
          <td class="font-bold">${s.name}</td>
          <td>${s.contact}</td>
          <td dir="ltr">${s.phone}</td>
          <td><span class="badge bdg-slate">${s.paymentTerms}</span></td>
          <td style="font-weight:700">${s.totalOrders}</td>
          <td>${renderStars(s.rating)}</td>
          <td><span class="badge ${s.status==='نشط'?'bdg-ok':'bdg-err'}">${s.status}</span></td>
          <td>
            <div class="td-actions">
              <button class="btn btn-ghost btn-icon sm" data-action="view" data-id="${s.id}"><i class="fas fa-eye"></i></button>
              <button class="btn btn-outline btn-icon sm" data-action="edit" data-id="${s.id}"><i class="fas fa-pen"></i></button>
              <button class="btn btn-danger btn-icon sm" data-action="del" data-id="${s.id}"><i class="fas fa-trash"></i></button>
            </div>
          </td>
        </tr>`).join('');
      tbody.querySelectorAll('[data-action]').forEach(btn=>{
        btn.addEventListener('click',()=>{
          if(btn.dataset.action==='view') viewSup(btn.dataset.id);
          if(btn.dataset.action==='edit') openEdit(btn.dataset.id);
          if(btn.dataset.action==='del')  deleteSup(btn.dataset.id);
        });
      });
      pg.render(pager);
    };
    draw();
    document.getElementById('supPager')?.addEventListener('click',draw);
  }

  function _formHTML(s={}) {
    return `
    <div class="form-row cols-2">
      <div class="form-group"><label class="form-label">اسم الشركة <span class="req">*</span></label>
        <input class="form-control" id="fSupName" value="${s.name||''}" /></div>
      <div class="form-group"><label class="form-label">جهة الاتصال <span class="req">*</span></label>
        <input class="form-control" id="fSupContact" value="${s.contact||''}" /></div>
    </div>
    <div class="form-row cols-2">
      <div class="form-group"><label class="form-label">رقم الهاتف <span class="req">*</span></label>
        <input class="form-control" id="fSupPhone" value="${s.phone||''}" dir="ltr" /></div>
      <div class="form-group"><label class="form-label">البريد الإلكتروني</label>
        <input class="form-control" id="fSupEmail" value="${s.email||''}" dir="ltr" /></div>
    </div>
    <div class="form-row cols-2">
      <div class="form-group"><label class="form-label">العنوان</label>
        <input class="form-control" id="fSupAddr" value="${s.address||''}" /></div>
      <div class="form-group"><label class="form-label">الرقم الضريبي</label>
        <input class="form-control" id="fSupTax" value="${s.taxNum||''}" dir="ltr" /></div>
    </div>
    <div class="form-row cols-3">
      <div class="form-group"><label class="form-label">شروط الدفع</label>
        <select class="form-control" id="fSupPayment">
          ${['فوري','15 يوم','30 يوم','45 يوم','60 يوم'].map(t=>`<option value="${t}" ${s.paymentTerms===t?'selected':''}>${t}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">التقييم</label>
        <select class="form-control" id="fSupRating">
          ${[1,2,3,4,5].map(i=>`<option value="${i}" ${s.rating===i?'selected':''}>${'★'.repeat(i)} (${i})</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">الحالة</label>
        <select class="form-control" id="fSupStatus">
          <option value="نشط" ${s.status==='نشط'?'selected':''}>نشط</option>
          <option value="غير نشط" ${s.status==='غير نشط'?'selected':''}>غير نشط</option>
        </select></div>
    </div>`;
  }

  function openAdd() {
    Modal.open({
      title:'<i class="fas fa-plus-circle"></i> إضافة مورد جديد',
      size:'lg', body:_formHTML(),
      foot:`<button class="btn btn-amber" id="saveSupBtn"><i class="fas fa-check"></i> حفظ</button>
            <button class="btn btn-ghost" onclick="Modal.close()">إلغاء</button>`,
    });
    document.getElementById('saveSupBtn')?.addEventListener('click',()=>_save(null));
  }

  function openEdit(id) {
    const s=_allSups.find(x=>x.id===id); if(!s) return;
    Modal.open({
      title:`<i class="fas fa-pen"></i> تعديل: ${s.name}`,
      size:'lg', body:_formHTML(s),
      foot:`<button class="btn btn-amber" id="saveSupBtn"><i class="fas fa-check"></i> حفظ</button>
            <button class="btn btn-ghost" onclick="Modal.close()">إلغاء</button>`,
    });
    document.getElementById('saveSupBtn')?.addEventListener('click',()=>_save(id));
  }

  async function _save(id) {
    const v={
      name:         document.getElementById('fSupName')?.value.trim(),
      contact:      document.getElementById('fSupContact')?.value.trim(),
      phone:        document.getElementById('fSupPhone')?.value.trim(),
      email:        document.getElementById('fSupEmail')?.value.trim(),
      address:      document.getElementById('fSupAddr')?.value.trim(),
      taxNum:       document.getElementById('fSupTax')?.value.trim(),
      paymentTerms: document.getElementById('fSupPayment')?.value,
      rating:       parseInt(document.getElementById('fSupRating')?.value)||3,
      status:       document.getElementById('fSupStatus')?.value,
    };
    if(!v.name||!v.contact||!v.phone){Toast.err('بيانات ناقصة','الاسم والتواصل والهاتف مطلوبة');return;}
    try {
      if(id){await DB.updateSupplier(id,v);Toast.ok('تم التحديث',`تم تعديل ${v.name}`);}
      else  {await DB.addSupplier(v);     Toast.ok('تمت الإضافة',`تمت إضافة ${v.name}`);}
      Modal.close(); await _load();
    } catch(e){Toast.err('خطأ',e.message);}
  }

  function viewSup(id) {
    const s=_allSups.find(x=>x.id===id); if(!s) return;
    const meds=_allMeds.filter(m=>m.supplierId===id);
    Modal.open({
      title:`<i class="fas fa-building"></i> ${s.name}`,
      size:'lg',
      body:`
        <div class="detail-row"><span class="dr-label">جهة الاتصال</span><span class="dr-val">${s.contact}</span></div>
        <div class="detail-row"><span class="dr-label">الهاتف</span><span class="dr-val" dir="ltr">${s.phone}</span></div>
        <div class="detail-row"><span class="dr-label">البريد</span><span class="dr-val" dir="ltr">${s.email||'—'}</span></div>
        <div class="detail-row"><span class="dr-label">العنوان</span><span class="dr-val">${s.address||'—'}</span></div>
        <div class="detail-row"><span class="dr-label">الرقم الضريبي</span><span class="dr-val" dir="ltr">${s.taxNum||'—'}</span></div>
        <div class="detail-row"><span class="dr-label">شروط الدفع</span><span class="dr-val">${s.paymentTerms}</span></div>
        <div class="detail-row"><span class="dr-label">التقييم</span><span class="dr-val">${renderStars(s.rating)}</span></div>
        <div class="detail-row"><span class="dr-label">الحالة</span><span class="dr-val"><span class="badge ${s.status==='نشط'?'bdg-ok':'bdg-err'}">${s.status}</span></span></div>
        <div class="divider"></div>
        <div style="font-weight:700;font-size:.88rem;margin-bottom:.5rem"><i class="fas fa-pills" style="color:var(--teal-500)"></i> الأدوية المرتبطة (${meds.length})</div>
        ${meds.length?meds.map(m=>`
          <div style="display:flex;justify-content:space-between;padding:.4rem 0;border-bottom:1px solid var(--border-2);font-size:.84rem">
            <span>${m.name}</span><span class="badge bdg-teal">${m.stock} ${m.unit}</span>
          </div>`).join(''):`<p style="color:var(--tx-3);font-size:.84rem">لا توجد أدوية مرتبطة</p>`}`,
      foot:`<button class="btn btn-outline" onclick="Modal.close();SuppliersPage.openEdit('${id}')"><i class="fas fa-pen"></i> تعديل</button>
            <button class="btn btn-ghost" onclick="Modal.close()">إغلاق</button>`,
    });
  }

  function deleteSup(id) {
    const s=_allSups.find(x=>x.id===id); if(!s) return;
    Modal.confirm('حذف المورد',`هل تريد حذف <strong>${s.name}</strong>؟`,async()=>{
      try{await DB.deleteSupplier(id);Toast.ok('تم الحذف',`تم حذف ${s.name}`);await _load();}
      catch(e){Toast.err('خطأ',e.message);}
    });
  }

  function exportData() {
    exportCSV('الموردون',
      ['الكود','الاسم','جهة_الاتصال','الهاتف','البريد','شروط_الدفع','التقييم','الحالة','إجمالي_الطلبات'],
      _allSups.map(s=>[s.id,s.name,s.contact,s.phone,s.email,s.paymentTerms,s.rating,s.status,s.totalOrders])
    );
  }

  return { render, afterRender, openAdd, openEdit };
})();
