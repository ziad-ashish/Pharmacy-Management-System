/* ════════════════════════════════════════════════════════════
   PAGE: REPORTS  (async)
════════════════════════════════════════════════════════════ */
'use strict';

const ReportsPage = (() => {

  function render() {
    return `
<div class="page active" id="page-reports">
  <div class="pg-header">
    <div class="pg-title-group">
      <h1 class="pg-title">
        <div class="pg-title-icon" style="background:var(--sl-100);color:var(--sl-600)"><i class="fas fa-chart-bar"></i></div>
        التقارير والإحصائيات
      </h1>
      <p class="pg-subtitle">تحليل شامل لأداء الصيدلية</p>
    </div>
    <div class="pg-actions">
      <button class="btn btn-ghost btn-sm" id="rptExportBtn"><i class="fas fa-download"></i> تصدير</button>
      <button class="btn btn-ghost btn-sm" onclick="window.print()"><i class="fas fa-print"></i> طباعة</button>
    </div>
  </div>

  <div class="tabs" id="rptTabs">
    <button class="tab-btn active" data-tab="overview">نظرة عامة</button>
    <button class="tab-btn" data-tab="sales">تقرير المبيعات</button>
    <button class="tab-btn" data-tab="inventory">تقرير المخزون</button>
    <button class="tab-btn" data-tab="financial">التقرير المالي</button>
  </div>

  <div id="rptContent">
    <div class="empty-state">
      <div class="es-icon an-spin"><i class="fas fa-circle-notch"></i></div>
      <h3 class="es-title">جارٍ تحميل التقارير...</h3>
    </div>
  </div>
</div>`;
  }

  let _data = {};

  async function afterRender() {
    document.getElementById('rptExportBtn')?.addEventListener('click', ()=>_exportFull());
    document.getElementById('rptTabs')?.addEventListener('click', e=>{
      const btn=e.target.closest('.tab-btn'); if(!btn) return;
      document.querySelectorAll('#rptTabs .tab-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      _renderTab(btn.dataset.tab);
    });

    try {
      const [stats, monthly, topMeds, catDist, sales, meds, low] = await Promise.all([
        DB.getStats(), DB.getMonthlySales(), DB.getTopMeds(), DB.getCatDist(),
        DB.getSales(), DB.getMedicines(), DB.getLowStock(),
      ]);
      _data = { stats, monthly, topMeds, catDist, sales, meds, low };
      _renderTab('overview');
    } catch(e) {
      document.getElementById('rptContent').innerHTML =
        `<div class="alert err"><i class="fas fa-circle-xmark"></i> ${e.message}</div>`;
    }
  }

  function _renderTab(tab) {
    const { stats, monthly, topMeds, catDist, sales, meds, low } = _data;
    const today    = new Date().toISOString().split('T')[0];
    const month    = new Date().toISOString().slice(0,7);
    const weekAgo  = new Date(Date.now()-7*86400000).toISOString().split('T')[0];
    const todaySls = sales.filter(s=>s.date===today);
    const weekSls  = sales.filter(s=>s.date>=weekAgo);
    const monthSls = sales.filter(s=>s.date.startsWith(month));
    const payMap   = {};
    sales.forEach(s=>{ payMap[s.paymentMethod]=(payMap[s.paymentMethod]||0)+s.total; });

    const content = document.getElementById('rptContent');
    if (!content) return;

    if (tab === 'overview') {
      content.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem;margin-bottom:1.5rem">
        <div class="rpt-card"><div class="rpt-card-val" style="color:var(--teal-600)">${Fmt.money(todaySls.reduce((a,s)=>a+s.total,0))}</div><div class="rpt-card-lbl">إيرادات اليوم</div><div class="rpt-card-sub">${todaySls.length} عملية</div></div>
        <div class="rpt-card"><div class="rpt-card-val" style="color:var(--amb-600)">${Fmt.money(weekSls.reduce((a,s)=>a+s.total,0))}</div><div class="rpt-card-lbl">إيرادات الأسبوع</div><div class="rpt-card-sub">${weekSls.length} عملية</div></div>
        <div class="rpt-card"><div class="rpt-card-val" style="color:var(--ok)">${Fmt.money(monthSls.reduce((a,s)=>a+s.total,0))}</div><div class="rpt-card-lbl">إيرادات الشهر</div><div class="rpt-card-sub">${monthSls.length} عملية</div></div>
        <div class="rpt-card"><div class="rpt-card-val">${Fmt.money(stats.totalRevenue)}</div><div class="rpt-card-lbl">إجمالي الإيرادات</div><div class="rpt-card-sub">${stats.totalSales} فاتورة</div></div>
      </div>
      <div class="g2">
        <div class="card">
          <div class="card-head"><span class="card-title"><i class="fas fa-chart-bar"></i> الإيرادات الشهرية</span></div>
          <div class="card-body"><div class="bar-chart tall" id="rptMonthly"></div></div>
        </div>
        <div class="card">
          <div class="card-head"><span class="card-title"><i class="fas fa-credit-card"></i> طرق الدفع</span></div>
          <div class="card-body"><div id="rptPayDonut"></div></div>
        </div>
      </div>
      <div class="card" style="margin-top:1.2rem">
        <div class="card-head"><span class="card-title"><i class="fas fa-trophy"></i> أكثر الأدوية مبيعاً</span></div>
        <div class="card-body">
          ${topMeds.map((m,i)=>{
            const max=topMeds[0]?.qty||1;
            return `<div style="display:flex;align-items:center;gap:1rem;margin-bottom:.75rem">
              <span style="min-width:24px;font-weight:700;color:var(--tx-3)">${i+1}</span>
              <span style="flex:1;font-weight:600">${m.name}</span>
              <div style="flex:2"><div class="progress" style="height:9px">
                <div class="progress-fill" style="width:${Math.round(m.qty/max*100)}%;background:${['var(--teal-500)','var(--amb-400)','var(--ok)','var(--sl-400)','var(--sl-300)'][i]}"></div>
              </div></div>
              <span style="min-width:50px;text-align:left;font-size:.8rem;color:var(--tx-3)">${Fmt.num(m.qty)}</span>
              <span style="min-width:90px;text-align:left;font-weight:700;color:var(--teal-600)">${Fmt.money(m.revenue)}</span>
            </div>`;
          }).join('')}
        </div>
      </div>`;
      requestAnimationFrame(()=>{
        renderBarChart('rptMonthly', monthly.labels.map(l=>l.slice(0,3)), monthly.values, 'linear-gradient(180deg,var(--teal-400),var(--teal-700))');
        renderDonut('rptPayDonut',
          Object.entries(payMap).map(([label,value])=>({label,value:Math.round(value)})),
          sales.length,'فاتورة');
      });

    } else if (tab === 'sales') {
      content.innerHTML = `
      <div class="card">
        <div class="card-head"><span class="card-title"><i class="fas fa-receipt"></i> سجل المبيعات</span>
          <button class="btn btn-ghost btn-sm" id="expSalesBtn"><i class="fas fa-download"></i> تصدير</button></div>
        <div class="card-body p0"><div class="tbl-wrap"><table class="dtable">
          <thead><tr><th>الفاتورة</th><th>التاريخ</th><th>العميل</th><th>أصناف</th><th>الخصم</th><th>الضريبة</th><th>الإجمالي</th><th>الدفع</th></tr></thead>
          <tbody>${sales.map(s=>`<tr>
            <td><strong>${s.invoiceNum}</strong></td>
            <td>${Fmt.dateShort(s.date)} ${s.time}</td>
            <td>${s.patientName}</td>
            <td>${(s.items||[]).length}</td>
            <td>${s.discount>0?Fmt.money(s.discount):'—'}</td>
            <td>${Fmt.money(s.tax)}</td>
            <td style="font-weight:700;color:var(--teal-600)">${Fmt.money(s.total)}</td>
            <td><span class="badge bdg-teal">${s.paymentMethod}</span></td>
          </tr>`).join('')}</tbody>
        </table></div></div>
      </div>`;
      document.getElementById('expSalesBtn')?.addEventListener('click',()=>_exportFull());

    } else if (tab === 'inventory') {
      const totSell = meds.reduce((a,m)=>a+(m.price*m.stock),0);
      const totCost = meds.reduce((a,m)=>a+(m.cost*m.stock),0);
      content.innerHTML = `
      <div class="g2" style="margin-bottom:1.2rem">
        <div class="card">
          <div class="card-head"><span class="card-title"><i class="fas fa-layer-group"></i> توزيع الأصناف</span></div>
          <div class="card-body"><div id="rptCatDonut"></div></div>
        </div>
        <div class="card">
          <div class="card-head"><span class="card-title"><i class="fas fa-boxes-stacked"></i> ملخص المخزون</span></div>
          <div class="card-body">
            <div class="detail-row"><span class="dr-label">إجمالي الأدوية</span><span class="dr-val">${meds.length}</span></div>
            <div class="detail-row"><span class="dr-label">قيمة المخزون (بيع)</span><span class="dr-val" style="color:var(--ok)">${Fmt.money(totSell)}</span></div>
            <div class="detail-row"><span class="dr-label">قيمة المخزون (تكلفة)</span><span class="dr-val" style="color:var(--teal-600)">${Fmt.money(totCost)}</span></div>
            <div class="detail-row"><span class="dr-label">الربح المتوقع</span><span class="dr-val" style="color:var(--amb-600)">${Fmt.money(totSell-totCost)}</span></div>
            <div class="detail-row"><span class="dr-label">مخزون منخفض</span><span class="dr-val" style="color:var(--err)">${low.length} صنف</span></div>
          </div>
        </div>
      </div>
      ${low.length?`<div class="card">
        <div class="card-head"><span class="card-title" style="color:var(--warn)"><i class="fas fa-triangle-exclamation"></i> مخزون منخفض</span></div>
        <div class="card-body p0"><div class="tbl-wrap"><table class="dtable">
          <thead><tr><th>الدواء</th><th>الفئة</th><th>المخزون</th><th>الحد الأدنى</th><th>الحالة</th></tr></thead>
          <tbody>${low.map(m=>`<tr>
            <td class="font-bold">${m.name}</td><td>${m.category}</td>
            <td style="color:${m.stock===0?'var(--err)':'var(--warn)'};font-weight:700">${m.stock} ${m.unit}</td>
            <td>${m.minStock}</td>
            <td>${m.stock===0?'<span class="badge bdg-err">نفد</span>':'<span class="badge bdg-warn">منخفض</span>'}</td>
          </tr>`).join('')}</tbody>
        </table></div></div>
      </div>`:''}`;
      requestAnimationFrame(()=>{
        renderDonut('rptCatDonut',catDist.slice(0,6).map(c=>({label:c.cat,value:c.count})),meds.length,'دواء');
      });

    } else if (tab === 'financial') {
      const totTax  = sales.reduce((a,s)=>a+s.tax,0);
      const totDisc = sales.reduce((a,s)=>a+s.discount,0);
      content.innerHTML = `
      <div class="g3" style="margin-bottom:1.2rem">
        <div class="rpt-card"><div class="rpt-card-val" style="color:var(--teal-600)">${Fmt.money(stats.totalRevenue)}</div><div class="rpt-card-lbl">إجمالي الإيرادات</div></div>
        <div class="rpt-card"><div class="rpt-card-val" style="color:var(--err)">${Fmt.money(totTax)}</div><div class="rpt-card-lbl">الضرائب المحصلة</div></div>
        <div class="rpt-card"><div class="rpt-card-val" style="color:var(--ok)">${Fmt.money(totDisc)}</div><div class="rpt-card-lbl">إجمالي الخصومات</div></div>
      </div>
      <div class="g2">
        <div class="card">
          <div class="card-head"><span class="card-title"><i class="fas fa-coins"></i> توزيع الإيرادات حسب الدفع</span></div>
          <div class="card-body">
            ${Object.entries(payMap).map(([method,amt])=>{
              const pct=Math.round(amt/stats.totalRevenue*100)||0;
              return `<div style="margin-bottom:.85rem">
                <div style="display:flex;justify-content:space-between;margin-bottom:.3rem;font-size:.84rem">
                  <span class="font-bold">${method}</span>
                  <span style="color:var(--teal-600);font-weight:700">${Fmt.money(amt)} (${pct}%)</span>
                </div>
                <div class="progress"><div class="progress-fill" style="width:${pct}%;background:var(--teal-400)"></div></div>
              </div>`;
            }).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><span class="card-title"><i class="fas fa-calendar-days"></i> أداء اليوم</span></div>
          <div class="card-body">
            <div class="detail-row"><span class="dr-label">عدد الفواتير</span><span class="dr-val">${todaySls.length}</span></div>
            <div class="detail-row"><span class="dr-label">الإيرادات</span><span class="dr-val" style="color:var(--teal-600)">${Fmt.money(todaySls.reduce((a,s)=>a+s.total,0))}</span></div>
            <div class="detail-row"><span class="dr-label">متوسط الفاتورة</span><span class="dr-val">${Fmt.money(todaySls.reduce((a,s)=>a+s.total,0)/Math.max(todaySls.length,1))}</span></div>
            <div class="detail-row"><span class="dr-label">الضرائب</span><span class="dr-val">${Fmt.money(todaySls.reduce((a,s)=>a+s.tax,0))}</span></div>
            <div class="detail-row"><span class="dr-label">الخصومات</span><span class="dr-val">${Fmt.money(todaySls.reduce((a,s)=>a+s.discount,0))}</span></div>
          </div>
        </div>
      </div>`;
    }
  }

  function _exportFull() {
    exportCSV('التقرير_الشامل',
      ['الفاتورة','التاريخ','العميل','المجموع','الخصم','الضريبة','الإجمالي','الدفع'],
      (_data.sales||[]).map(s=>[s.invoiceNum,s.date,s.patientName,s.subtotal,s.discount,s.tax,s.total,s.paymentMethod])
    );
  }

  return { render, afterRender };
})();
