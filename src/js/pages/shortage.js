/* ════════════════════════════════════════════════════════════
   PAGE: SHORTAGE — كشكول النواقص
   • الأصناف التي وصلت للحد الأدنى أو نفدت
   • عرض الموردين المرتبطين بكل صنف مع التقييم
   • إنشاء أمر شراء مباشر من الكشكول
   • تصدير CSV
════════════════════════════════════════════════════════════ */
'use strict';

const ShortagePage = (() => {
  let _meds      = [];
  let _suppliers = [];
  let _filter    = 'all';   // all / out / low

  function render() {
    return `
<div class="page active" id="page-shortage">
  <div class="pg-header">
    <div class="pg-title-group">
      <h1 class="pg-title">
        <div class="pg-title-icon" style="background:#fee2e2;color:#dc2626"><i class="fas fa-triangle-exclamation"></i></div>
        كشكول النواقص
      </h1>
      <p class="pg-subtitle">الأصناف التي تحتاج طلبية</p>
    </div>
    <div class="pg-actions">
      <button class="btn btn-ghost btn-sm" id="shExportBtn"><i class="fas fa-download"></i> تصدير CSV</button>
      <button class="btn btn-amber" id="shCreatePoBtn"><i class="fas fa-cart-flatbed"></i> إنشاء أمر شراء</button>
    </div>
  </div>

  <!-- إحصاء -->
  <div class="stats-grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr));margin-bottom:1.2rem" id="shStats"></div>

  <!-- تبويبات -->
  <div class="tabs" id="shTabs" style="margin-bottom:.8rem">
    <button class="tab-btn active" data-sf="all">الكل</button>
    <button class="tab-btn" data-sf="out">نفد المخزون</button>
    <button class="tab-btn" data-sf="low">مخزون منخفض</button>
  </div>

  <div class="card">
    <div class="card-body p0">
      <div class="tbl-wrap">
        <table class="dtable">
          <thead><tr>
            <th><input type="checkbox" id="shSelectAll" title="تحديد الكل"></th>
            <th>الدواء</th><th>الفئة</th><th>المخزون الحالي</th>
            <th>الحد الأدنى</th><th>الحالة</th>
            <th>المورد الرئيسي</th><th>التقييم</th><th>آخر سعر شراء</th>
          </tr></thead>
          <tbody id="shTbody">
            <tr><td colspan="9"><div class="empty-state">
              <div class="es-icon an-spin"><i class="fas fa-circle-notch"></i></div>
              <h3 class="es-title">جارٍ التحميل...</h3>
            </div></td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="card-foot"><div class="pagination" id="shPager"></div></div>
  </div>
</div>`;
  }

  async function afterRender() {
    document.getElementById('shExportBtn')?.addEventListener('click', exportData);
    document.getElementById('shCreatePoBtn')?.addEventListener('click', createPOFromShortage);
    document.getElementById('shTabs')?.addEventListener('click', e => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      _filter = btn.dataset.sf;
      document.querySelectorAll('#shTabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTable();
    });
    document.getElementById('shSelectAll')?.addEventListener('change', e => {
      document.querySelectorAll('.sh-chk').forEach(chk => chk.checked = e.target.checked);
    });
    await _load();
  }

  async function _load() {
    try {
      const [low, out, suppliers] = await Promise.all([
        DB.getLowStock(),
        DB.getMedicines(),
        DB.getSuppliers(),
      ]);
      _suppliers = suppliers || [];
      const outMeds = (out || []).filter(m => m.stock === 0);
      // دمج بدون تكرار
      const allSet = new Map();
      [...(low || []), ...outMeds].forEach(m => allSet.set(m.id, m));
      _meds = Array.from(allSet.values());

      const out0 = _meds.filter(m => m.stock === 0);
      const low1 = _meds.filter(m => m.stock > 0);

      document.getElementById('shStats').innerHTML = `
        <div class="stat-card c-err"><div class="sc-header"><div class="sc-icon"><i class="fas fa-times-circle"></i></div></div><div class="sc-val">${out0.length}</div><div class="sc-label">نفد المخزون</div></div>
        <div class="stat-card c-warn"><div class="sc-header"><div class="sc-icon"><i class="fas fa-exclamation-triangle"></i></div></div><div class="sc-val">${low1.length}</div><div class="sc-label">مخزون منخفض</div></div>
        <div class="stat-card c-teal"><div class="sc-header"><div class="sc-icon"><i class="fas fa-boxes-stacked"></i></div></div><div class="sc-val">${_meds.length}</div><div class="sc-label">إجمالي النواقص</div></div>
        <div class="stat-card c-amber"><div class="sc-header"><div class="sc-icon"><i class="fas fa-truck-medical"></i></div></div><div class="sc-val">${new Set(_meds.filter(m=>m.supplierId).map(m=>m.supplierId)).size}</div><div class="sc-label">موردون معنيون</div></div>`;

      const tabs = document.querySelectorAll('#shTabs .tab-btn');
      if (tabs[0]) tabs[0].innerHTML = `الكل <span class="badge bdg-err">${_meds.length}</span>`;
      if (tabs[1]) tabs[1].innerHTML = `نفد المخزون <span class="badge bdg-err">${out0.length}</span>`;
      if (tabs[2]) tabs[2].innerHTML = `مخزون منخفض <span class="badge bdg-warn">${low1.length}</span>`;

      renderTable();
    } catch(e) { Toast.err('خطأ', e.message); }
  }

  function renderTable() {
    const tbody = document.getElementById('shTbody');
    const pager = document.getElementById('shPager');
    if (!tbody) return;

    let list = [..._meds];
    if (_filter === 'out') list = list.filter(m => m.stock === 0);
    if (_filter === 'low') list = list.filter(m => m.stock > 0 && m.stock <= m.minStock);

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">
        <div class="es-icon" style="color:var(--ok)"><i class="fas fa-check-circle"></i></div>
        <h3 class="es-title">لا توجد نواقص</h3>
        <p class="es-sub">جميع الأصناف في مستوى المخزون المطلوب</p>
      </div></td></tr>`;
      if (pager) pager.innerHTML = ''; return;
    }

    const pg = Paginator(list, 15);
    const draw = () => {
      tbody.innerHTML = pg.slice().map(m => {
        const sup = _suppliers.find(s => s.id === m.supplierId);
        const isOut = m.stock === 0;
        const stars = sup ? '★'.repeat(Math.min(sup.rating, 5)) + '☆'.repeat(5 - Math.min(sup.rating, 5)) : '—';
        return `<tr>
          <td><input type="checkbox" class="sh-chk" data-id="${m.id}" data-name="${m.name}" data-cost="${m.cost}" data-supplier="${m.supplierId || ''}"></td>
          <td class="font-bold">${m.name}</td>
          <td>${m.category}</td>
          <td style="font-weight:700;color:${isOut ? 'var(--err)' : 'var(--warn)'}">${m.stock} ${m.unit}</td>
          <td>${m.minStock}</td>
          <td><span class="badge ${isOut ? 'bdg-err' : 'bdg-warn'}">${isOut ? 'نفد' : 'منخفض'}</span></td>
          <td>${sup ? `<span style="font-weight:600">${sup.name}</span><br><small style="color:var(--tx-3)">${sup.phone || ''}</small>` : '<span style="color:var(--tx-3)">غير محدد</span>'}</td>
          <td><span style="color:#f59e0b;font-size:.85rem">${stars}</span></td>
          <td style="color:var(--teal-600)">${m.cost > 0 ? Fmt.money(m.cost) : '—'}</td>
        </tr>`;
      }).join('');
      pg.render(pager);
    };
    draw();
    pager?.addEventListener('click', draw);
  }

  /* ── إنشاء أمر شراء من الكشكول ─────────────────────── */
  async function createPOFromShortage() {
    const checked = [...document.querySelectorAll('.sh-chk:checked')];
    if (!checked.length) {
      Toast.warn('تنبيه', 'حدّد الأصناف التي تريد طلبها أولاً');
      return;
    }

    // تجميع الأصناف حسب المورد
    const bySupplier = {};
    checked.forEach(chk => {
      const suppId = chk.dataset.supplier || '';
      if (!bySupplier[suppId]) bySupplier[suppId] = [];
      bySupplier[suppId].push({
        med_id:   chk.dataset.id,
        med_name: chk.dataset.name,
        cost:     parseFloat(chk.dataset.cost) || 0,
      });
    });

    const supplierCount = Object.keys(bySupplier).length;
    const suppOptions   = _suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    const body = `
      <p style="font-size:.82rem;color:var(--tx-2);margin-bottom:1rem">
        تم تحديد <strong>${checked.length} صنف</strong> موزعة على <strong>${supplierCount} مورد</strong>.
        عدّل الكميات المطلوبة واختر المورد المناسب لكل مجموعة.
      </p>
      ${Object.entries(bySupplier).map(([suppId, items], idx) => {
        const sup = _suppliers.find(s => s.id === suppId);
        return `
        <div class="card" style="margin-bottom:1rem">
          <div class="card-head">
            <span class="card-title"><i class="fas fa-truck-medical"></i> مجموعة ${idx+1}</span>
          </div>
          <div class="card-body">
            <label class="mf-field" style="margin-bottom:.75rem">
              <span>المورد</span>
              <select class="form-control po-group-sup" data-group="${idx}">
                <option value="">اختر مورداً</option>${suppOptions}
              </select>
            </label>
            <table class="dtable">
              <thead><tr><th>الدواء</th><th>الكمية المطلوبة</th><th>سعر الوحدة</th></tr></thead>
              <tbody>
                ${items.map((item, ii) => `<tr>
                  <td>${item.med_name}</td>
                  <td><input type="number" min="1" value="${_meds.find(m=>m.id===item.med_id)?.minStock||10}"
                      class="form-control po-qty-inp" style="width:80px"
                      data-group="${idx}" data-ii="${ii}" data-med="${item.med_id}" data-name="${item.med_name}"></td>
                  <td><input type="number" min="0" step="0.01" value="${item.cost}"
                      class="form-control po-cost-inp" style="width:100px"
                      data-group="${idx}" data-ii="${ii}"></td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
      }).join('')}`;

    Modal.open({
      title: '<i class="fas fa-cart-flatbed"></i> إنشاء أوامر شراء من الكشكول',
      size: 'lg',
      body,
      foot: `<div class="mf-foot-note"><i class="fas fa-circle-info"></i> سيُنشأ أمر شراء لكل مجموعة مورد</div>
             <div class="mf-foot-actions">
               <button class="btn btn-ghost" onclick="Modal.close()">إلغاء</button>
               <button class="btn btn-primary" id="confirmShPoBtn"><i class="fas fa-check"></i> إنشاء الأوامر</button>
             </div>`,
    });

    // تعيين قيمة المورد الافتراضية
    document.querySelectorAll('.po-group-sup').forEach((sel, idx) => {
      const entries = Object.entries(bySupplier);
      const suppId  = entries[idx]?.[0];
      if (suppId) sel.value = suppId;
    });

    document.getElementById('confirmShPoBtn')?.addEventListener('click', async () => {
      const groups = [...document.querySelectorAll('.po-group-sup')].map((sel, idx) => {
        const qtyInps  = [...document.querySelectorAll(`.po-qty-inp[data-group="${idx}"]`)];
        const costInps = [...document.querySelectorAll(`.po-cost-inp[data-group="${idx}"]`)];
        const items    = qtyInps.map((inp, ii) => ({
          med_id:      inp.dataset.med,
          med_name:    inp.dataset.name,
          qty_ordered: parseInt(inp.value) || 1,
          unit_cost:   parseFloat(costInps[ii]?.value) || 0,
        })).filter(i => i.qty_ordered > 0);
        return { supplier_id: sel.value, items };
      }).filter(g => g.supplier_id && g.items.length);

      if (!groups.length) { Toast.warn('تنبيه', 'اختر مورداً لكل مجموعة'); return; }

      const btn = document.getElementById('confirmShPoBtn');
      btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';

      let created = 0;
      for (const group of groups) {
        try {
          await DB.addPurchase(group);
          created++;
        } catch(e) { console.error(e); }
      }

      if (created > 0) {
        Toast.ok('تم', `تم إنشاء ${created} أمر شراء`);
        Modal.close();
        await _load();
      } else {
        Toast.err('خطأ', 'فشل إنشاء أوامر الشراء');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> إنشاء الأوامر';
      }
    });
  }

  function exportData() {
    exportCSV('كشكول_النواقص',
      ['الدواء', 'الفئة', 'المخزون الحالي', 'الوحدة', 'الحد الأدنى', 'الحالة', 'المورد', 'آخر سعر شراء'],
      _meds.map(m => {
        const sup = _suppliers.find(s => s.id === m.supplierId);
        return [m.name, m.category, m.stock, m.unit, m.minStock,
                m.stock === 0 ? 'نفد' : 'منخفض', sup?.name || '—', m.cost];
      })
    );
  }

  return { render, afterRender };
})();
