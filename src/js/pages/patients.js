/* ════════════════════════════════════════════════════════════
   PAGE: PATIENTS  (async)
════════════════════════════════════════════════════════════ */
'use strict';

const PatientsPage = (() => {
  let _search   = '';
  let _view     = 'cards';
  let _allPats  = [];
  let _allSales = [];

  function render() {
    return `
<div class="page active" id="page-patients">
  <div class="pg-header">
    <div class="pg-title-group">
      <h1 class="pg-title">
        <div class="pg-title-icon" style="background:var(--ok-light);color:var(--ok)"><i class="fas fa-user-injured"></i></div>
        إدارة المرضى
      </h1>
      <p class="pg-subtitle">ملفات المرضى والسجلات الطبية</p>
    </div>
    <div class="pg-actions">
      <button class="btn btn-ghost btn-sm" id="ptExportBtn"><i class="fas fa-download"></i> تصدير</button>
      <button class="btn btn-primary" id="ptAddBtn"><i class="fas fa-user-plus"></i> إضافة مريض</button>
    </div>
  </div>

  <div class="toolbar">
    <div class="tb-srch">
      <i class="fas fa-magnifying-glass"></i>
      <input type="search" id="ptSearch" placeholder="بحث بالاسم أو الهاتف..." />
    </div>
    <button class="btn btn-ghost btn-sm" id="ptViewToggle"><i class="fas fa-table-list"></i> جدول</button>
  </div>

  <div id="ptCards" class="g2" style="margin-bottom:1rem">
    ${Array(4).fill('<div class="skeleton" style="height:110px;border-radius:14px"></div>').join('')}
  </div>
  <div id="ptTable" class="card hidden">
    <div class="card-body p0">
      <div class="tbl-wrap">
        <table class="dtable">
          <thead><tr>
            <th>الكود</th><th>الاسم</th><th>الهاتف</th><th>العمر</th>
            <th>فصيلة الدم</th><th>الأمراض المزمنة</th><th>تاريخ التسجيل</th><th>الإجراءات</th>
          </tr></thead>
          <tbody id="ptTbody"></tbody>
        </table>
      </div>
    </div>
    <div class="card-foot"><div class="pagination" id="ptPager"></div></div>
  </div>
</div>`;
  }

  async function afterRender() {
    document.getElementById('ptAddBtn')?.addEventListener('click', openAdd);
    document.getElementById('ptExportBtn')?.addEventListener('click', exportData);
    document.getElementById('ptSearch')?.addEventListener('input', debounce(e=>{_search=e.target.value.trim();renderView();},300));
    document.getElementById('ptViewToggle')?.addEventListener('click', ()=>{
      _view = _view==='cards'?'table':'cards';
      const btn=document.getElementById('ptViewToggle');
      btn.innerHTML=_view==='cards'?'<i class="fas fa-table-list"></i> جدول':'<i class="fas fa-id-card"></i> بطاقات';
      renderView();
    });
    await _load();
  }

  async function _load() {
    try {
      [_allPats, _allSales] = await Promise.all([DB.getPatients(), DB.getSales()]);
      renderView();
    } catch(e) { Toast.err('خطأ',e.message); }
  }

  function _filtered() {
    let l = [..._allPats];
    // FEAT [1]: Arabic-aware search
    if (_search) {
      const q = normalizeArabicText(_search);
      l = l.filter(p =>
        normalizeArabicText(p.name).includes(q) ||
        p.phone.includes(_search)
      );
    }
    return l;
  }

  function renderView() {
    const list = _filtered();
    if (_view==='cards') {
      document.getElementById('ptCards')?.classList.remove('hidden');
      document.getElementById('ptTable')?.classList.add('hidden');
      _renderCards(list);
    } else {
      document.getElementById('ptCards')?.classList.add('hidden');
      document.getElementById('ptTable')?.classList.remove('hidden');
      _renderTable(list);
    }
  }

  function _renderCards(list) {
    const el=document.getElementById('ptCards');
    if (!el) return;
    if (!list.length) {
      el.innerHTML=`<div class="empty-state" style="grid-column:1/-1">
        <div class="es-icon"><i class="fas fa-user-injured"></i></div>
        <h3 class="es-title">لا يوجد مرضى</h3>
        <button class="btn btn-primary btn-sm" id="emptyAddPt"><i class="fas fa-user-plus"></i> إضافة مريض</button>
      </div>`;
      document.getElementById('emptyAddPt')?.addEventListener('click', openAdd);
      return;
    }
    el.innerHTML = list.map(p=>{
      const color = getAvatarColor(p.name);
      const sales = _allSales.filter(s=>s.patientId===p.id);
      return `
      <div class="pt-card" data-id="${p.id}">
        <div style="width:50px;height:50px;min-width:50px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:1.1rem;font-weight:700;color:#fff">${p.name.slice(0,2)}</div>
        <div class="pt-info">
          <div class="pt-name">${p.name}</div>
          <div class="pt-meta"><i class="fas fa-phone" style="font-size:.7rem"></i> ${p.phone} &nbsp;•&nbsp; ${p.age} سنة &nbsp;•&nbsp; ${p.gender}</div>
          <div class="pt-tags">
            <span class="badge bdg-teal"><i class="fas fa-tint"></i> ${p.bloodType}</span>
            ${p.allergies&&p.allergies!=='لا يوجد'?`<span class="badge bdg-err">${p.allergies}</span>`:''}
            ${p.chronicDiseases&&p.chronicDiseases!=='لا يوجد'?`<span class="badge bdg-amb">${p.chronicDiseases}</span>`:''}
            <span class="badge bdg-slate"><i class="fas fa-receipt"></i> ${sales.length} فاتورة</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:.4rem">
          <button class="btn btn-outline btn-icon sm" data-action="edit" data-id="${p.id}" title="تعديل"><i class="fas fa-pen"></i></button>
          <button class="btn btn-danger btn-icon sm" data-action="del"  data-id="${p.id}" title="حذف"><i class="fas fa-trash"></i></button>
        </div>
      </div>`;
    }).join('');

    el.querySelectorAll('.pt-card').forEach(card=>{
      card.addEventListener('click', e=>{
        if (e.target.closest('[data-action]')) return;
        viewPt(card.dataset.id);
      });
    });
    el.querySelectorAll('[data-action]').forEach(btn=>{
      btn.addEventListener('click', e=>{
        e.stopPropagation();
        if (btn.dataset.action==='edit') openEdit(btn.dataset.id);
        if (btn.dataset.action==='del')  deletePt(btn.dataset.id);
      });
    });
  }

  function _renderTable(list) {
    const tbody=document.getElementById('ptTbody');
    const pager=document.getElementById('ptPager');
    if (!tbody) return;
    if (!list.length) {
      tbody.innerHTML=`<tr><td colspan="8"><div class="empty-state"><div class="es-icon"><i class="fas fa-user-injured"></i></div><h3 class="es-title">لا يوجد مرضى</h3></div></td></tr>`;
      if(pager)pager.innerHTML=''; return;
    }
    const pg=Paginator(list,8);
    const draw=()=>{
      tbody.innerHTML=pg.slice().map(p=>`
        <tr data-id="${p.id}" style="cursor:pointer">
          <td><code style="font-size:.75rem">${p.id}</code></td>
          <td class="font-bold">${p.name}</td>
          <td dir="ltr">${p.phone}</td>
          <td>${p.age}</td>
          <td><span class="badge bdg-teal">${p.bloodType}</span></td>
          <td>${p.chronicDiseases||'—'}</td>
          <td>${Fmt.dateShort(p.createdAt)}</td>
          <td>
            <div class="td-actions">
              <button class="btn btn-outline btn-icon sm" data-action="edit" data-id="${p.id}"><i class="fas fa-pen"></i></button>
              <button class="btn btn-danger btn-icon sm" data-action="del"  data-id="${p.id}"><i class="fas fa-trash"></i></button>
            </div>
          </td>
        </tr>`).join('');

      tbody.querySelectorAll('tr[data-id]').forEach(tr=>{
        tr.addEventListener('click', e=>{if(!e.target.closest('[data-action]')) viewPt(tr.dataset.id);});
      });
      tbody.querySelectorAll('[data-action]').forEach(btn=>{
        btn.addEventListener('click', e=>{ e.stopPropagation();
          if(btn.dataset.action==='edit') openEdit(btn.dataset.id);
          if(btn.dataset.action==='del')  deletePt(btn.dataset.id);
        });
      });
      pg.render(pager);
    };
    draw();
    document.getElementById('ptPager')?.addEventListener('click', draw);
  }

  function _formHTML(p={}) {
    return `
    <div class="form-row cols-2">
      <div class="form-group"><label class="form-label">الاسم الكامل <span class="req">*</span></label>
        <input class="form-control" id="fPtName" value="${p.name||''}" /></div>
      <div class="form-group"><label class="form-label">رقم الجوال <span class="req">*</span></label>
        <input class="form-control" id="fPtPhone" value="${p.phone||''}" dir="ltr" /></div>
    </div>
    <div class="form-row cols-3">
      <div class="form-group"><label class="form-label">العمر</label>
        <input class="form-control" id="fPtAge" type="number" min="0" max="120" value="${p.age||''}" /></div>
      <div class="form-group"><label class="form-label">الجنس</label>
        <select class="form-control" id="fPtGender">
          <option value="ذكر" ${p.gender==='ذكر'?'selected':''}>ذكر</option>
          <option value="أنثى" ${p.gender==='أنثى'?'selected':''}>أنثى</option>
        </select></div>
      <div class="form-group"><label class="form-label">فصيلة الدم</label>
        <select class="form-control" id="fPtBlood">
          ${['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(b=>`<option value="${b}" ${p.bloodType===b?'selected':''}>${b}</option>`).join('')}
        </select></div>
    </div>
    <div class="form-row cols-2">
      <div class="form-group"><label class="form-label">الحساسية الدوائية</label>
        <input class="form-control" id="fPtAllergy" value="${p.allergies||'لا يوجد'}" /></div>
      <div class="form-group"><label class="form-label">الأمراض المزمنة</label>
        <input class="form-control" id="fPtChronic" value="${p.chronicDiseases||'لا يوجد'}" /></div>
    </div>
    <div class="form-group"><label class="form-label">العنوان</label>
      <input class="form-control" id="fPtAddr" value="${p.address||''}" /></div>
    <div class="form-group"><label class="form-label">ملاحظات</label>
      <textarea class="form-control" id="fPtNotes" rows="2">${p.notes||''}</textarea></div>`;
  }

  function openAdd() {
    Modal.open({
      title:'<i class="fas fa-user-plus"></i> إضافة مريض جديد',
      size:'lg', body:_formHTML(),
      foot:`<button class="btn btn-primary" id="savePtBtn"><i class="fas fa-check"></i> حفظ</button>
            <button class="btn btn-ghost" onclick="Modal.close()">إلغاء</button>`,
    });
    document.getElementById('savePtBtn')?.addEventListener('click',()=>_save(null));
  }

  function openEdit(id) {
    const p=_allPats.find(x=>x.id===id); if(!p) return;
    Modal.open({
      title:`<i class="fas fa-pen"></i> تعديل: ${p.name}`,
      size:'lg', body:_formHTML(p),
      foot:`<button class="btn btn-primary" id="savePtBtn"><i class="fas fa-check"></i> حفظ</button>
            <button class="btn btn-ghost" onclick="Modal.close()">إلغاء</button>`,
    });
    document.getElementById('savePtBtn')?.addEventListener('click',()=>_save(id));
  }

  async function _save(id) {
    const v={
      name:            document.getElementById('fPtName')?.value.trim(),
      phone:           document.getElementById('fPtPhone')?.value.trim(),
      age:             parseInt(document.getElementById('fPtAge')?.value)||0,
      gender:          document.getElementById('fPtGender')?.value,
      bloodType:       document.getElementById('fPtBlood')?.value,
      allergies:       document.getElementById('fPtAllergy')?.value.trim(),
      chronicDiseases: document.getElementById('fPtChronic')?.value.trim(),
      address:         document.getElementById('fPtAddr')?.value.trim(),
      notes:           document.getElementById('fPtNotes')?.value.trim(),
    };
    if(!v.name||!v.phone){Toast.err('بيانات ناقصة','الاسم والهاتف مطلوبان');return;}
    try {
      if(id){await DB.updatePatient(id,v);Toast.ok('تم التحديث',`تم تعديل ${v.name}`);}
      else  {await DB.addPatient(v);      Toast.ok('تمت الإضافة',`تمت إضافة ${v.name}`);}
      Modal.close(); await _load();
    } catch(e){Toast.err('خطأ',e.message);}
  }

  function viewPt(id) {
    const p=_allPats.find(x=>x.id===id); if(!p) return;
    const sales=_allSales.filter(s=>s.patientId===id);
    const color=getAvatarColor(p.name);
    Modal.open({
      title:`<i class="fas fa-user-injured"></i> ${p.name}`,
      size:'lg',
      body:`
        <div style="display:flex;gap:1rem;align-items:flex-start;margin-bottom:1rem">
          <div style="width:62px;height:62px;min-width:62px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:700;color:#fff">${p.name.slice(0,2)}</div>
          <div>
            <div style="font-size:1.1rem;font-weight:700">${p.name}</div>
            <div style="color:var(--tx-3);font-size:.82rem;margin-top:3px">${p.age} سنة &nbsp;•&nbsp; ${p.gender} &nbsp;•&nbsp; ${p.bloodType}</div>
          </div>
        </div>
        <div class="detail-row"><span class="dr-label">الجوال</span><span class="dr-val" dir="ltr">${p.phone}</span></div>
        <div class="detail-row"><span class="dr-label">الحساسية</span><span class="dr-val" style="color:${p.allergies&&p.allergies!=='لا يوجد'?'var(--err)':'inherit'}">${p.allergies||'—'}</span></div>
        <div class="detail-row"><span class="dr-label">الأمراض المزمنة</span><span class="dr-val">${p.chronicDiseases||'—'}</span></div>
        <div class="detail-row"><span class="dr-label">العنوان</span><span class="dr-val">${p.address||'—'}</span></div>
        <div class="detail-row"><span class="dr-label">الملاحظات</span><span class="dr-val">${p.notes||'—'}</span></div>
        <div class="detail-row"><span class="dr-label">تاريخ التسجيل</span><span class="dr-val">${Fmt.date(p.createdAt)}</span></div>
        <div class="divider"></div>
        <div style="font-weight:700;font-size:.88rem;margin-bottom:.75rem"><i class="fas fa-receipt" style="color:var(--teal-500)"></i> سجل المشتريات (${sales.length})</div>
        ${sales.length?`<div class="tbl-wrap"><table class="dtable">
          <thead><tr><th>الفاتورة</th><th>التاريخ</th><th>الإجمالي</th><th>الدفع</th></tr></thead>
          <tbody>${sales.map(s=>`<tr>
            <td>${s.invoiceNum}</td><td>${Fmt.dateShort(s.date)}</td>
            <td style="font-weight:700;color:var(--teal-600)">${Fmt.money(s.total)}</td>
            <td><span class="badge bdg-teal">${s.paymentMethod}</span></td>
          </tr>`).join('')}</tbody>
        </table></div>`:`<p style="color:var(--tx-3);font-size:.84rem">لا توجد فواتير بعد</p>`}`,
      foot:`<button class="btn btn-outline" onclick="Modal.close();PatientsPage.openEdit('${id}')"><i class="fas fa-pen"></i> تعديل</button>
            <button class="btn btn-ghost" onclick="Modal.close()">إغلاق</button>`,
    });
  }

  function deletePt(id) {
    const p=_allPats.find(x=>x.id===id); if(!p) return;
    Modal.confirm('حذف المريض',`هل تريد حذف <strong>${p.name}</strong>؟`, async()=>{
      try{await DB.deletePatient(id);Toast.ok('تم الحذف',`تم حذف ${p.name}`);await _load();}
      catch(e){Toast.err('خطأ',e.message);}
    });
  }

  function exportData() {
    exportCSV('المرضى',
      ['الكود','الاسم','الهاتف','العمر','الجنس','فصيلة_الدم','الحساسية','الأمراض_المزمنة','العنوان'],
      _allPats.map(p=>[p.id,p.name,p.phone,p.age,p.gender,p.bloodType,p.allergies,p.chronicDiseases,p.address])
    );
  }

  return { render, afterRender, openAdd, openEdit, viewPt };
})();
