/* ════════════════════════════════════════════════════════════
   PAGE: HR — إدارة الموظفين والأجور
   • قائمة الموظفين مع CRUD كامل
   • رواتب وأجور (Payroll)
   • تقرير أداء الموظفين (مبيعات لكل كاشير)
════════════════════════════════════════════════════════════ */
'use strict';

const HRPage = (() => {
  let _employees   = [];
  let _payroll     = [];
  let _performance = [];
  let _activeTab   = 'employees';

  function render() {
    return `
<div class="page active" id="page-hr">
  <div class="pg-header">
    <div class="pg-title-group">
      <h1 class="pg-title">
        <div class="pg-title-icon" style="background:#ede9fe;color:#7c3aed"><i class="fas fa-users-gear"></i></div>
        الموارد البشرية
      </h1>
      <p class="pg-subtitle">إدارة الموظفين والرواتب والأداء</p>
    </div>
    <div class="pg-actions">
      <button class="btn btn-ghost btn-sm" id="hrExportBtn"><i class="fas fa-download"></i> تصدير</button>
      <button class="btn btn-primary" id="hrAddEmpBtn"><i class="fas fa-user-plus"></i> موظف جديد</button>
    </div>
  </div>

  <div class="tabs" id="hrTabs" style="margin-bottom:1rem">
    <button class="tab-btn active" data-ht="employees">الموظفون</button>
    <button class="tab-btn" data-ht="payroll">الرواتب والأجور</button>
    <button class="tab-btn" data-ht="performance">تقرير الأداء</button>
  </div>

  <div id="hrContent">
    <div class="empty-state">
      <div class="es-icon an-spin"><i class="fas fa-circle-notch"></i></div>
      <h3 class="es-title">جارٍ التحميل...</h3>
    </div>
  </div>
</div>`;
  }

  async function afterRender() {
    document.getElementById('hrAddEmpBtn')?.addEventListener('click', () => _openEmpModal());
    document.getElementById('hrExportBtn')?.addEventListener('click', exportData);
    document.getElementById('hrTabs')?.addEventListener('click', e => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      _activeTab = btn.dataset.ht;
      document.querySelectorAll('#hrTabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _renderTab(_activeTab);
    });
    await _load();
  }

  async function _load() {
    try {
      const [employees, payroll, performance] = await Promise.all([
        DB.getEmployees(),
        DB.getPayroll(),
        DB.getEmployeePerformance(),
      ]);
      _employees   = employees   || [];
      _payroll     = payroll     || [];
      _performance = performance || [];
      _renderTab(_activeTab);
    } catch(e) { Toast.err('خطأ', e.message); }
  }

  /* ════════════════════════════════════════════════
     RENDER TABS
  ════════════════════════════════════════════════ */
  function _renderTab(tab) {
    const content = document.getElementById('hrContent');
    if (!content) return;

    /* ── الموظفون ─────────────────────────────────── */
    if (tab === 'employees') {
      content.innerHTML = `
      <!-- إحصاء -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1rem;margin-bottom:1.5rem">
        <div class="rpt-card"><div class="rpt-card-val" style="color:var(--teal-600)">${_employees.length}</div><div class="rpt-card-lbl">إجمالي الموظفين</div></div>
        <div class="rpt-card"><div class="rpt-card-val" style="color:var(--amb-600)">${Fmt.money(_employees.reduce((a,e)=>a+(e.salary||0),0))}</div><div class="rpt-card-lbl">إجمالي الرواتب الشهرية</div></div>
      </div>

      <div class="card">
        <div class="card-body p0">
          <div class="tbl-wrap"><table class="dtable">
            <thead><tr>
              <th>الاسم</th><th>الوظيفة</th><th>الهاتف</th><th>تاريخ التعيين</th>
              <th>الراتب الشهري</th><th>الأجر بالساعة</th><th>الإجراءات</th>
            </tr></thead>
            <tbody>
              ${_employees.length ? _employees.map(e => `<tr>
                <td class="font-bold">${e.full_name}</td>
                <td><span class="badge bdg-teal">${e.role||'—'}</span></td>
                <td>${e.phone||'—'}</td>
                <td>${e.hire_date ? Fmt.dateShort(e.hire_date) : '—'}</td>
                <td style="color:var(--teal-600);font-weight:700">${Fmt.money(e.salary||0)}</td>
                <td>${e.hourly_rate > 0 ? Fmt.money(e.hourly_rate)+'/س' : '—'}</td>
                <td>
                  <div class="td-actions">
                    <button class="btn btn-ghost btn-icon sm" data-emp-edit="${e.id}" title="تعديل"><i class="fas fa-pen"></i></button>
                    <button class="btn btn-ghost btn-icon sm" data-emp-pay="${e.id}" data-emp-name="${e.full_name}" data-emp-salary="${e.salary}" title="صرف راتب" style="color:var(--ok)"><i class="fas fa-money-bill-wave"></i></button>
                    <button class="btn btn-ghost btn-icon sm" data-emp-del="${e.id}" title="حذف" style="color:var(--err)"><i class="fas fa-trash"></i></button>
                  </div>
                </td>
              </tr>`).join('') : `<tr><td colspan="7"><div class="empty-state"><div class="es-icon"><i class="fas fa-users"></i></div><h3 class="es-title">لا يوجد موظفون</h3></div></td></tr>`}
            </tbody>
          </table></div>
        </div>
      </div>`;

      document.querySelectorAll('[data-emp-edit]').forEach(btn =>
        btn.addEventListener('click', () => {
          const e = _employees.find(x => x.id === btn.dataset.empEdit);
          if (e) _openEmpModal(e);
        })
      );
      document.querySelectorAll('[data-emp-pay]').forEach(btn =>
        btn.addEventListener('click', () =>
          _openPayrollModal(btn.dataset.empPay, btn.dataset.empName, parseFloat(btn.dataset.empSalary)||0)
        )
      );
      document.querySelectorAll('[data-emp-del]').forEach(btn =>
        btn.addEventListener('click', () => {
          Modal.confirm('حذف موظف', 'هل أنت متأكد؟', async () => {
            await DB.deleteEmployee(btn.dataset.empDel);
            Toast.ok('تم', 'تم حذف الموظف');
            await _load();
          });
        })
      );

    /* ── الرواتب والأجور ──────────────────────────── */
    } else if (tab === 'payroll') {
      const months = [...new Set((_payroll||[]).map(p => p.period))].slice(0,6);
      content.innerHTML = `
      <div class="card">
        <div class="card-head">
          <span class="card-title"><i class="fas fa-money-bill-wave"></i> سجل الرواتب والأجور</span>
          <button class="btn btn-primary btn-sm" id="newPayrollBtn"><i class="fas fa-plus"></i> صرف راتب</button>
        </div>
        <div class="card-body p0">
          <div class="tbl-wrap"><table class="dtable">
            <thead><tr>
              <th>الموظف</th><th>الفترة</th><th>الراتب الأساسي</th><th>المكافآت</th><th>الخصومات</th><th>الصافي</th><th>تاريخ الصرف</th>
            </tr></thead>
            <tbody>
              ${_payroll.length ? _payroll.map(p => `<tr>
                <td class="font-bold">${p.full_name||'—'}</td>
                <td>${p.period||'—'}</td>
                <td>${Fmt.money(p.base_salary||0)}</td>
                <td style="color:var(--ok)">${p.bonus>0?'+'+Fmt.money(p.bonus):'—'}</td>
                <td style="color:var(--err)">${p.deductions>0?'−'+Fmt.money(p.deductions):'—'}</td>
                <td style="font-weight:800;color:var(--teal-600)">${Fmt.money(p.net_pay||0)}</td>
                <td style="font-size:.78rem;color:var(--tx-3)">${p.paid_at?p.paid_at.split('T')[0]:'—'}</td>
              </tr>`).join('') : `<tr><td colspan="7"><div class="empty-state"><div class="es-icon"><i class="fas fa-money-bill"></i></div><h3 class="es-title">لا يوجد سجل رواتب</h3></div></td></tr>`}
            </tbody>
          </table></div>
        </div>
      </div>`;
      document.getElementById('newPayrollBtn')?.addEventListener('click', () => _openPayrollModal());

    /* ── تقرير الأداء ─────────────────────────────── */
    } else if (tab === 'performance') {
      const maxRev = Math.max(...(_performance||[]).map(p => p.revenue||0), 1);
      content.innerHTML = `
      <div class="card">
        <div class="card-head"><span class="card-title"><i class="fas fa-chart-bar"></i> أداء الموظفين (المبيعات)</span></div>
        <div class="card-body">
          ${_performance.length ? _performance.map((p, i) => `
            <div style="display:flex;align-items:center;gap:1rem;margin-bottom:.85rem">
              <div style="width:32px;height:32px;border-radius:50%;background:var(--teal-50);display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--teal-600);font-size:.8rem;flex-shrink:0">${i+1}</div>
              <div style="flex:1">
                <div style="font-weight:700;font-size:.85rem;margin-bottom:.25rem">${p.cashier||'—'}</div>
                <div class="progress" style="height:8px">
                  <div class="progress-fill" style="width:${Math.round((p.revenue||0)/maxRev*100)}%;background:var(--teal-500)"></div>
                </div>
              </div>
              <div style="text-align:left;min-width:60px">
                <div style="font-weight:700;font-size:.8rem;color:var(--teal-600)">${Fmt.money(p.revenue||0)}</div>
                <div style="font-size:.7rem;color:var(--tx-3)">${p.count||0} فاتورة</div>
              </div>
            </div>`).join('') : `<div class="empty-state"><div class="es-icon"><i class="fas fa-chart-bar"></i></div><h3 class="es-title">لا توجد بيانات مبيعات</h3></div>`}
        </div>
      </div>`;
    }
  }

  /* ── نموذج موظف ────────────────────────────────────── */
  function _openEmpModal(emp = null) {
    const isEdit = !!emp;
    Modal.open({
      title: `<i class="fas fa-user-plus"></i> ${isEdit ? 'تعديل موظف' : 'موظف جديد'}`,
      body: `
        <div class="mf-grid cols-2" style="gap:.75rem">
          <label class="mf-field mf-wide">
            <span>الاسم الكامل <b>*</b></span>
            <input id="empName" class="form-control" value="${emp?.full_name||''}" placeholder="الاسم الكامل">
          </label>
          <label class="mf-field">
            <span>الوظيفة / الدور</span>
            <select id="empRole" class="form-control">
              ${['صيدلاني مسؤول','مساعد صيدلي','محاسب','موظف مبيعات','أخرى'].map(r =>
                `<option value="${r}" ${emp?.role===r?'selected':''}>${r}</option>`).join('')}
            </select>
          </label>
          <label class="mf-field">
            <span>رقم الهاتف</span>
            <input id="empPhone" class="form-control" value="${emp?.phone||''}" placeholder="05xxxxxxxx">
          </label>
          <label class="mf-field">
            <span>رقم الهوية</span>
            <input id="empNationalId" class="form-control" value="${emp?.national_id||''}" placeholder="1xxxxxxxxx">
          </label>
          <label class="mf-field">
            <span>تاريخ التعيين</span>
            <input id="empHireDate" type="date" class="form-control" value="${emp?.hire_date||new Date().toISOString().split('T')[0]}">
          </label>
          <label class="mf-field">
            <span>الراتب الشهري</span>
            <div class="mf-money"><input id="empSalary" type="number" min="0" step="0.01" class="form-control" value="${emp?.salary||0}" placeholder="0.00"><em>ر.س</em></div>
          </label>
          <label class="mf-field">
            <span>الأجر بالساعة</span>
            <div class="mf-money"><input id="empHourly" type="number" min="0" step="0.01" class="form-control" value="${emp?.hourly_rate||0}" placeholder="0.00"><em>ر.س</em></div>
          </label>
          <label class="mf-field mf-wide">
            <span>ملاحظات</span>
            <input id="empNotes" class="form-control" value="${emp?.notes||''}" placeholder="ملاحظات">
          </label>
        </div>`,
      foot: `<button class="btn btn-primary" id="saveEmpBtn"><i class="fas fa-check"></i> حفظ</button>
             <button class="btn btn-ghost" onclick="Modal.close()">إلغاء</button>`,
    });
    document.getElementById('saveEmpBtn')?.addEventListener('click', async () => {
      const data = {
        full_name:   document.getElementById('empName').value.trim(),
        role:        document.getElementById('empRole').value,
        phone:       document.getElementById('empPhone').value.trim(),
        national_id: document.getElementById('empNationalId').value.trim(),
        hire_date:   document.getElementById('empHireDate').value,
        salary:      parseFloat(document.getElementById('empSalary').value) || 0,
        hourly_rate: parseFloat(document.getElementById('empHourly').value) || 0,
        notes:       document.getElementById('empNotes').value.trim(),
      };
      if (!data.full_name) { Toast.warn('تنبيه', 'أدخل اسم الموظف'); return; }
      try {
        if (isEdit) await DB.updateEmployee(emp.id, data);
        else        await DB.addEmployee(data);
        Toast.ok('تم', isEdit ? 'تم تحديث بيانات الموظف' : 'تم إضافة الموظف');
        Modal.close();
        await _load();
      } catch(e) { Toast.err('خطأ', e.message); }
    });
  }

  /* ── نموذج صرف راتب ────────────────────────────────── */
  function _openPayrollModal(empId = null, empName = '', baseSalary = 0) {
    const empOptions = _employees.map(e =>
      `<option value="${e.id}" data-salary="${e.salary||0}" ${empId===e.id?'selected':''}>${e.full_name}</option>`
    ).join('');
    const now   = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

    Modal.open({
      title: '<i class="fas fa-money-bill-wave"></i> صرف راتب / مكافأة',
      body: `
        <div class="mf-grid cols-2" style="gap:.75rem">
          <label class="mf-field mf-wide">
            <span>الموظف <b>*</b></span>
            <select id="prEmployee" class="form-control">
              <option value="">اختر الموظف</option>${empOptions}
            </select>
          </label>
          <label class="mf-field">
            <span>الفترة (سنة-شهر) <b>*</b></span>
            <input id="prPeriod" type="month" class="form-control" value="${period}">
          </label>
          <label class="mf-field">
            <span>الراتب الأساسي</span>
            <div class="mf-money"><input id="prBase" type="number" min="0" step="0.01" class="form-control" value="${baseSalary}" placeholder="0.00"><em>ر.س</em></div>
          </label>
          <label class="mf-field">
            <span>المكافآت / الإضافي</span>
            <div class="mf-money"><input id="prBonus" type="number" min="0" step="0.01" class="form-control" value="0" placeholder="0.00"><em>ر.س</em></div>
          </label>
          <label class="mf-field">
            <span>الخصومات</span>
            <div class="mf-money"><input id="prDeductions" type="number" min="0" step="0.01" class="form-control" value="0" placeholder="0.00"><em>ر.س</em></div>
          </label>
          <div class="mf-field" style="justify-content:flex-end;padding-top:1.2rem">
            <div style="text-align:left;font-size:.85rem">
              الصافي: <strong id="prNetPreview" style="color:var(--teal-600)">${Fmt.money(baseSalary)}</strong>
            </div>
          </div>
          <label class="mf-field mf-wide">
            <span>ملاحظات</span>
            <input id="prNotes" class="form-control" placeholder="ملاحظات">
          </label>
        </div>`,
      foot: `<button class="btn btn-primary" id="savePrBtn"><i class="fas fa-check"></i> صرف</button>
             <button class="btn btn-ghost" onclick="Modal.close()">إلغاء</button>`,
    });

    const updateNet = () => {
      const base  = parseFloat(document.getElementById('prBase')?.value) || 0;
      const bonus = parseFloat(document.getElementById('prBonus')?.value) || 0;
      const dedu  = parseFloat(document.getElementById('prDeductions')?.value) || 0;
      const net   = document.getElementById('prNetPreview');
      if (net) net.textContent = Fmt.money(base + bonus - dedu);
    };
    ['prBase','prBonus','prDeductions'].forEach(id =>
      document.getElementById(id)?.addEventListener('input', updateNet)
    );
    document.getElementById('prEmployee')?.addEventListener('change', e => {
      const opt = e.target.selectedOptions[0];
      if (opt?.dataset.salary) {
        document.getElementById('prBase').value = opt.dataset.salary;
        updateNet();
      }
    });

    document.getElementById('savePrBtn')?.addEventListener('click', async () => {
      const data = {
        employee_id: document.getElementById('prEmployee').value,
        period:      document.getElementById('prPeriod').value,
        base_salary: parseFloat(document.getElementById('prBase').value) || 0,
        bonus:       parseFloat(document.getElementById('prBonus').value) || 0,
        deductions:  parseFloat(document.getElementById('prDeductions').value) || 0,
        notes:       document.getElementById('prNotes').value.trim(),
      };
      if (!data.employee_id || !data.period) { Toast.warn('تنبيه', 'اختر الموظف والفترة'); return; }
      try {
        await DB.addPayroll(data);
        Toast.ok('تم', 'تم صرف الراتب وتسجيله');
        Modal.close();
        await _load();
      } catch(e) { Toast.err('خطأ', e.message); }
    });
  }

  function exportData() {
    if (_activeTab === 'employees') {
      exportCSV('الموظفون',
        ['الاسم', 'الوظيفة', 'الهاتف', 'رقم الهوية', 'تاريخ التعيين', 'الراتب', 'الأجر بالساعة'],
        _employees.map(e => [e.full_name, e.role, e.phone, e.national_id, e.hire_date, e.salary, e.hourly_rate])
      );
    } else if (_activeTab === 'payroll') {
      exportCSV('سجل_الرواتب',
        ['الموظف', 'الفترة', 'الأساسي', 'المكافآت', 'الخصومات', 'الصافي', 'تاريخ الصرف'],
        _payroll.map(p => [p.full_name, p.period, p.base_salary, p.bonus, p.deductions, p.net_pay, p.paid_at?.split('T')[0]])
      );
    }
  }

  return { render, afterRender };
})();
