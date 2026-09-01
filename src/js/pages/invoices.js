/* ════════════════════════════════════════════════════════════
   PAGE: INVOICES  (async)
════════════════════════════════════════════════════════════ */
'use strict';

const InvoicesPage = (() => {
  let _search = '';
  let _allSales = [];
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
    ${Array(3).fill('<div class="stat-card c-teal"><div class="skeleton" style="height:80px;border-radius:8px"></div></div>').join('')}
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
    document.getElementById('invSearch')?.addEventListener('input', debounce(e=>{
      _search=e.target.value.trim(); renderTable();
    },300));
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
      const total   = _allSales.reduce((a,s)=>a+s.total,0);
      const stats   = document.getElementById('invStats');
      if (stats) stats.innerHTML = `
        <div class="stat-card c-teal">
          <div class="sc-header"><div class="sc-icon"><i class="fas fa-receipt"></i></div></div>
          <div class="sc-val">${_allSales.length}</div><div class="sc-label">إجمالي الفواتير</div>
        </div>
        <div class="stat-card c-amber">
          <div class="sc-header"><div class="sc-icon"><i class="fas fa-coins"></i></div></div>
          <div class="sc-val" style="font-size:1.3rem">${Fmt.money(total)}</div><div class="sc-label">إجمالي الإيرادات</div>
        </div>
        <div class="stat-card c-ok">
          <div class="sc-header"><div class="sc-icon"><i class="fas fa-calculator"></i></div></div>
          <div class="sc-val" style="font-size:1.3rem">${Fmt.money(total/Math.max(_allSales.length,1))}</div><div class="sc-label">متوسط الفاتورة</div>
        </div>`;
      renderTable();
    } catch(e) { Toast.err('خطأ', e.message); }
  }

  function renderTable() {
    const tbody = document.getElementById('invTbody');
    const pager = document.getElementById('invPager');
    if (!tbody) return;
    let list = [..._allSales];
    // FEAT [1]: Arabic-aware search
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
      if (pager) pager.innerHTML=''; return;
    }

    const pg = Paginator(list, 10);
    const draw = () => {
      tbody.innerHTML = pg.slice().map(s=>`
        <tr>
          <td><strong>${s.invoiceNum}</strong></td>
          <td>${s.patientName}</td>
          <td>${Fmt.dateShort(s.date)}</td>
          <td>${s.time}</td>
          <td style="font-weight:700;color:var(--teal-600)">${Fmt.money(s.total)}</td>
          <td>${s.discount>0?`<span style="color:var(--ok)">−${Fmt.money(s.discount)}</span>`:'—'}</td>
          <td><span class="badge bdg-teal">${s.paymentMethod}</span></td>
          <td><span class="badge bdg-ok">${s.status}</span></td>
          <td>
            <div class="td-actions">
              <button class="btn btn-ghost btn-icon sm" data-action="view" data-id="${s.id}" title="عرض"><i class="fas fa-eye"></i></button>
              <button class="btn btn-outline btn-icon sm" data-action="print" data-id="${s.id}" title="طباعة"><i class="fas fa-print"></i></button>
            </div>
          </td>
        </tr>`).join('');

      tbody.querySelectorAll('[data-action]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const s = _allSales.find(x=>x.id===btn.dataset.id);
          if (!s) return;
          if (btn.dataset.action==='view')  _viewSale(s);
          if (btn.dataset.action==='print') _printSale(s);
        });
      });
      pg.render(pager);
    };
    draw();
    document.getElementById('invPager')?.addEventListener('click', draw);
  }

  function _receipt(s) {
    return `
    <div class="receipt">
      <div class="rcp-head">
        ${_pharmacyLogo ? `<img src="${_pharmacyLogo}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;margin-bottom:.4rem" />` : ''}
        <div class="rcp-title">${_pharmacyName}</div>
        <div class="rcp-sub">${s.date} — ${s.time}</div>
      </div>
      <div class="rcp-div"></div>
      <div class="rcp-row"><span>رقم الفاتورة</span><span>${s.invoiceNum}</span></div>
      <div class="rcp-row"><span>العميل</span><span>${s.patientName}</span></div>
      ${(_showCashier && s.cashier) ? `<div class="rcp-row"><span>الصيدلي/الطبيب المسؤول</span><span>${s.cashier}</span></div>` : ''}
      <div class="rcp-row"><span>طريقة الدفع</span><span>${s.paymentMethod}</span></div>
      <div class="rcp-div"></div>
      ${(s.items||[]).map(i=>`
        <div class="rcp-row"><span>${i.name}</span><span>${Fmt.money(i.total)}</span></div>
        <div class="rcp-row" style="font-size:.72rem;color:var(--tx-3)"><span>${i.qty} × ${Fmt.money(i.price)}</span></div>
      `).join('')}
      <div class="rcp-div"></div>
      <div class="rcp-row"><span>المجموع الفرعي</span><span>${Fmt.money(s.subtotal)}</span></div>
      ${s.discount>0?`<div class="rcp-row"><span>الخصم</span><span>− ${Fmt.money(s.discount)}</span></div>`:''}
      ${(_showTax && s.tax>0)?`<div class="rcp-row"><span>الضريبة</span><span>${Fmt.money(s.tax)}</span></div>`:''}
      <div class="rcp-div"></div>
      <div class="rcp-row total"><span>الإجمالي</span><span>${Fmt.money(s.total)}</span></div>
      <div class="rcp-barcode">
        ${BarcodeGenerator.generateSVG(s.invoiceNum, { height: 28, includeText: true })}
      </div>
    </div>`;
  }

  function _viewSale(s) {
    Modal.open({
      title: `<i class="fas fa-receipt"></i> ${s.invoiceNum}`,
      size: 'sm',
      body: `<div id="invRcpPrint">${_receipt(s)}</div>`,
      foot: `<button class="btn btn-primary" onclick="printElement('invRcpPrint')"><i class="fas fa-print"></i> طباعة</button>
             <button class="btn btn-ghost" onclick="Modal.close()">إغلاق</button>`,
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
      ['رقم الفاتورة','العميل','التاريخ','الوقت','المجموع','الخصم','الضريبة','الإجمالي','طريقة الدفع','الحالة'],
      _allSales.map(s=>[s.invoiceNum,s.patientName,s.date,s.time,s.subtotal,s.discount,s.tax,s.total,s.paymentMethod,s.status])
    );
  }

  return { render, afterRender };
})();
