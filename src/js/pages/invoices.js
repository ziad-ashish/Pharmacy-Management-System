/* ════════════════════════════════════════════════════════════
   PAGE: INVOICES  (async) — v2
   • زر إلغاء الفاتورة مع تأكيد
   • فلتر الحالة (الكل / مكتملة / ملغاة)
   • إحصاء منفصل للمكتمل والملغي
════════════════════════════════════════════════════════════ */
'use strict';

const InvoicesPage = (() => {
  let _search      = '';
  let _statusFilter = 'all';
  let _allSales    = [];
  let _pharmacyName = 'صيدلية الشفاء';
  let _pharmacyLogo = '';
  let _showTax     = true;
  let _showCashier = true;

  function render() {
    return `
<div class="page active" id="page-invoices">
  <div class="pg-header">
    <div class="pg-title-group">
      <h1 class="pg-title">
        <div class="pg-title-icon" style="background:var(--teal-50);color:var(--teal-500)"><i class="fas fa-file-invoice-dollar"></i></div>
        سجل الفواتير
      </h1>
      <p class="pg-subtitle">جميع فواتير المبيعات</p>
    </div>
    <div class="pg-actions">
      <button class="btn btn-ghost btn-sm" id="invExportBtn"><i class="fas fa-download"></i> تصدير CSV</button>
      <button class="btn btn-primary btn-sm" onclick="App.navigate('sales')"><i class="fas fa-plus"></i> فاتورة جديدة</button>
    </div>
  </div>

  <div class="stats-grid" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr));margin-bottom:1.2rem" id="invStats">
    ${Array(4).fill('<div class="stat-card c-teal"><div class="skeleton" style="height:80px;border-radius:8px"></div></div>').join('')}
  </div>

  <!-- تبويبات الحالة -->
  <div class="tabs" id="invStatusTabs" style="margin-bottom:.8rem">
    <button class="tab-btn active" data-sf="all">الكل</button>
    <button class="tab-btn" data-sf="مكتمل">مكتملة</button>
    <button class="tab-btn" data-sf="ملغاة">ملغاة</button>
  </div>

  <div class="card">
    <div class="card-head">
      <div class="tb-srch">
        <i class="fas fa-magnifying-glass"></i>
        <input type="search" id="invSearch" placeholder="بحث بالفاتورة أو الاسم..." />
      </div>
    </div>
    <div class="card-body p0">
      <div class="tbl-wrap">
        <table class="dtable">
          <thead><tr>
            <th>رقم الفاتورة</th><th>العميل</th><th>التاريخ</th><th>الوقت</th>
            <th>الإجمالي</th><th>الخصم</th><th>الدفع</th><th>الحالة</th><th>الإجراءات</th>
          </tr></thead>
          <tbody id="invTbody">
            <tr><td colspan="9"><div class="empty-state">
              <div class="es-icon an-spin"><i class="fas fa-circle-notch"></i></div>
              <h3 class="es-title">جارٍ التحميل...</h3>
            </div></td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="card-foot"><div class="pagination" id="invPager"></div></div>
  </div>
</div>`;
  }

  async function afterRender() {
    document.getElementById('invExportBtn')?.addEventListener('click', exportData);
    document.getElementById('invSearch')?.addEventListener('input', debounce(e => {
      _search = e.target.value.trim(); renderTable();
    }, 300));

    // تبويبات الحالة
    document.getElementById('invStatusTabs')?.addEventListener('click', e => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      _statusFilter = btn.dataset.sf;
      document.querySelectorAll('#invStatusTabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTable();
    });

    try {
      const [name, logo, showTaxSetting, showCashierSetting] = await Promise.all([
        DB.getSetting('pharmacy_name'),
        DB.getSetting('pharmacy_logo'),
        DB.getSetting('invoice_show_tax'),
        DB.getSetting('invoice_show_cashier'),
      ]);
      if (name) _pharmacyName = name;
      if (logo) _pharmacyLogo = logo;
      _showTax     = showTaxSetting !== '0';
      _showCashier = showCashierSetting !== '0';
    } catch(e) { /* keep default */ }
    await _load();
  }

  async function _load() {
    try {
      _allSales = await DB.getSales();

      const completed = _allSales.filter(s => s.status === 'مكتمل');
      const voided    = _allSales.filter(s => s.status === 'ملغاة');
      const totalRev  = completed.reduce((a, s) => a + s.total, 0);
      const totalVoid = voided.reduce((a, s) => a + s.total, 0);

      const stats = document.getElementById('invStats');
      if (stats) stats.innerHTML = `
        <div class="stat-card c-teal">
          <div class="sc-header"><div class="sc-icon"><i class="fas fa-receipt"></i></div></div>
          <div class="sc-val">${_allSales.length}</div><div class="sc-label">إجمالي الفواتير</div>
        </div>
        <div class="stat-card c-ok">
          <div class="sc-header"><div class="sc-icon"><i class="fas fa-check-circle"></i></div></div>
          <div class="sc-val">${completed.length}</div><div class="sc-label">فواتير مكتملة</div>
        </div>
        <div class="stat-card c-amber">
          <div class="sc-header"><div class="sc-icon"><i class="fas fa-coins"></i></div></div>
          <div class="sc-val" style="font-size:1.3rem">${Fmt.money(totalRev)}</div><div class="sc-label">إجمالي الإيرادات</div>
        </div>
        <div class="stat-card c-err">
          <div class="sc-header"><div class="sc-icon"><i class="fas fa-ban"></i></div></div>
          <div class="sc-val">${voided.length}</div><div class="sc-label">فواتير ملغاة${voided.length > 0 ? ` (${Fmt.money(totalVoid)})` : ''}</div>
        </div>`;

      // تحديث badges التبويبات
      const tabs = document.querySelectorAll('#invStatusTabs .tab-btn');
      if (tabs[0]) tabs[0].innerHTML = `الكل <span class="badge bdg-slate">${_allSales.length}</span>`;
      if (tabs[1]) tabs[1].innerHTML = `مكتملة <span class="badge bdg-ok">${completed.length}</span>`;
      if (tabs[2]) tabs[2].innerHTML = `ملغاة <span class="badge bdg-err">${voided.length}</span>`;

      renderTable();
    } catch(e) { Toast.err('خطأ', e.message); }
  }

  function renderTable() {
    const tbody = document.getElementById('invTbody');
    const pager = document.getElementById('invPager');
    if (!tbody) return;

    let list = [..._allSales];

    // فلتر الحالة
    if (_statusFilter !== 'all') list = list.filter(s => s.status === _statusFilter);

    // بحث
    if (_search) {
      const q = normalizeArabicText(_search);
      list = list.filter(s =>
        s.invoiceNum.includes(_search) ||
        normalizeArabicText(s.patientName).includes(q)
      );
    }

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">
        <div class="es-icon"><i class="fas fa-file-invoice-dollar"></i></div>
        <h3 class="es-title">لا توجد فواتير</h3>
      </div></td></tr>`;
      if (pager) pager.innerHTML = ''; return;
    }

    const pg = Paginator(list, 10);
    const draw = () => {
      tbody.innerHTML = pg.slice().map(s => {
        const isVoid = s.status === 'ملغاة';
        return `
        <tr style="${isVoid ? 'opacity:.6' : ''}">
          <td><strong>${s.invoiceNum}</strong></td>
          <td>${s.patientName}</td>
          <td>${Fmt.dateShort(s.date)}</td>
          <td>${s.time}</td>
          <td style="font-weight:700;color:${isVoid ? 'var(--tx-3)' : 'var(--teal-600)'}">
            ${isVoid ? `<s>${Fmt.money(s.total)}</s>` : Fmt.money(s.total)}
          </td>
          <td>${s.discount > 0 ? `<span style="color:var(--ok)">−${Fmt.money(s.discount)}</span>` : '—'}</td>
          <td><span class="badge bdg-teal">${s.paymentMethod}</span></td>
          <td><span class="badge ${isVoid ? 'bdg-err' : 'bdg-ok'}">${s.status}</span></td>
          <td>
            <div class="td-actions">
              <button class="btn btn-ghost btn-icon sm" data-action="view"  data-id="${s.id}" title="عرض"><i class="fas fa-eye"></i></button>
              <button class="btn btn-ghost btn-icon sm" data-action="print" data-id="${s.id}" title="طباعة"><i class="fas fa-print"></i></button>
              ${!isVoid ? `<button class="btn btn-ghost btn-icon sm" data-action="void" data-id="${s.id}" data-num="${s.invoiceNum}" title="إلغاء الفاتورة" style="color:var(--err)"><i class="fas fa-ban"></i></button>` : ''}
            </div>
          </td>
        </tr>`;
      }).join('');

      tbody.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
          const s = _allSales.find(x => x.id === btn.dataset.id);
          if (btn.dataset.action === 'view'  && s) _viewSale(s);
          if (btn.dataset.action === 'print' && s) _printSale(s);
          if (btn.dataset.action === 'void')        _confirmVoid(btn.dataset.id, btn.dataset.num);
        });
      });
      pg.render(pager);
    };
    draw();
    pager?.addEventListener('click', draw);
  }

  /* ── إلغاء الفاتورة ────────────────────────────────────── */
  function _confirmVoid(saleId, invoiceNum) {
    Modal.confirm(
      `إلغاء الفاتورة ${invoiceNum}`,
      `هل أنت متأكد من إلغاء هذه الفاتورة؟\nسيتم استعادة الكميات إلى المخزون تلقائياً ولا يمكن التراجع عن هذا الإجراء.`,
      async () => {
        try {
          await DB.voidSale(saleId);
          Toast.ok('تم الإلغاء', `تم إلغاء الفاتورة ${invoiceNum} واستعادة المخزون`);
          await _load();
        } catch(e) {
          Toast.err('فشل الإلغاء', e.message);
        }
      },
      'تأكيد الإلغاء',
      'btn-danger'
    );
  }

  /* ── إيصال الفاتورة ────────────────────────────────────── */
  function _receipt(s) {
    const isVoid = s.status === 'ملغاة';
    return `
    <div class="receipt">
      <div class="rcp-head">
        ${_pharmacyLogo ? `<img src="${_pharmacyLogo}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;margin-bottom:.4rem" />` : ''}
        <div class="rcp-title">${_pharmacyName}</div>
        <div class="rcp-sub">${s.date} — ${s.time}</div>
        ${isVoid ? `<div style="color:var(--err);font-weight:800;font-size:.9rem;margin-top:.3rem">⚠ فاتورة ملغاة</div>` : ''}
      </div>
      <div class="rcp-div"></div>
      <div class="rcp-row"><span>رقم الفاتورة</span><span>${s.invoiceNum}</span></div>
      <div class="rcp-row"><span>العميل</span><span>${s.patientName}</span></div>
      ${(_showCashier && s.cashier) ? `<div class="rcp-row"><span>الصيدلي</span><span>${s.cashier}</span></div>` : ''}
      <div class="rcp-row"><span>طريقة الدفع</span><span>${s.paymentMethod}</span></div>
      <div class="rcp-div"></div>
      ${(s.items || []).map(i => `
        <div class="rcp-row"><span>${i.name}</span><span>${Fmt.money(i.total)}</span></div>
        <div class="rcp-row" style="font-size:.72rem;color:var(--tx-3)"><span>${i.qty} × ${Fmt.money(i.price)}</span></div>
      `).join('')}
      <div class="rcp-div"></div>
      <div class="rcp-row"><span>المجموع الفرعي</span><span>${Fmt.money(s.subtotal)}</span></div>
      ${s.discount > 0 ? `<div class="rcp-row"><span>الخصم</span><span>− ${Fmt.money(s.discount)}</span></div>` : ''}
      ${(_showTax && s.tax > 0) ? `<div class="rcp-row"><span>الضريبة</span><span>${Fmt.money(s.tax)}</span></div>` : ''}
      <div class="rcp-div"></div>
      <div class="rcp-row total"><span>الإجمالي</span><span>${Fmt.money(s.total)}</span></div>
      <div class="rcp-barcode">
        ${BarcodeGenerator.generateSVG(s.invoiceNum, { height: 28, includeText: true })}
      </div>
      ${isVoid && s.voidedAt ? `<div style="font-size:.65rem;color:var(--tx-3);text-align:center;margin-top:.5rem">تم الإلغاء: ${new Date(s.voidedAt).toLocaleString('ar-EG')}</div>` : ''}
    </div>`;
  }

  function _viewSale(s) {
    Modal.open({
      title: `<i class="fas fa-receipt"></i> ${s.invoiceNum}`,
      size: 'sm',
      body: `<div id="invRcpPrint">${_receipt(s)}</div>`,
      foot: `
        <button class="btn btn-primary" onclick="printElement('invRcpPrint')"><i class="fas fa-print"></i> طباعة</button>
        ${s.status !== 'ملغاة' ? `<button class="btn btn-ghost" style="color:var(--err)" id="voidFromViewBtn"><i class="fas fa-ban"></i> إلغاء</button>` : ''}
        <button class="btn btn-ghost" onclick="Modal.close()">إغلاق</button>`,
    });
    document.getElementById('voidFromViewBtn')?.addEventListener('click', () => {
      Modal.close();
      _confirmVoid(s.id, s.invoiceNum);
    });
  }

  function _printSale(s) {
    const tmp = document.createElement('div');
    tmp.id = 'tempDirectInvoicePrint';
    tmp.style.display = 'none';
    tmp.innerHTML = _receipt(s);
    document.body.appendChild(tmp);
    printElement('tempDirectInvoicePrint', `فاتورة ${s.invoiceNum}`);
    setTimeout(() => tmp.remove(), 2000);
  }

  function exportData() {
    exportCSV('الفواتير',
      ['رقم الفاتورة', 'العميل', 'التاريخ', 'الوقت', 'المجموع', 'الخصم', 'الضريبة', 'الإجمالي', 'طريقة الدفع', 'الحالة'],
      _allSales.map(s => [s.invoiceNum, s.patientName, s.date, s.time, s.subtotal, s.discount, s.tax, s.total, s.paymentMethod, s.status])
    );
  }

  return { render, afterRender };
})();
