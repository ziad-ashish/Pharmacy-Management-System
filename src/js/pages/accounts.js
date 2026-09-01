/* ════════════════════════════════════════════════════════════
   PAGE: ACCOUNTS — الحسابات المالية
   • ملخص مالي شامل (دخل / مصروف / صافي)
   • إدارة الحسابات (صندوق / بنك / مصروف)
   • سجل المعاملات مع فلتر
   • إضافة معاملة جديدة
   • تسوية نهاية اليوم (cash session)
════════════════════════════════════════════════════════════ */
'use strict';

const AccountsPage = (() => {
  let _summary     = null;
  let _transactions = [];
  let _accounts    = [];
  let _activeTab   = 'summary';
  let _session     = null;

  function render() {
    return `
<div class="page active" id="page-accounts">
  <div class="pg-header">
    <div class="pg-title-group">
      <h1 class="pg-title">
        <div class="pg-title-icon" style="background:#d1fae5;color:#059669"><i class="fas fa-wallet"></i></div>
        الحسابات المالية
      </h1>
      <p class="pg-subtitle">إدارة الإيرادات والمصروفات والأرصدة</p>
    </div>
    <div class="pg-actions">
      <button class="btn btn-ghost btn-sm" id="acExportBtn"><i class="fas fa-download"></i> تصدير</button>
      <button class="btn btn-primary" id="acAddTxBtn"><i class="fas fa-plus"></i> معاملة جديدة</button>
    </div>
  </div>

  <div class="tabs" id="acTabs" style="margin-bottom:1rem">
    <button class="tab-btn active" data-at="summary">الملخص المالي</button>
    <button class="tab-btn" data-at="transactions">المعاملات</button>
    <button class="tab-btn" data-at="accounts">الحسابات</button>
    <button class="tab-btn" data-at="session">تسوية اليوم</button>
  </div>

  <div id="acContent">
    <div class="empty-state">
      <div class="es-icon an-spin"><i class="fas fa-circle-notch"></i></div>
      <h3 class="es-title">جارٍ التحميل...</h3>
    </div>
  </div>
</div>`;
  }

  async function afterRender() {
    document.getElementById('acAddTxBtn')?.addEventListener('click', openAddTxModal);
    document.getElementById('acExportBtn')?.addEventListener('click', exportData);
    document.getElementById('acTabs')?.addEventListener('click', e => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      _activeTab = btn.dataset.at;
      document.querySelectorAll('#acTabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _renderTab(_activeTab);
    });
    await _load();
  }

  async function _load() {
    try {
      const [summary, txResult, accounts, session] = await Promise.all([
        DB.getFinancialSummary(),
        DB.getTransactions(null, 100, 0),
        DB.getAccounts(),
        DB.getActiveSession(),
      ]);
      _summary      = summary;
      _transactions = txResult?.items || [];
      _accounts     = accounts || [];
      _session      = session;
      _renderTab(_activeTab);
    } catch(e) { Toast.err('خطأ', e.message); }
  }

  /* ════════════════════════════════════════════════════
     RENDER TABS
  ════════════════════════════════════════════════════ */
  function _renderTab(tab) {
    const content = document.getElementById('acContent');
    if (!content) return;

    /* ── الملخص المالي ──────────────────────────────── */
    if (tab === 'summary') {
      const s = _summary || {};
      const netColor = (s.net || 0) >= 0 ? 'var(--ok)' : 'var(--err)';

      content.innerHTML = `
      <!-- بطاقات الملخص -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem;margin-bottom:1.5rem">
        <div class="rpt-card">
          <div class="rpt-card-val" style="color:var(--ok)">${Fmt.money(s.today_income||0)}</div>
          <div class="rpt-card-lbl">إيرادات اليوم</div>
        </div>
        <div class="rpt-card">
          <div class="rpt-card-val" style="color:var(--err)">${Fmt.money(s.today_expense||0)}</div>
          <div class="rpt-card-lbl">مصروفات اليوم</div>
        </div>
        <div class="rpt-card">
          <div class="rpt-card-val" style="color:var(--teal-600)">${Fmt.money(s.month_income||0)}</div>
          <div class="rpt-card-lbl">إيرادات الشهر</div>
        </div>
        <div class="rpt-card">
          <div class="rpt-card-val" style="color:var(--amb-600)">${Fmt.money(s.month_expense||0)}</div>
          <div class="rpt-card-lbl">مصروفات الشهر</div>
        </div>
      </div>

      <div class="g2" style="margin-bottom:1.5rem">
        <div class="card">
          <div class="card-head"><span class="card-title"><i class="fas fa-scale-balanced"></i> الموقف المالي الإجمالي</span></div>
          <div class="card-body">
            <div class="detail-row"><span class="dr-label">إجمالي الإيرادات</span><span class="dr-val" style="color:var(--ok)">${Fmt.money(s.total_income||0)}</span></div>
            <div class="detail-row"><span class="dr-label">إجمالي المصروفات</span><span class="dr-val" style="color:var(--err)">${Fmt.money(s.total_expense||0)}</span></div>
            <div style="border-top:2px solid var(--border-2);margin:.75rem 0"></div>
            <div class="detail-row" style="font-size:1rem">
              <span class="dr-label" style="font-weight:800">صافي الربح</span>
              <span class="dr-val" style="color:${netColor};font-size:1.1rem;font-weight:800">${Fmt.money(s.net||0)}</span>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><span class="card-title"><i class="fas fa-piggy-bank"></i> أرصدة الحسابات</span></div>
          <div class="card-body">
            ${(_summary?.accounts || []).length ? (_summary.accounts).map(a => `
              <div class="detail-row">
                <span class="dr-label">
                  <i class="fas ${a.type==='نقدي'?'fa-money-bill-wave':a.type==='بنكي'?'fa-university':'fa-receipt'}" style="color:var(--tx-3);margin-left:.4rem"></i>
                  ${a.name}
                  <small style="color:var(--tx-3);font-size:.65rem"> (${a.type})</small>
                </span>
                <span class="dr-val" style="color:${(a.balance||0)>=0?'var(--ok)':'var(--err)'}">${Fmt.money(a.balance||0)}</span>
              </div>`).join('') : '<p style="color:var(--tx-3);font-size:.85rem">لا توجد حسابات</p>'}
          </div>
        </div>
      </div>

      <!-- آخر المعاملات -->
      <div class="card">
        <div class="card-head">
          <span class="card-title"><i class="fas fa-clock-rotate-left"></i> آخر المعاملات</span>
          <button class="btn btn-ghost btn-sm" onclick="document.querySelector('[data-at=transactions]').click()">عرض الكل</button>
        </div>
        <div class="card-body p0">
          <div class="tbl-wrap"><table class="dtable">
            <thead><tr><th>التاريخ</th><th>الحساب</th><th>النوع</th><th>المبلغ</th><th>الوصف</th></tr></thead>
            <tbody>
              ${_transactions.slice(0,8).map(t => `<tr>
                <td style="color:var(--tx-3);font-size:.78rem">${Fmt.dateShort(t.created_at?.split('T')[0])}</td>
                <td>${t.account_name || '—'}</td>
                <td><span class="badge ${t.type==='دخل'?'bdg-ok':'bdg-err'}">${t.type}</span></td>
                <td style="font-weight:700;color:${t.type==='دخل'?'var(--ok)':'var(--err)'}">
                  ${t.type==='دخل'?'+':'−'}${Fmt.money(t.amount)}
                </td>
                <td style="color:var(--tx-2)">${t.description||'—'}</td>
              </tr>`).join('')}
            </tbody>
          </table></div>
        </div>
      </div>`;

    /* ── المعاملات ──────────────────────────────────── */
    } else if (tab === 'transactions') {
      content.innerHTML = `
      <div class="card">
        <div class="card-head">
          <span class="card-title"><i class="fas fa-list"></i> سجل المعاملات</span>
          <div style="display:flex;gap:.5rem">
            <select id="txTypeFilter" class="form-control" style="width:130px;font-size:.8rem">
              <option value="">كل الأنواع</option>
              <option value="دخل">دخل</option>
              <option value="مصروف">مصروف</option>
            </select>
            <select id="txAccFilter" class="form-control" style="width:160px;font-size:.8rem">
              <option value="">كل الحسابات</option>
              ${_accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="card-body p0" id="txTableWrap">
          ${_buildTxTable(_transactions)}
        </div>
      </div>`;

      const rebuild = () => {
        const type = document.getElementById('txTypeFilter')?.value;
        const acc  = document.getElementById('txAccFilter')?.value;
        let list = [..._transactions];
        if (type) list = list.filter(t => t.type === type);
        if (acc)  list = list.filter(t => t.account_id === acc);
        const wrap = document.getElementById('txTableWrap');
        if (wrap) wrap.innerHTML = _buildTxTable(list);
      };
      document.getElementById('txTypeFilter')?.addEventListener('change', rebuild);
      document.getElementById('txAccFilter')?.addEventListener('change', rebuild);

    /* ── الحسابات ───────────────────────────────────── */
    } else if (tab === 'accounts') {
      content.innerHTML = `
      <div class="card">
        <div class="card-head">
          <span class="card-title"><i class="fas fa-wallet"></i> إدارة الحسابات</span>
          <button class="btn btn-primary btn-sm" id="addAccountBtn"><i class="fas fa-plus"></i> حساب جديد</button>
        </div>
        <div class="card-body p0">
          <div class="tbl-wrap"><table class="dtable">
            <thead><tr><th>اسم الحساب</th><th>النوع</th><th>الرصيد الحالي</th><th>ملاحظات</th><th>الإجراءات</th></tr></thead>
            <tbody>
              ${_accounts.map(a => `<tr>
                <td class="font-bold">${a.name}</td>
                <td><span class="badge bdg-teal">${a.type}</span></td>
                <td style="font-weight:700;color:${(a.balance||0)>=0?'var(--ok)':'var(--err)'}">${Fmt.money(a.balance||0)}</td>
                <td style="color:var(--tx-3)">${a.notes||'—'}</td>
                <td>
                  <div class="td-actions">
                    <button class="btn btn-ghost btn-icon sm" data-edit="${a.id}" title="تعديل"><i class="fas fa-pen"></i></button>
                    <button class="btn btn-ghost btn-icon sm" data-del="${a.id}" title="حذف" style="color:var(--err)"><i class="fas fa-trash"></i></button>
                  </div>
                </td>
              </tr>`).join('')}
            </tbody>
          </table></div>
        </div>
      </div>`;

      document.getElementById('addAccountBtn')?.addEventListener('click', () => _openAccountModal());
      document.querySelectorAll('[data-edit]').forEach(btn =>
        btn.addEventListener('click', () => {
          const acc = _accounts.find(a => a.id === btn.dataset.edit);
          if (acc) _openAccountModal(acc);
        })
      );
      document.querySelectorAll('[data-del]').forEach(btn =>
        btn.addEventListener('click', () => {
          Modal.confirm('حذف الحساب', 'هل أنت متأكد؟', async () => {
            await DB.deleteAccount(btn.dataset.del);
            Toast.ok('تم', 'تم حذف الحساب');
            await _load();
          });
        })
      );

    /* ── تسوية اليوم ────────────────────────────────── */
    } else if (tab === 'session') {
      _renderSessionTab(content);
    }
  }

  function _buildTxTable(list) {
    if (!list.length) return '<div class="empty-state"><div class="es-icon"><i class="fas fa-list"></i></div><h3 class="es-title">لا توجد معاملات</h3></div>';
    return `<div class="tbl-wrap"><table class="dtable">
      <thead><tr><th>التاريخ</th><th>الحساب</th><th>النوع</th><th>المبلغ</th><th>الوصف</th><th>المرجع</th></tr></thead>
      <tbody>${list.map(t => `<tr>
        <td style="color:var(--tx-3);font-size:.78rem">${t.created_at ? t.created_at.replace('T',' ').slice(0,16) : '—'}</td>
        <td>${t.account_name||'—'}</td>
        <td><span class="badge ${t.type==='دخل'?'bdg-ok':'bdg-err'}">${t.type}</span></td>
        <td style="font-weight:700;color:${t.type==='دخل'?'var(--ok)':'var(--err)'}">
          ${t.type==='دخل'?'+':'−'}${Fmt.money(t.amount)}
        </td>
        <td>${t.description||'—'}</td>
        <td style="color:var(--tx-3);font-size:.75rem">${t.ref_type||''} ${t.ref_id||''}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  function _renderSessionTab(content) {
    const s = _session;
    content.innerHTML = `
    <div class="g2">
      <!-- حالة الجلسة الحالية -->
      <div class="card">
        <div class="card-head">
          <span class="card-title"><i class="fas fa-cash-register"></i> جلسة الصندوق الحالية</span>
          <span class="badge ${s ? 'bdg-ok' : 'bdg-slate'}">${s ? 'مفتوحة' : 'لا توجد جلسة'}</span>
        </div>
        <div class="card-body">
          ${s ? `
            <div class="detail-row"><span class="dr-label">فُتحت بواسطة</span><span class="dr-val">${s.opened_by||'—'}</span></div>
            <div class="detail-row"><span class="dr-label">وقت الفتح</span><span class="dr-val">${s.opened_at ? s.opened_at.replace('T',' ').slice(0,16) : '—'}</span></div>
            <div class="detail-row"><span class="dr-label">رصيد الفتح</span><span class="dr-val" style="color:var(--teal-600)">${Fmt.money(s.opening_cash||0)}</span></div>
            <div style="margin-top:1rem">
              <button class="btn btn-primary" id="closeSessionBtn"><i class="fas fa-lock"></i> إغلاق الجلسة وتسوية الصندوق</button>
            </div>
          ` : `
            <p style="color:var(--tx-3);font-size:.85rem;margin-bottom:1rem">لا توجد جلسة مفتوحة حالياً. افتح جلسة جديدة لبدء يوم العمل.</p>
            <label class="mf-field" style="margin-bottom:.75rem;max-width:200px">
              <span>رصيد الفتح (نقدي)</span>
              <div class="mf-money"><input id="openingCashInput" type="number" min="0" step="0.01" class="form-control" value="0" placeholder="0.00"><em>ر.س</em></div>
            </label>
            <button class="btn btn-primary" id="openSessionBtn"><i class="fas fa-unlock"></i> فتح جلسة جديدة</button>
          `}
        </div>
      </div>

      <!-- آخر الجلسات -->
      <div class="card" id="sessionsCard"></div>
    </div>`;

    _loadSessions();

    document.getElementById('openSessionBtn')?.addEventListener('click', async () => {
      const cash = parseFloat(document.getElementById('openingCashInput')?.value) || 0;
      try {
        await DB.openSession({ opening_cash: cash });
        Toast.ok('تم فتح الجلسة', 'بدأ يوم العمل');
        await _load();
      } catch(e) { Toast.err('خطأ', e.message); }
    });

    document.getElementById('closeSessionBtn')?.addEventListener('click', () => {
      if (!_session) return;
      Modal.open({
        title: '<i class="fas fa-cash-register"></i> إغلاق الجلسة وتسوية الصندوق',
        body: `
          <div style="margin-bottom:1rem">
            <div class="detail-row"><span class="dr-label">رصيد الفتح</span><span class="dr-val">${Fmt.money(_session.opening_cash||0)}</span></div>
          </div>
          <label class="mf-field" style="max-width:220px">
            <span>الرصيد الفعلي في الصندوق <b>*</b></span>
            <div class="mf-money"><input id="closingCashInput" type="number" min="0" step="0.01" class="form-control" placeholder="0.00"><em>ر.س</em></div>
          </label>
          <div id="sessionDiffPreview" style="margin-top:.75rem;font-size:.85rem;color:var(--tx-3)"></div>`,
        foot: `<button class="btn btn-primary" id="confirmCloseBtn"><i class="fas fa-lock"></i> تأكيد الإغلاق</button>
               <button class="btn btn-ghost" onclick="Modal.close()">إلغاء</button>`,
      });

      document.getElementById('closingCashInput')?.addEventListener('input', e => {
        const closing  = parseFloat(e.target.value) || 0;
        const preview  = document.getElementById('sessionDiffPreview');
        if (preview) preview.innerHTML = `الرصيد المدخل: <strong>${Fmt.money(closing)}</strong>`;
      });

      document.getElementById('confirmCloseBtn')?.addEventListener('click', async () => {
        const closing = parseFloat(document.getElementById('closingCashInput')?.value);
        if (isNaN(closing)) { Toast.warn('تنبيه', 'أدخل الرصيد الفعلي'); return; }
        try {
          const result = await DB.closeSession(_session.id, { closing_cash: closing });
          const diff   = result.difference || 0;
          const diffColor = Math.abs(diff) < 1 ? 'var(--ok)' : diff > 0 ? 'var(--ok)' : 'var(--err)';
          Modal.close();
          Modal.open({
            title: '<i class="fas fa-check-circle" style="color:var(--ok)"></i> تمت التسوية',
            size: 'sm',
            body: `
              <div style="text-align:center;padding:1rem 0">
                <div class="detail-row"><span class="dr-label">مبيعات النقد</span><span class="dr-val" style="color:var(--teal-600)">${Fmt.money(result.sales_total||0)}</span></div>
                <div class="detail-row"><span class="dr-label">الرصيد المتوقع</span><span class="dr-val">${Fmt.money(result.expected||0)}</span></div>
                <div class="detail-row"><span class="dr-label">الرصيد الفعلي</span><span class="dr-val">${Fmt.money(result.closing||0)}</span></div>
                <div class="detail-row" style="font-size:1rem"><span class="dr-label" style="font-weight:800">الفرق</span>
                  <span class="dr-val" style="color:${diffColor};font-weight:800">${diff > 0 ? '+' : ''}${Fmt.money(diff)}</span>
                </div>
                ${Math.abs(diff) > 0.01 ? `<div style="margin-top:.75rem;padding:.6rem;background:${diff<0?'#fee2e2':'#d1fae5'};border-radius:8px;font-size:.8rem">
                  ${diff < 0 ? '⚠ يوجد عجز في الصندوق — يُنصح بمراجعة المعاملات' : '✓ يوجد فائض في الصندوق'}
                </div>` : '<div style="margin-top:.75rem;color:var(--ok);font-weight:700">✓ الصندوق مطابق تماماً</div>'}
              </div>`,
            foot: `<button class="btn btn-primary" onclick="Modal.close()">حسناً</button>`,
          });
          await _load();
        } catch(e) { Toast.err('خطأ', e.message); }
      });
    });
  }

  async function _loadSessions() {
    try {
      const sessions = await DB.getSessions() || [];
      const card = document.getElementById('sessionsCard');
      if (!card) return;
      card.innerHTML = `
        <div class="card-head"><span class="card-title"><i class="fas fa-history"></i> آخر الجلسات</span></div>
        <div class="card-body p0">
          ${sessions.length ? `<div class="tbl-wrap"><table class="dtable">
            <thead><tr><th>التاريخ</th><th>الفتح</th><th>الإغلاق</th><th>مبيعات نقد</th><th>الفرق</th><th>الحالة</th></tr></thead>
            <tbody>${sessions.map(s => `<tr>
              <td style="font-size:.78rem">${s.opened_at?.split('T')[0]||'—'}</td>
              <td>${Fmt.money(s.opening_cash||0)}</td>
              <td>${Fmt.money(s.closing_cash||0)}</td>
              <td style="color:var(--teal-600)">${Fmt.money(s.sales_total||0)}</td>
              <td style="color:${Math.abs(s.difference||0)<0.01?'var(--ok)':s.difference>0?'var(--ok)':'var(--err)'};font-weight:700">
                ${s.status==='مفتوحة'?'—':(s.difference>0?'+':'')+Fmt.money(s.difference||0)}
              </td>
              <td><span class="badge ${s.status==='مفتوحة'?'bdg-warn':'bdg-ok'}">${s.status}</span></td>
            </tr>`).join('')}</tbody>
          </table></div>` : '<div class="empty-state" style="padding:1.5rem"><h3 class="es-title" style="font-size:.9rem">لا توجد جلسات سابقة</h3></div>'}
        </div>`;
    } catch(e) { /* ignore */ }
  }

  /* ── إضافة معاملة ───────────────────────────────────── */
  function openAddTxModal() {
    const accOptions = _accounts.map(a => `<option value="${a.id}">${a.name} (${a.type})</option>`).join('');
    Modal.open({
      title: '<i class="fas fa-plus"></i> معاملة مالية جديدة',
      body: `
        <div class="mf-grid cols-2" style="gap:.75rem">
          <label class="mf-field">
            <span>نوع المعاملة <b>*</b></span>
            <select id="txType" class="form-control">
              <option value="دخل">دخل / إيراد</option>
              <option value="مصروف">مصروف</option>
            </select>
          </label>
          <label class="mf-field">
            <span>الحساب <b>*</b></span>
            <select id="txAccount" class="form-control">
              <option value="">اختر الحساب</option>${accOptions}
            </select>
          </label>
          <label class="mf-field">
            <span>المبلغ <b>*</b></span>
            <div class="mf-money"><input id="txAmount" type="number" min="0" step="0.01" class="form-control" placeholder="0.00"><em>ر.س</em></div>
          </label>
          <label class="mf-field">
            <span>التاريخ</span>
            <input id="txDate" type="date" class="form-control" value="${new Date().toISOString().split('T')[0]}">
          </label>
          <label class="mf-field mf-wide">
            <span>الوصف <b>*</b></span>
            <input id="txDesc" class="form-control" placeholder="وصف المعاملة">
          </label>
        </div>`,
      foot: `<button class="btn btn-primary" id="saveTxBtn"><i class="fas fa-check"></i> حفظ</button>
             <button class="btn btn-ghost" onclick="Modal.close()">إلغاء</button>`,
    });
    document.getElementById('saveTxBtn')?.addEventListener('click', async () => {
      const data = {
        type:        document.getElementById('txType').value,
        account_id:  document.getElementById('txAccount').value,
        amount:      parseFloat(document.getElementById('txAmount').value),
        description: document.getElementById('txDesc').value.trim(),
      };
      if (!data.account_id || !data.amount || !data.description) {
        Toast.warn('بيانات ناقصة', 'أكمل جميع الحقول المطلوبة'); return;
      }
      try {
        await DB.addTransaction(data);
        Toast.ok('تم', 'تم إضافة المعاملة وتحديث الرصيد');
        Modal.close();
        await _load();
      } catch(e) { Toast.err('خطأ', e.message); }
    });
  }

  /* ── إضافة / تعديل حساب ─────────────────────────────── */
  function _openAccountModal(acc = null) {
    const isEdit = !!acc;
    Modal.open({
      title: `<i class="fas fa-wallet"></i> ${isEdit ? 'تعديل حساب' : 'حساب جديد'}`,
      body: `
        <div class="mf-grid cols-2" style="gap:.75rem">
          <label class="mf-field mf-wide">
            <span>اسم الحساب <b>*</b></span>
            <input id="accName" class="form-control" value="${acc?.name||''}" placeholder="مثال: الصندوق الرئيسي">
          </label>
          <label class="mf-field">
            <span>نوع الحساب <b>*</b></span>
            <select id="accType" class="form-control">
              ${['نقدي','بنكي','مصروف','دخل','أخرى'].map(t =>
                `<option value="${t}" ${acc?.type===t?'selected':''}>${t}</option>`).join('')}
            </select>
          </label>
          <label class="mf-field">
            <span>الرصيد الافتتاحي</span>
            <div class="mf-money"><input id="accBalance" type="number" step="0.01" class="form-control" value="${acc?.balance||0}"><em>ر.س</em></div>
          </label>
          <label class="mf-field mf-wide">
            <span>ملاحظات</span>
            <input id="accNotes" class="form-control" value="${acc?.notes||''}" placeholder="ملاحظات اختيارية">
          </label>
        </div>`,
      foot: `<button class="btn btn-primary" id="saveAccBtn"><i class="fas fa-check"></i> حفظ</button>
             <button class="btn btn-ghost" onclick="Modal.close()">إلغاء</button>`,
    });
    document.getElementById('saveAccBtn')?.addEventListener('click', async () => {
      const data = {
        name:    document.getElementById('accName').value.trim(),
        type:    document.getElementById('accType').value,
        balance: parseFloat(document.getElementById('accBalance').value) || 0,
        notes:   document.getElementById('accNotes').value.trim(),
      };
      if (!data.name) { Toast.warn('تنبيه', 'أدخل اسم الحساب'); return; }
      try {
        if (isEdit) await DB.updateAccount(acc.id, data);
        else        await DB.addAccount(data);
        Toast.ok('تم', isEdit ? 'تم تحديث الحساب' : 'تم إضافة الحساب');
        Modal.close();
        await _load();
      } catch(e) { Toast.err('خطأ', e.message); }
    });
  }

  function exportData() {
    exportCSV('المعاملات_المالية',
      ['التاريخ', 'الحساب', 'النوع', 'المبلغ', 'الوصف'],
      _transactions.map(t => [t.created_at?.split('T')[0], t.account_name, t.type, t.amount, t.description])
    );
  }

  return { render, afterRender };
})();
