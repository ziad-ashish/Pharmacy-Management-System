/* ════════════════════════════════════════════════════════════
   PAGE: SETTINGS  (async)
   إدارة الإعدادات العامة وقسم إدارة المستخدمين والصلاحيات
════════════════════════════════════════════════════════════ */
'use strict';

const SettingsPage = (() => {

  const NAV = [
    { id: 'general',    label: 'بيانات الصيدلية',     group: 'الهوية والصيدلية', icon: 'fa-store', keywords: 'الصيدلية الاسم الهاتف العنوان العملة بيانات' },
    { id: 'appearance', label: 'الهوية والمظهر',      group: 'الهوية والصيدلية', icon: 'fa-image', keywords: 'الشعار الاسم الوضع الداكن الفاتح الثيم الألوان' },
    { id: 'inventory',  label: 'المخزون والصلاحية',   group: 'التشغيل اليومي', icon: 'fa-boxes-stacked', keywords: 'الكمية الحد الأدنى الصلاحية الانتهاء تنبيه دواء' },
    { id: 'invoice',    label: 'البيع والفواتير',     group: 'التشغيل اليومي', icon: 'fa-receipt', keywords: 'الضريبة الدفع الخصم الكاشير الإيصال الملاحظة' },
    { id: 'devices',    label: 'الطباعة والباركود',   group: 'الأجهزة والتكامل', icon: 'fa-print', keywords: 'الطابعة الباركود الورق الحرارية الأجهزة' },
    { id: 'users',      label: 'المستخدمون والصلاحيات', group: 'الإدارة والأمان', icon: 'fa-user-shield', keywords: 'الحسابات الصلاحيات كلمة المرور الأدوار الموظفين', adminOnly: true },
    { id: 'activity',   label: 'سجل النشاط',          group: 'الإدارة والأمان', icon: 'fa-clock-rotate-left', keywords: 'التدقيق العمليات الإجراءات المستخدم التاريخ', adminOnly: true },
    { id: 'backup',     label: 'النسخ والاستعادة',    group: 'صيانة النظام', icon: 'fa-database', keywords: 'قاعدة البيانات استرجاع حفظ نسخة احتياطية', adminOnly: true },
  ];

  const ROLES = [
    { id: 'مدير النظام',    label: 'مدير النظام',    icon: 'fa-shield-halved', cls: 'admin',      bdg: 'bdg-amb' },
    { id: 'صيدلاني مسؤول', label: 'صيدلاني مسؤول', icon: 'fa-user-doctor',   cls: 'pharmacist', bdg: 'bdg-teal' },
    { id: 'مساعد صيدلي',   label: 'مساعد صيدلي',   icon: 'fa-user-nurse',    cls: 'assistant',  bdg: 'bdg-slate' },
  ];

  const ROLE_PERMS_INFO = {
    'مدير النظام': [
      { ok: true, text: 'إدارة المخزون والأدوية وتعديل الأسعار' },
      { ok: true, text: 'نقطة البيع وإصدار وإلغاء الفواتير' },
      { ok: true, text: 'تقارير المبيعات والأرباح والتحليلات المالية' },
      { ok: true, text: 'إدارة المرضى وسجلات الموردين' },
      { ok: true, text: 'إدارة حسابات المستخدمين وتعيين الصلاحيات' },
      { ok: true, text: 'النسخ الاحتياطي وتعديل إعدادات النظام' },
    ],
    'صيدلاني مسؤول': [
      { ok: true, text: 'إدارة المخزون والأدوية وتعديل الأسعار' },
      { ok: true, text: 'نقطة البيع وإصدار الفواتير' },
      { ok: true, text: 'تقارير المبيعات وحركة الأصناف' },
      { ok: true, text: 'إدارة المرضى وسجلات الموردين' },
      { ok: false, text: 'إدارة المستخدمين وتعديل إعدادات النظام' },
      { ok: false, text: 'النسخ الاحتياطي واستعادة قاعدة البيانات' },
    ],
    'مساعد صيدلي': [
      { ok: true, text: 'نقطة البيع وإتمام عمليات الشراء' },
      { ok: true, text: 'استعراض قائمة الأدوية والأسعار' },
      { ok: true, text: 'استعراض الفواتير' },
      { ok: false, text: 'تعديل أو حذف الأدوية والمخزون' },
      { ok: false, text: 'التقارير المالية والأرباح' },
      { ok: false, text: 'إدارة المستخدمين والإعدادات' },
    ]
  };

  function _isAdmin() {
    return Auth?.getCurrent?.()?.role === 'مدير النظام';
  }

  function _visibleNav() {
    return NAV.filter(n => !n.adminOnly || _isAdmin());
  }

  function render() {
    return `
<div class="page active" id="page-settings">
  <header class="google-settings-head settings-studio-head">
    <div class="settings-title-block"><span class="settings-kicker">مركز التحكم</span><h1>إعدادات شفاء</h1><p>إدارة هوية الصيدلية والتشغيل والأمان من مكان واحد</p></div>
    <div class="settings-search-wrap">
      <i class="fas fa-magnifying-glass"></i>
      <input type="search" id="settingsSearch" placeholder="البحث في الإعدادات" autocomplete="off" />
      <button type="button" id="settingsSearchClear" class="hidden" aria-label="مسح البحث"><i class="fas fa-xmark"></i></button>
    </div><div class="settings-system-state"><span></span><div><strong>النظام متصل</strong><small>قاعدة البيانات تعمل بصورة طبيعية</small></div></div>
  </header>
  <div class="settings-layout google-settings-layout settings-studio-layout">
    <aside class="settings-nav-card settings-studio-nav"><div id="setNav"></div><div class="settings-about"><i class="fas fa-circle-info"></i><span>شفاء Pharmacy OS</span><small>الإصدار 2.0</small></div></aside>
    <main class="settings-content" id="setContent">
      <div class="empty-state">
        <div class="es-icon an-spin"><i class="fas fa-circle-notch"></i></div>
        <h3 class="es-title">جارٍ تحميل الإعدادات...</h3>
      </div>
    </main><aside class="settings-preview" id="setPreview"></aside>
  </div>
</div>`;
  }

  const KEYS = {
    pharmacyName:     'pharmacy_name',
    pharmacyPhone:    'pharmacy_phone',
    pharmacyAddr:     'pharmacy_address',
    currency:         'currency_symbol',
    pharmacyLogo:     'pharmacy_logo',
    themeMode:        'ui_theme_mode',
    themeAccent:      'ui_theme_accent',
    lowStockDefault:  'low_stock_default',
    expiryAlertDays:  'expiry_alert_days',
    taxRate:          'tax_rate',
    invoiceNote:      'invoice_footer_note',
    showTax:          'invoice_show_tax',
    showCashier:      'invoice_show_cashier',
    defaultPayment:   'sales_default_payment',
    maxDiscount:      'sales_max_discount_percent',
  };

  let _vals = {};
  let _activeTab = 'general';
  let _allUsers = [];
  let _filteredUsers = [];
  let _searchQuery = '';
  let _selectedRoleFilter = 'all';

  async function afterRender() {
    _activeTab = 'general';
    try {
      const entries = await Promise.all(
        Object.entries(KEYS).map(async ([name, key]) => [name, await DB.getSetting(key)])
      );
      _vals = Object.fromEntries(entries);
      const storeName = document.getElementById('settingsStoreName');
      if (storeName) storeName.textContent = _vals.pharmacyName || 'صيدلية الشفاء';
      _renderNav();
      _renderTab('general');
      _setupSettingsSearch();
    } catch (e) {
      const c = document.getElementById('setContent');
      if (c) c.innerHTML = `<div class="alert err"><i class="fas fa-circle-xmark"></i> ${e.message}</div>`;
    }
  }

  function _renderNav(filter = '') {
    const nav = document.getElementById('setNav');
    if (!nav) return;
    const q = filter.trim().toLowerCase();
    const visible = _visibleNav().filter(n => !q || `${n.label} ${n.keywords || ''}`.toLowerCase().includes(q));
    let lastGroup = '';
    nav.innerHTML = visible.map(n => {
      const group = n.group !== lastGroup ? `<div class="set-nav-group">${n.group}</div>` : '';
      lastGroup = n.group;
      return `${group}<button class="set-nav-item ${_activeTab === n.id ? 'active' : ''}" data-tab="${n.id}" type="button"><span class="set-nav-icon"><i class="fas ${n.icon}"></i></span><span>${n.label}</span></button>`;
    }).join('') || '<div class="settings-nav-empty">لا توجد نتائج</div>';
    nav.querySelectorAll('.set-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        _activeTab = item.dataset.tab;
        _renderNav();
        _renderTab(_activeTab);
      });
    });
  }

  function _renderPreview(tab, draft = {}) {
    const p = document.getElementById('setPreview');
    if (!p) return;
    const v = { ..._vals, ...draft };
    const name = _esc(v.pharmacyName) || 'صيدلية الشفاء';
    const previews = {
      general: `<div class="sp-label">معاينة الهوية</div><div class="sp-pharmacy"><span class="sp-logo">${v.pharmacyLogo?`<img src="${v.pharmacyLogo}" alt=""/>`:'<i class="fas fa-prescription-bottle-medical"></i>'}</span><strong>${name}</strong><small>${_esc(v.pharmacyPhone)||'رقم الهاتف غير مسجل'}</small><p>${_esc(v.pharmacyAddr)||'أضف عنوان الصيدلية ليظهر في الفواتير'}</p></div>`,
      appearance: `<div class="sp-label">مظهر النظام</div><div class="sp-screen"><div class="sp-screen-bar"><i class="fas fa-capsules"></i><span>${name}</span></div><div class="sp-screen-body"><b>لوحة التحكم</b><span></span><span></span><span></span></div></div><p class="sp-note"><i class="fas fa-eye"></i> الهوية تظهر في تسجيل الدخول والفواتير.</p>`,
      inventory: `<div class="sp-label">مثال تنبيه</div><div class="sp-alert warn"><i class="fas fa-box-open"></i><div><strong>مخزون منخفض</strong><small>سيظهر التنبيه عند ${_esc(v.lowStockDefault)||10} وحدات</small></div></div><div class="sp-alert"><i class="fas fa-calendar-day"></i><div><strong>صلاحية قريبة</strong><small>قبل ${_esc(v.expiryAlertDays)||90} يومًا من الانتهاء</small></div></div>`,
      invoice: `<div class="sp-label">معاينة الفاتورة</div><div class="sp-receipt"><div class="sp-r-head"><strong>${name}</strong><small>فاتورة بيع تجريبية</small></div><div class="sp-r-row"><span>دواء تجريبي</span><b>100.00</b></div>${v.showTax!=='0'&&Number(v.taxRate)>0?`<div class="sp-r-row"><span>الضريبة ${_esc(v.taxRate)}%</span><b>${Number(v.taxRate).toFixed(2)}</b></div>`:''}<div class="sp-r-total"><span>الإجمالي</span><b>${(100+(v.showTax!=='0'&&Number(v.taxRate)>0?Number(v.taxRate):0)).toFixed(2)} ${_esc(v.currency)||'ر.س'}</b></div><p>${_esc(v.invoiceNote)||'شكرًا لتعاملكم معنا'}</p></div>`,
      devices: `<div class="sp-label">حالة الأجهزة</div><div class="sp-device"><i class="fas fa-print"></i><div><strong>الطابعة الحرارية</strong><small>جاهزة لإعداد الورق والطباعة</small></div><span class="sp-dot"></span></div><div class="sp-device"><i class="fas fa-barcode"></i><div><strong>قارئ الباركود</strong><small>يعمل كمدخل سريع في نقطة البيع</small></div><span class="sp-dot"></span></div><div class="sp-device"><i class="fas fa-camera"></i><div><strong>كاميرا الجهاز</strong><small>تعمل عند منح الإذن</small></div><span class="sp-dot idle"></span></div>`,
      users: `<div class="sp-label">الأمان والصلاحيات</div><div class="sp-security"><i class="fas fa-shield-halved"></i><strong>وصول محمي حسب الدور</strong><p>إدارة الحسابات وكلمات المرور وصلاحيات التشغيل الحساسة.</p></div>`,
      backup: `<div class="sp-label">سلامة البيانات</div><div class="sp-security"><i class="fas fa-database"></i><strong>نسخ SQLite متسقة</strong><p>احتفظ بنسخة حديثة قبل أي استعادة أو تغيير كبير.</p></div>`,
      activity: `<div class="sp-label">المراقبة</div><div class="sp-security"><i class="fas fa-clock-rotate-left"></i><strong>كل عملية قابلة للتتبع</strong><p>راجع المستخدم والوقت ونوع التغيير من سجل النشاط.</p></div>`
    };
    p.innerHTML = `<div class="sp-head"><span>معاينة مباشرة</span><i class="fas fa-wand-magic-sparkles"></i></div><div class="sp-body">${previews[tab] || previews.general}</div><div class="sp-foot"><i class="fas fa-circle-info"></i> تتحدث المعاينة مع تغييراتك قبل الحفظ</div>`;
  }

  function _setupSettingsSearch() {
    const input=document.getElementById('settingsSearch'), clear=document.getElementById('settingsSearchClear');
    if(!input) return;
    const search=()=>{
      const q=input.value.trim(); clear?.classList.toggle('hidden',!q); _renderNav(q);
      if(q){const match=_visibleNav().find(n=>`${n.label} ${n.keywords || ''}`.toLowerCase().includes(q.toLowerCase()));if(match&&match.id!==_activeTab){_activeTab=match.id;_renderNav(q);_renderTab(match.id);}}
    };
    input.addEventListener('input',debounce(search,120));
    clear?.addEventListener('click',()=>{input.value='';_renderNav();clear.classList.add('hidden');input.focus();});
  }

  function _renderTab(tab) {
    const content = document.getElementById('setContent');
    if (!content) return;
    CameraStudio.close();
    _renderPreview(tab);

    if (tab === 'general') {
      content.innerHTML = `
        <div class="card">
          <div class="card-head"><h3 class="card-title"><i class="fas fa-store"></i> بيانات الصيدلية الأساسية</h3></div>
          <div class="card-body">
            <div class="form-row cols-2">
              <div class="form-group">
                <label class="form-label">رقم الهاتف</label>
                <input class="form-control" id="setPharmacyPhone" value="${_esc(_vals.pharmacyPhone)}" placeholder="01xxxxxxxxx" />
              </div>
              <div class="form-group">
                <label class="form-label">العنوان</label>
                <input class="form-control" id="setPharmacyAddr" value="${_esc(_vals.pharmacyAddr)}" placeholder="العنوان بالكامل" />
              </div>
            </div>
            <div class="form-group" style="max-width:260px">
              <label class="form-label">رمز العملة الافتراضية</label>
              <input class="form-control" id="setCurrency" value="${_esc(_vals.currency) || 'ر.س'}" placeholder="ر.س" />
            </div>
          </div>
          <div class="card-foot" style="display:flex;justify-content:flex-end">
            <button class="btn btn-primary btn-sm" id="setSaveGeneral"><i class="fas fa-floppy-disk"></i> حفظ التغييرات</button>
          </div>
        </div>`;
      document.getElementById('setSaveGeneral')?.addEventListener('click', () => _save({
        pharmacyPhone: document.getElementById('setPharmacyPhone').value.trim(),
        pharmacyAddr:  document.getElementById('setPharmacyAddr').value.trim(),
        currency:      document.getElementById('setCurrency').value.trim(),
      }));
      ['setPharmacyPhone','setPharmacyAddr','setCurrency'].forEach(id=>document.getElementById(id)?.addEventListener('input',()=>_renderPreview('general',{pharmacyPhone:document.getElementById('setPharmacyPhone').value,pharmacyAddr:document.getElementById('setPharmacyAddr').value,currency:document.getElementById('setCurrency').value})));
    }

    if (tab === 'appearance') {
      const mode = _vals.themeMode === 'dark' ? 'dark' : 'light';
      content.innerHTML = `
        <div class="card" style="margin-bottom:1rem">
          <div class="card-head"><h3 class="card-title"><i class="fas fa-signature"></i> الاسم والشعار</h3></div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">اسم الصيدلية</label>
              <input class="form-control" id="setPharmacyName" value="${_esc(_vals.pharmacyName)}" placeholder="صيدلية الشفاء" />
            </div>
            <div class="form-group">
              <label class="form-label">شعار الصيدلية (Logo)</label>
              <div style="display:flex;align-items:center;gap:1rem">
                <div id="setLogoPreview" style="width:58px;height:58px;border-radius:12px;background:var(--surface-2);border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
                  ${_vals.pharmacyLogo ? `<img src="${_vals.pharmacyLogo}" style="width:100%;height:100%;object-fit:cover" />` : `<i class="fas fa-prescription-bottle-medical" style="color:var(--tx-3);font-size:1.5rem"></i>`}
                </div>
                <div style="display:flex;flex-direction:column;gap:.4rem">
                  <label class="btn btn-ghost btn-sm" style="cursor:pointer;width:fit-content">
                    <i class="fas fa-upload"></i> اختيار صورة
                    <input type="file" id="setLogoInput" accept="image/*" hidden />
                  </label>
                  <button class="btn btn-ghost btn-sm" id="setLogoRemove" style="width:fit-content"><i class="fas fa-trash"></i> إزالة الشعار</button>
                </div>
              </div>
            </div>
          </div>
          <div class="card-foot" style="display:flex;justify-content:flex-end">
            <button class="btn btn-primary btn-sm" id="setSaveIdentity"><i class="fas fa-floppy-disk"></i> حفظ الشعار والاسم</button>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3 class="card-title"><i class="fas fa-palette"></i> المظهر والألوان</h3></div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">وضع العرض (Theme)</label>
              <div style="display:flex;gap:.5rem;max-width:320px">
                <button class="tab-btn ${mode==='light'?'active':''}" id="setModeLight" type="button" style="flex:1;justify-content:center"><i class="fas fa-sun"></i> فاتح</button>
                <button class="tab-btn ${mode==='dark'?'active':''}" id="setModeDark" type="button" style="flex:1;justify-content:center"><i class="fas fa-moon"></i> داكن</button>
              </div>
            </div>
            <div class="alert info"><i class="fas fa-circle-info"></i><div><strong>هوية لونية ثابتة</strong><br><span>يستخدم النظام لونًا طبيًا موحدًا لضمان وضوح النصوص والتنبيهات في الوضعين.</span></div></div>
          </div>
        </div>`;

      document.getElementById('setLogoInput')?.addEventListener('change', e => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 900*1024) { Toast.err('الصورة كبيرة جداً', 'يرجى اختيار صورة أصغر من 900KB'); return; }
        const reader = new FileReader();
        reader.onload = () => {
          _vals.pharmacyLogo = reader.result;
          const prev = document.getElementById('setLogoPreview');
          if (prev) prev.innerHTML = `<img src="${reader.result}" style="width:100%;height:100%;object-fit:cover" />`;
          _renderPreview('appearance');
        };
        reader.readAsDataURL(file);
      });
      document.getElementById('setLogoRemove')?.addEventListener('click', () => {
        _vals.pharmacyLogo = '';
        const prev = document.getElementById('setLogoPreview');
        if (prev) prev.innerHTML = `<i class="fas fa-prescription-bottle-medical" style="color:var(--tx-3);font-size:1.5rem"></i>`;
        _renderPreview('appearance');
      });
      document.getElementById('setSaveIdentity')?.addEventListener('click', () => _save({
        pharmacyName: document.getElementById('setPharmacyName').value.trim(),
        pharmacyLogo: _vals.pharmacyLogo || '',
      }, true));
      document.getElementById('setPharmacyName')?.addEventListener('input',e=>_renderPreview('appearance',{pharmacyName:e.target.value}));

      document.getElementById('setModeLight')?.addEventListener('click', () => _setMode('light'));
      document.getElementById('setModeDark')?.addEventListener('click', () => _setMode('dark'));

    }

    if (tab === 'inventory') {
      content.innerHTML = `
        <div class="card">
          <div class="card-head"><h3 class="card-title"><i class="fas fa-boxes-stacked"></i> تنبيهات المخزون والصلاحية</h3></div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">الحد الأدنى الافتراضي للمخزون</label>
              <input class="form-control" id="setLowStock" type="number" min="0" value="${_esc(_vals.lowStockDefault) || 10}" />
            </div>
            <div class="form-group">
              <label class="form-label">التنبيه قبل انتهاء الصلاحية بـ (أيام)</label>
              <input class="form-control" id="setExpiryDays" type="number" min="0" value="${_esc(_vals.expiryAlertDays) || 90}" />
            </div>
          </div>
          <div class="card-foot" style="display:flex;justify-content:flex-end">
            <button class="btn btn-primary btn-sm" id="setSaveInventory"><i class="fas fa-floppy-disk"></i> حفظ</button>
          </div>
        </div>`;
      document.getElementById('setSaveInventory')?.addEventListener('click', () => _save({
        lowStockDefault: document.getElementById('setLowStock').value,
        expiryAlertDays: document.getElementById('setExpiryDays').value,
      }));
      ['setLowStock','setExpiryDays'].forEach(id=>document.getElementById(id)?.addEventListener('input',()=>_renderPreview('inventory',{lowStockDefault:document.getElementById('setLowStock').value,expiryAlertDays:document.getElementById('setExpiryDays').value})));
    }

    if (tab === 'invoice') {
      content.innerHTML = `
        <div class="card">
          <div class="card-head"><h3 class="card-title"><i class="fas fa-file-invoice"></i> إعدادات الفواتير والضريبة</h3></div>
          <div class="card-body">
            <div class="form-group" style="max-width:200px">
              <label class="form-label">نسبة الضريبة (%)</label>
              <input class="form-control" id="setTaxRate" type="number" min="0" step="0.01" value="${_esc(_vals.taxRate) || 0}" />
            </div>
            <div class="form-row cols-2">
              <div class="form-group"><label class="form-label">طريقة الدفع الافتراضية</label><select class="form-control" id="setDefaultPayment"><option value="نقدي" ${_vals.defaultPayment!=='بطاقة'?'selected':''}>نقدي</option><option value="بطاقة" ${_vals.defaultPayment==='بطاقة'?'selected':''}>بطاقة</option></select></div>
              <div class="form-group"><label class="form-label">الحد الأقصى للخصم (%)</label><input class="form-control" id="setMaxDiscount" type="number" min="0" max="100" value="${_esc(_vals.maxDiscount)||100}" /></div>
            </div>
            <div class="form-group">
              <label class="form-label">ملاحظة أسفل الفاتورة</label>
              <input class="form-control" id="setInvoiceNote" value="${_esc(_vals.invoiceNote)}" placeholder="شكراً لتعاملكم معنا" />
            </div>
            <div class="form-group">
              <label class="form-label">خيارات عرض الفاتورة</label>
              <div style="display:flex;flex-direction:column;gap:.55rem">
                <label style="display:flex;align-items:center;gap:.55rem;font-size:.83rem;color:var(--tx-2);cursor:pointer">
                  <input type="checkbox" id="setShowTax" ${_vals.showTax !== '0' ? 'checked' : ''} />
                  إظهار سطر الضريبة في الفاتورة المطبوعة
                </label>
                <label style="display:flex;align-items:center;gap:.55rem;font-size:.83rem;color:var(--tx-2);cursor:pointer">
                  <input type="checkbox" id="setShowCashier" ${_vals.showCashier !== '0' ? 'checked' : ''} />
                  إظهار اسم الصيدلي/المستخدم المسجل في الفاتورة
                </label>
              </div>
            </div>
          </div>
          <div class="card-foot" style="display:flex;justify-content:flex-end">
            <button class="btn btn-primary btn-sm" id="setSaveInvoice"><i class="fas fa-floppy-disk"></i> حفظ</button>
          </div>
        </div>`;
      document.getElementById('setSaveInvoice')?.addEventListener('click', () => _save({
        taxRate:     document.getElementById('setTaxRate').value,
        invoiceNote: document.getElementById('setInvoiceNote').value.trim(),
        showTax:     document.getElementById('setShowTax').checked ? '1' : '0',
        showCashier: document.getElementById('setShowCashier').checked ? '1' : '0',
        defaultPayment: document.getElementById('setDefaultPayment').value,
        maxDiscount: document.getElementById('setMaxDiscount').value,
      }));
      ['setTaxRate','setInvoiceNote','setShowTax','setShowCashier','setDefaultPayment','setMaxDiscount'].forEach(id=>document.getElementById(id)?.addEventListener('input',()=>_renderPreview('invoice',{taxRate:document.getElementById('setTaxRate').value,invoiceNote:document.getElementById('setInvoiceNote').value,showTax:document.getElementById('setShowTax').checked?'1':'0'})));
    }

    if (tab === 'devices') _renderDevicesTab(content);
    if (tab === 'users')   _renderUsersTab(content);
    if (tab === 'backup')  _renderBackupTab(content);
    if (tab === 'activity') _renderActivityTab(content);
  }

  /* ════════════════════════════════════════════════════════
     BACKUP & RESTORE
  ════════════════════════════════════════════════════════ */
  async function _renderBackupTab(content) {
    content.innerHTML = `<div class="card"><div class="card-body"><div class="empty-state"><div class="es-icon an-spin"><i class="fas fa-circle-notch"></i></div><h3 class="es-title">جارٍ قراءة النسخ الاحتياطية...</h3></div></div></div>`;
    try {
      const [backups,secondary] = await Promise.all([DB.listBackups(),_api("secondary_backup")]);
      content.innerHTML = `
        <div class="settings-section-head"><div><h2>النسخ الاحتياطي والاستعادة</h2><p>احمِ بيانات المبيعات والمخزون والمستخدمين من الفقد.</p></div><button class="btn btn-primary" id="createBackupBtn"><i class="fas fa-plus"></i> إنشاء نسخة الآن</button></div>
        <div class="settings-callout safe"><i class="fas fa-shield-halved"></i><div><strong>النسخ تحفظ محليًا</strong><span>يتم إنشاء لقطة سليمة من SQLite دون إيقاف العمل على النظام.</span></div></div>
        <div class="card"><div class="card-head"><span class="card-title">نسخة إضافية خارج المشروع</span></div><div class="card-body">
          <p>اختر مجلدًا على قرص خارجي أو جهاز آخر. مجلد آخر على نفس القرص لا يحمي من تلف القرص.</p>
          <label for="secondaryBackupDir">المسار الكامل للمجلد</label><input id="secondaryBackupDir" class="form-control" dir="ltr" value="${_esc(secondary.directory||'')}" placeholder="E:\\PharmacyBackups">
          <p role="status">الحالة: ${({ok:'آخر نسخة إضافية سليمة',failed:'فشل آخر نسخ إضافي',stale:'لم تُنشأ نسخة إضافية حديثة',not_configured:'لم يُحدد مكان'})[secondary.state]} ${secondary.last_success?'· '+_esc(new Date(secondary.last_success).toLocaleString('ar-EG')):''}</p>
          <p>${_esc(secondary.error||'')}</p><button class="btn btn-primary" id="saveSecondaryBackup">حفظ المكان</button>
          <small>اترك المسار فارغًا لإيقاف النسخة الإضافية. الحفظ لا ينقل بيانات؛ استخدم إنشاء نسخة الآن للاختبار.</small>
        </div></div>
        <div class="card"><div class="card-head"><span class="card-title"><i class="fas fa-clock-rotate-left"></i> النسخ المتاحة</span><span class="badge bdg-slate">${backups.length}</span></div><div class="card-body p0">
          ${backups.length ? `<div class="backup-list">${backups.map((b,i)=>`<div class="backup-row"><span class="backup-icon"><i class="fas fa-database"></i></span><div class="backup-meta"><strong>${_esc(b.filename)}</strong><small>${new Date(b.modified).toLocaleString('ar-EG')} · ${b.size_kb} KB</small></div>${i===0?'<span class="badge bdg-ok">الأحدث</span>':''}<button class="btn btn-ghost btn-sm restore-backup" data-path="${_esc(b.path)}"><i class="fas fa-clock-rotate-left"></i> استعادة</button></div>`).join('')}</div>` : '<div class="empty-state"><div class="es-icon"><i class="fas fa-database"></i></div><h3 class="es-title">لا توجد نسخ بعد</h3><p class="es-sub">أنشئ أول نسخة احتياطية قبل إدخال بيانات التشغيل الفعلية.</p></div>'}
        </div></div>`;
      document.getElementById('saveSecondaryBackup').onclick=async event=>{
        const button=event.currentTarget;button.disabled=true;
        try{await _api('secondary_backup',{body:{directory:document.getElementById('secondaryBackupDir').value.trim()}});Toast.ok('تم حفظ المكان','أنشئ نسخة الآن للتأكد من الوصول وسلامة النسخة');await _renderBackupTab(content);}catch(error){Toast.err('تعذر حفظ المكان',error.message);button.disabled=false;}
      };
      document.getElementById('createBackupBtn')?.addEventListener('click', async e => {
        const btn=e.currentTarget; btn.disabled=true; btn.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> جارٍ الإنشاء';
        try { const result=await DB.backupDatabase(); if(result.secondary_error)Toast.warn('المحلية محفوظة؛ الإضافية فشلت',result.secondary_error);else Toast.ok('تم إنشاء النسخة', result.secondary_path?'تم التحقق من النسختين المحلية والإضافية':result.filename || 'تم حفظ قاعدة البيانات'); _renderBackupTab(content); }
        catch(err){Toast.err('فشل النسخ',err.message);btn.disabled=false;btn.innerHTML='<i class="fas fa-plus"></i> إنشاء نسخة الآن';}
      });
      content.querySelectorAll('.restore-backup').forEach(btn=>btn.addEventListener('click',()=>{
        const path=btn.dataset.path;
        Modal.confirm('استعادة قاعدة البيانات','سيتم حفظ نسخة من الوضع الحالي أولًا، ثم استعادة النسخة المختارة. يجب إعادة تشغيل التطبيق بعد العملية.',async()=>{
          try{await DB.restoreDatabase(path);Toast.ok('تمت الاستعادة','أعد تشغيل التطبيق لتحميل البيانات المستعادة');}
          catch(err){Toast.err('فشلت الاستعادة',err.message);}
        },'تأكيد الاستعادة','btn-danger');
      }));
    } catch(e) { content.innerHTML=`<div class="alert err"><i class="fas fa-circle-xmark"></i> ${_esc(e.message)}</div>`; }
  }

  /* ════════════════════════════════════════════════════════
     ACTIVITY LOG
  ════════════════════════════════════════════════════════ */
  async function _renderActivityTab(content) {
    content.innerHTML = `<div class="card"><div class="card-body"><div class="empty-state"><div class="es-icon an-spin"><i class="fas fa-circle-notch"></i></div><h3 class="es-title">جارٍ تحميل سجل النشاط...</h3></div></div></div>`;
    try {
      const result=await DB.getAuditLog(150,0), items=result.items||[];
      const actionLabel={ADD:'إضافة',UPDATE:'تعديل',DELETE:'حذف',ARCHIVE:'أرشفة',VOID:'إلغاء',RESTORE:'استعادة'};
      const entityLabel={medicine:'دواء',patient:'مريض',supplier:'مورد',sale:'فاتورة',user:'مستخدم'};
      content.innerHTML=`<div class="settings-section-head"><div><h2>سجل نشاط النظام</h2><p>تتبع العمليات الحساسة ومن نفذها ووقت تنفيذها.</p></div><span class="badge bdg-slate">${result.total||items.length} عملية</span></div>
        <div class="card"><div class="card-body p0">${items.length?`<div class="audit-list">${items.map(x=>`<div class="audit-row"><span class="audit-dot ${String(x.action).toLowerCase()}"></span><div class="audit-main"><strong>${actionLabel[x.action]||x.action} ${entityLabel[x.entity]||x.entity}</strong><small>${_esc(x.details||x.entity_id||'')}</small></div><div class="audit-who"><strong>${_esc(x.user_id||'system')}</strong><small>${new Date(x.timestamp).toLocaleString('ar-EG')}</small></div></div>`).join('')}</div>`:'<div class="empty-state"><div class="es-icon"><i class="fas fa-clock-rotate-left"></i></div><h3 class="es-title">لا يوجد نشاط مسجل</h3></div>'}</div></div>`;
    } catch(e){content.innerHTML=`<div class="alert err"><i class="fas fa-circle-xmark"></i> ${_esc(e.message)}</div>`;}
  }

  /* ════════════════════════════════════════════════════════
     DEVICES TAB — printer + barcode scanner
  ════════════════════════════════════════════════════════ */
  function _renderDevicesTab(content) {
    const dv = DeviceSettings.get();
    content.innerHTML = `
      <div class="card" style="margin-bottom:1rem">
        <div class="card-head"><h3 class="card-title"><i class="fas fa-print"></i> إعدادات الطابعة الحرارية (Receipt Printer)</h3></div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">مقاس ورق الفاتورة الافتراضي</label>
            <div style="display:flex;gap:.5rem;max-width:360px">
              <button class="tab-btn ${dv.paperWidth==='80'?'active':''}" id="devPaper80" type="button" style="flex:1;justify-content:center">80mm (Standard POS)</button>
              <button class="tab-btn ${dv.paperWidth==='58'?'active':''}" id="devPaper58" type="button" style="flex:1;justify-content:center">58mm (Compact Mini)</button>
            </div>
          </div>
          <label style="display:flex;align-items:center;gap:.55rem;font-size:.83rem;color:var(--tx-2);cursor:pointer;margin-top:.6rem">
            <input type="checkbox" id="devAutoPrint" ${dv.autoPrint?'checked':''} />
            طباعة الفاتورة تلقائياً فور إتمام عملية البيع
          </label>
        </div>
        <div class="card-foot" style="display:flex;justify-content:flex-start;gap:.75rem">
          <button class="btn btn-ghost btn-sm" id="devTestPrint"><i class="fas fa-receipt"></i> طباعة فاتورة تجريبية</button>
          <button class="btn btn-ghost btn-sm" id="devTestSticker"><i class="fas fa-barcode"></i> طباعة ملصق باركود تجريبي</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:1rem">
        <div class="card-head"><h3 class="card-title"><i class="fas fa-barcode"></i> قارئ الباركود (Barcode Scanner)</h3></div>
        <div class="card-body">
          <label style="display:flex;align-items:center;gap:.55rem;font-size:.83rem;color:var(--tx-2);cursor:pointer">
            <input type="checkbox" id="devBarcodeOn" ${dv.barcodeScan?'checked':''} />
            تفعيل استقبال مسح الباركود في نقطة البيع
          </label>
          <p style="font-size:.76rem;color:var(--tx-3);margin-top:.5rem;line-height:1.7">
            قارئ الباركود (USB / Wireless) يعمل تلقائياً كمدخل سريع. عند مسح أي علبة دواء في شاشة نقطة البيع، سيتم التعرف على الدواء وإضافته للسلة فوراً.
          </p>
          <div class="form-group" style="margin-top:.75rem;max-width:340px">
            <label class="form-label">اختبار قارئ الباركود</label>
            <input class="form-control" id="devBarcodeTest" placeholder="امسح بالماسح الضوئي أو اكتب واضغط Enter" dir="ltr" />
            <div id="devBarcodeResult" style="font-size:.8rem;margin-top:.5rem;color:var(--tx-3)"></div>
          </div>
        </div>
      </div>

      <div class="camera-launch-card">
        <span aria-hidden="true"><i class="fas fa-camera"></i></span>
        <div><h3>الكاميرا والمسح</h3><p>اختبر الجهاز والدقة هنا. التصوير وربط الصور داخل الدواء والروشتة، والمسح داخل البيع والجرد والاستلام.</p>
        <button class="btn btn-primary" id="cameraTestBtn">اختبار الكاميرا</button>
        <button class="btn btn-ghost" id="cameraScanTestBtn">اختبار قراءة الباركود</button></div>
      </div>`;

    const setPaper = w => { DeviceSettings.set({ paperWidth: w }); _renderDevicesTab(content); };
    document.getElementById('devPaper80')?.addEventListener('click', () => setPaper('80'));
    document.getElementById('devPaper58')?.addEventListener('click', () => setPaper('58'));
    document.getElementById('devAutoPrint')?.addEventListener('change', e => {
      DeviceSettings.set({ autoPrint: e.target.checked });
      Toast.ok('تم حفظ الإعدادات');
    });
    document.getElementById('devBarcodeOn')?.addEventListener('change', e => {
      DeviceSettings.set({ barcodeScan: e.target.checked });
      Toast.ok('تم حفظ الإعدادات');
    });

    document.getElementById('cameraTestBtn')?.addEventListener('click', () => CameraStudio.open({title:'اختبار كاميرا الجهاز'}));
    document.getElementById('cameraScanTestBtn')?.addEventListener('click', () => CameraWorkflows.scan({title:'اختبار الباركود', onAccept:async()=>{}, acceptLabel:'تم الاختبار'}));

    document.getElementById('devTestPrint')?.addEventListener('click', () => {
      const tmp = document.createElement('div');
      tmp.id = 'devTestReceipt';
      tmp.className = 'receipt';
      tmp.style.display = 'none';
      const sampleBarcode = BarcodeGenerator.generateSVG('INV-2026-TEST', { height: 26, includeText: true });
      tmp.innerHTML = `
        <div class="rcp-head"><div class="rcp-title">${_esc(_vals.pharmacyName) || 'صيدلية الشفاء'}</div>
        <div class="rcp-sub">طباعة تجريبية — اختبار الطابعة</div></div>
        <div class="rcp-div"></div>
        <div class="rcp-row"><span>دواء تجريبي 500mg</span><span>15.00 ر.س</span></div>
        <div class="rcp-row"><span>فيتامين سي</span><span>25.00 ر.س</span></div>
        <div class="rcp-div"></div>
        <div class="rcp-row total"><span>الإجمالي التجريبي</span><span>40.00 ر.س</span></div>
        <div class="rcp-barcode">${sampleBarcode}</div>
        <div class="rcp-foot-note">تمت الطباعة بنجاح من نظام الصيدلية</div>`;
      document.body.appendChild(tmp);
      printElement('devTestReceipt', 'طباعة تجريبية');
      setTimeout(() => tmp.remove(), 2000);
    });

    document.getElementById('devTestSticker')?.addEventListener('click', () => {
      printBarcodeStickers({
        name: 'باراسيتامول 500mg',
        price: 12.00,
        barcode: '6001000000002',
        expiry: '2027-03-15'
      }, 1, _vals.pharmacyName || 'صيدلية الشفاء');
      Toast.ok('طباعة ملصق', 'تم إرسال الملصق التجريبي للطابعة');
    });

    document.getElementById('devBarcodeTest')?.addEventListener('keydown', async e => {
      if (e.key !== 'Enter') return;
      const code = e.target.value.trim();
      const box = document.getElementById('devBarcodeResult');
      if (!code || !box) return;
      try {
        const meds = await DB.getMedicines();
        const med = meds.find(m => m.barcode === code || m.id.toLowerCase() === code.toLowerCase());
        box.innerHTML = med
          ? `<span style="color:var(--ok)"><i class="fas fa-circle-check"></i> ${med.name} — ${Fmt.money(med.price)} (مخزون: ${med.stock})</span>`
          : `<span style="color:var(--err)"><i class="fas fa-circle-xmark"></i> لا يوجد صنف مسجل بهذا الباركود (${code})</span>`;
      } catch (err) { box.textContent = err.message; }
      e.target.value = '';
    });
  }


  /* ════════════════════════════════════════════════════════
     USERS TAB — قسم إدارة المستخدمين والصلاحيات المتكامل
  ════════════════════════════════════════════════════════ */
  async function _renderUsersTab(content) {
    const me = Auth.getCurrent();
    if (!_isAdmin()) {
      content.innerHTML = `
        <div class="card">
          <div class="card-head"><h3 class="card-title"><i class="fas fa-lock"></i> إدارة المستخدمين</h3></div>
          <div class="card-body">
            <div class="alert warn" style="display:flex;align-items:center;gap:.75rem">
              <i class="fas fa-shield-halved" style="font-size:1.5rem"></i>
              <div>
                <strong>غير مصرح:</strong> هذه الصفحة مخصصة لمدير النظام فقط.
                <div style="font-size:.8rem;margin-top:.2rem">دورك الحالي في النظام هو: <strong>${me?.role || 'مستخدم'}</strong></div>
              </div>
            </div>
          </div>
        </div>`;
      return;
    }

    content.innerHTML = `
      <!-- بطاقات الإحصائيات السريعة للمستخدمين -->
      <div class="usr-stats-grid" id="usrStatsGrid">
        <div class="usr-stat-card">
          <div class="usr-stat-ico" style="background:var(--teal-50);color:var(--teal-600)"><i class="fas fa-users"></i></div>
          <div>
            <div class="usr-stat-num" id="statTotalUsers">—</div>
            <div class="usr-stat-lbl">إجمالي المستخدمين</div>
          </div>
        </div>
        <div class="usr-stat-card">
          <div class="usr-stat-ico" style="background:var(--amb-100);color:var(--amb-700)"><i class="fas fa-shield-halved"></i></div>
          <div>
            <div class="usr-stat-num" id="statAdmins">—</div>
            <div class="usr-stat-lbl">مديرو النظام</div>
          </div>
        </div>
        <div class="usr-stat-card">
          <div class="usr-stat-ico" style="background:var(--ok-light);color:var(--ok)"><i class="fas fa-user-doctor"></i></div>
          <div>
            <div class="usr-stat-num" id="statPharmacists">—</div>
            <div class="usr-stat-lbl">صيادلة مسؤولون</div>
          </div>
        </div>
        <div class="usr-stat-card">
          <div class="usr-stat-ico" style="background:var(--sl-100);color:var(--sl-700)"><i class="fas fa-user-nurse"></i></div>
          <div>
            <div class="usr-stat-num" id="statAssistants">—</div>
            <div class="usr-stat-lbl">مساعدو الصيدلي</div>
          </div>
        </div>
      </div>

      <!-- بطاقة جدول المستخدمين الرئيسية -->
      <div class="card">
        <div class="card-head" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.75rem">
          <div>
            <h3 class="card-title"><i class="fas fa-users-gear"></i> إدارة المستخدمين</h3>
            <p style="font-size:.76rem;color:var(--tx-3);margin-top:.2rem">إدارة حسابات فريق العمل، تعيين الصلاحيات، وإعادة تعيين كلمات المرور</p>
          </div>
          <button class="btn btn-primary btn-sm" id="usrAddBtn"><i class="fas fa-user-plus"></i> إضافة مستخدم جديد</button>
        </div>

        <!-- شريط التصفية والبحث -->
        <div class="usr-filter-row">
          <div style="display:flex;align-items:center;gap:.6rem;flex:1;flex-wrap:wrap">
            <div class="input-wrap usr-search-input" style="position:relative">
              <input type="search" id="usrSearchInp" class="form-control" placeholder="بحث بالاسم، اسم المستخدم، الهاتف..." style="padding-right:2.2rem;font-size:.83rem" />
              <i class="fas fa-magnifying-glass" style="position:absolute;right:.8rem;top:50%;transform:translateY(-50%);color:var(--tx-3)"></i>
            </div>
            <select class="form-control" id="usrRoleFilter" style="width:160px;font-size:.83rem;padding:.5rem .8rem">
              <option value="all">جميع الأدوار</option>
              <option value="مدير النظام">مدير النظام</option>
              <option value="صيدلاني مسؤول">صيدلاني مسؤول</option>
              <option value="مساعد صيدلي">مساعد صيدلي</option>
            </select>
          </div>
          <div id="usrCountBadge" style="font-size:.78rem;font-weight:700;color:var(--tx-3)"></div>
        </div>

        <div class="card-body p0">
          <div class="tbl-wrap">
            <table class="dtable">
              <thead><tr>
                <th>المستخدم</th>
                <th>اسم الدخول</th>
                <th>الصلاحية / الدور</th>
                <th>بيانات التواصل</th>
                <th>آخر تسجيل دخول</th>
                <th style="text-align:center">الإجراءات</th>
              </tr></thead>
              <tbody id="usrTbody">
                <tr><td colspan="6"><div class="empty-state">
                  <div class="es-icon an-spin"><i class="fas fa-circle-notch"></i></div>
                  <h3 class="es-title">جارٍ تحميل المستخدمين...</h3>
                </div></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- دليل الصلاحيات والأدوار التوضيحي -->
      <div class="role-guide-card">
        <div class="role-guide-head" id="roleGuideToggle">
          <span><i class="fas fa-circle-info" style="color:var(--teal-500);margin-left:.4rem"></i> دليل الصلاحيات والأدوار في النظام</span>
          <i class="fas fa-chevron-down" id="roleGuideIcon" style="transition:transform var(--t-fast)"></i>
        </div>
        <div class="role-guide-body" id="roleGuideBody">
          <div class="role-guide-col" style="border-right:3px solid var(--amb-500)">
            <h4><span class="badge bdg-amb"><i class="fas fa-shield-halved"></i> مدير النظام</span></h4>
            <ul>
              <li><i class="fas fa-check ok" style="color:var(--ok);margin-left:.3rem"></i> كامل الصلاحيات دون قيود</li>
              <li><i class="fas fa-check ok" style="color:var(--ok);margin-left:.3rem"></i> إدارة حسابات المستخدمين وكلمات المرور</li>
              <li><i class="fas fa-check ok" style="color:var(--ok);margin-left:.3rem"></i> تقارير الأرباح والتحليلات المالية</li>
              <li><i class="fas fa-check ok" style="color:var(--ok);margin-left:.3rem"></i> النسخ الاحتياطي واستعادة البيانات</li>
              <li><i class="fas fa-check ok" style="color:var(--ok);margin-left:.3rem"></i> تعديل إعدادات وهوية الصيدلية</li>
            </ul>
          </div>
          <div class="role-guide-col" style="border-right:3px solid var(--teal-500)">
            <h4><span class="badge bdg-teal"><i class="fas fa-user-doctor"></i> صيدلاني مسؤول</span></h4>
            <ul>
              <li><i class="fas fa-check ok" style="color:var(--ok);margin-left:.3rem"></i> البيع وإصدار الفواتير</li>
              <li><i class="fas fa-check ok" style="color:var(--ok);margin-left:.3rem"></i> إضافة وتعديل الأدوية والمخزون</li>
              <li><i class="fas fa-check ok" style="color:var(--ok);margin-left:.3rem"></i> إدارة سجلات المرضى والموردين</li>
              <li><i class="fas fa-check ok" style="color:var(--ok);margin-left:.3rem"></i> استعراض تقارير المبيعات</li>
              <li><i class="fas fa-xmark no" style="color:var(--tx-3);margin-left:.3rem"></i> لا يمكنه تعديل إعدادات النظام أو المستخدمين</li>
            </ul>
          </div>
          <div class="role-guide-col" style="border-right:3px solid var(--sl-500)">
            <h4><span class="badge bdg-slate"><i class="fas fa-user-nurse"></i> مساعد صيدلي</span></h4>
            <ul>
              <li><i class="fas fa-check ok" style="color:var(--ok);margin-left:.3rem"></i> البيع وإتمام المعاملات في POS</li>
              <li><i class="fas fa-check ok" style="color:var(--ok);margin-left:.3rem"></i> استعراض قائمة الأدوية والأسعار</li>
              <li><i class="fas fa-check ok" style="color:var(--ok);margin-left:.3rem"></i> استعراض فواتير اليوم</li>
              <li><i class="fas fa-xmark no" style="color:var(--tx-3);margin-left:.3rem"></i> لا يمكنه تعديل بيانات الأدوية أو الأسعار</li>
              <li><i class="fas fa-xmark no" style="color:var(--tx-3);margin-left:.3rem"></i> لا يمكنه الوصول للتقارير والإعدادات</li>
            </ul>
          </div>
        </div>
      </div>
    `;

    document.getElementById('usrAddBtn')?.addEventListener('click', () => _openUserForm());

    const searchInp = document.getElementById('usrSearchInp');
    searchInp?.addEventListener('input', e => {
      _searchQuery = e.target.value.trim().toLowerCase();
      _filterAndRenderUsers();
    });

    const roleFilter = document.getElementById('usrRoleFilter');
    roleFilter?.addEventListener('change', e => {
      _selectedRoleFilter = e.target.value;
      _filterAndRenderUsers();
    });

    const guideToggle = document.getElementById('roleGuideToggle');
    const guideBody = document.getElementById('roleGuideBody');
    const guideIcon = document.getElementById('roleGuideIcon');
    guideToggle?.addEventListener('click', () => {
      const isClosed = guideBody.style.display === 'none';
      guideBody.style.display = isClosed ? 'grid' : 'none';
      if (guideIcon) guideIcon.style.transform = isClosed ? 'rotate(0deg)' : 'rotate(180deg)';
    });

    await _loadUsers();
  }

  async function _loadUsers() {
    try {
      _allUsers = await DB.getUsers();
      _updateStats();
      _filterAndRenderUsers();
    } catch (e) {
      const tbody = document.getElementById('usrTbody');
      if (tbody) tbody.innerHTML = `<tr><td colspan="6"><div class="alert err">${e.message}</div></td></tr>`;
    }
  }

  function _updateStats() {
    const total = _allUsers.length;
    const admins = _allUsers.filter(u => u.role === 'مدير النظام').length;
    const pharmacists = _allUsers.filter(u => u.role === 'صيدلاني مسؤول').length;
    const assistants = _allUsers.filter(u => u.role === 'مساعد صيدلي').length;

    const elTotal = document.getElementById('statTotalUsers');
    const elAdmins = document.getElementById('statAdmins');
    const elPharm = document.getElementById('statPharmacists');
    const elAsst = document.getElementById('statAssistants');

    if (elTotal) elTotal.textContent = total;
    if (elAdmins) elAdmins.textContent = admins;
    if (elPharm) elPharm.textContent = pharmacists;
    if (elAsst) elAsst.textContent = assistants;
  }

  function _filterAndRenderUsers() {
    let list = _allUsers;
    if (_selectedRoleFilter !== 'all') {
      list = list.filter(u => u.role === _selectedRoleFilter);
    }
    if (_searchQuery) {
      list = list.filter(u =>
        (u.fullName || '').toLowerCase().includes(_searchQuery) ||
        (u.username || '').toLowerCase().includes(_searchQuery) ||
        (u.phone || '').includes(_searchQuery) ||
        (u.email || '').toLowerCase().includes(_searchQuery)
      );
    }
    _filteredUsers = list;

    const countBadge = document.getElementById('usrCountBadge');
    if (countBadge) countBadge.textContent = `${list.length} مستخدم`;

    _renderUsersTable(list);
  }

  function _getRoleMeta(role) {
    return ROLES.find(r => r.id === role) || { label: role, icon: 'fa-user', cls: 'assistant', bdg: 'bdg-slate' };
  }

  function _getAvatarInitials(name) {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
    return parts.map(p => p[0]).join('') || name[0] || 'U';
  }

  function _renderUsersTable(users) {
    const tbody = document.getElementById('usrTbody');
    if (!tbody) return;

    if (!users.length) {
      tbody.innerHTML = `
        <tr><td colspan="6">
          <div class="empty-state" style="padding:2rem 1rem">
            <div class="es-icon" style="background:var(--sl-100);color:var(--sl-500)"><i class="fas fa-users-slash"></i></div>
            <h3 class="es-title">لا يوجد مستخدمون مطابقون للبحث</h3>
            <p class="es-text">جرب تغيير كلمات البحث أو تصفية الأدوار</p>
          </div>
        </td></tr>`;
      return;
    }

    const me = Auth.getCurrent();
    tbody.innerHTML = users.map(u => {
      const isMe = u.id === me?.id;
      const roleMeta = _getRoleMeta(u.role);
      const initials = _getAvatarInitials(u.fullName);

      return `
        <tr>
          <!-- المستخدم والاسم -->
          <td>
            <div style="display:flex;align-items:center;gap:.75rem">
              <div class="usr-avatar ${roleMeta.cls}">${initials}</div>
              <div>
                <div style="font-weight:700;color:var(--tx);display:flex;align-items:center;gap:.4rem">
                  ${_esc(u.fullName)}
                  ${isMe ? '<span class="badge bdg-teal" style="font-size:.65rem;padding:2px 6px"><i class="fas fa-user-check"></i> أنت</span>' : ''}
                </div>
                <div style="font-size:.72rem;color:var(--tx-3)">معرف: ${u.id}</div>
              </div>
            </div>
          </td>

          <!-- اسم الدخول -->
          <td>
            <span style="font-family:monospace;font-size:.86rem;font-weight:600;color:var(--tx);direction:ltr;display:inline-block;background:var(--surface-2);padding:2px 8px;border-radius:var(--r-xs);border:1px solid var(--border-2)">
              @${_esc(u.username)}
            </span>
          </td>

          <!-- الصلاحية -->
          <td>
            <span class="badge ${roleMeta.bdg}">
              <i class="fas ${roleMeta.icon}"></i> ${roleMeta.label}
            </span>
          </td>

          <!-- بيانات التواصل -->
          <td>
            <div style="font-size:.78rem;color:var(--tx-2);display:flex;flex-direction:column;gap:2px">
              ${u.phone ? `<div><i class="fas fa-phone" style="width:14px;color:var(--tx-3)"></i> <span dir="ltr">${_esc(u.phone)}</span></div>` : ''}
              ${u.email ? `<div><i class="fas fa-envelope" style="width:14px;color:var(--tx-3)"></i> <span dir="ltr">${_esc(u.email)}</span></div>` : ''}
              ${!u.phone && !u.email ? '<span style="color:var(--tx-3)">—</span>' : ''}
            </div>
          </td>

          <!-- آخر تسجيل دخول -->
          <td>
            <div style="font-size:.78rem;color:var(--tx-2)">
              ${u.lastLogin ? `
                <div style="font-weight:600"><i class="fas fa-clock" style="color:var(--teal-500);margin-left:3px"></i> ${u.lastLogin.split('T')[0]}</div>
                <div style="font-size:.7rem;color:var(--tx-3)">${(u.lastLogin.split('T')[1]||'').slice(0,5)}</div>
              ` : '<span class="badge bdg-slate" style="font-size:.68rem">لم يسجل دخول بعد</span>'}
            </div>
          </td>

          <!-- الإجراءات -->
          <td>
            <div class="td-actions" style="justify-content:center">
              <button class="btn btn-ghost btn-icon sm" data-action="edit" data-id="${u.id}" title="تعديل بيانات المستخدم">
                <i class="fas fa-pen"></i>
              </button>
              <button class="btn btn-outline btn-icon sm" data-action="pwd" data-id="${u.id}" title="إعادة تعيين كلمة المرور">
                <i class="fas fa-key"></i>
              </button>
              <button class="btn btn-danger btn-icon sm" data-action="del" data-id="${u.id}" title="${isMe ? 'لا يمكن حذف حسابك الحالي' : 'حذف المستخدم'}" ${isMe ? 'disabled style="opacity:.3;cursor:not-allowed"' : ''}>
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const u = _allUsers.find(x => x.id === btn.dataset.id);
        if (!u) return;
        if (btn.dataset.action === 'edit') _openUserForm(u);
        if (btn.dataset.action === 'pwd')  _openResetPwd(u);
        if (btn.dataset.action === 'del')  _deleteUser(u);
      });
    });
  }

  function _generateRandomPassword(len = 8) {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$';
    let res = '';
    for (let i = 0; i < len; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
  }

  function _renderRolePermsPreview(role) {
    const perms = ROLE_PERMS_INFO[role] || [];
    return `
      <div class="role-perm-box">
        <div class="role-perm-title">
          <i class="fas fa-list-check" style="color:var(--teal-500)"></i>
          <span>صلاحيات دور (${_esc(role)}):</span>
        </div>
        <div class="role-perm-list">
          ${perms.map(p => `
            <div class="role-perm-item">
              <i class="fas ${p.ok ? 'fa-circle-check ok' : 'fa-circle-xmark no'}"></i>
              <span>${p.text}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
  }

  function _openUserForm(u) {
    const isEdit = !!u;
    const currentRole = u?.role || 'صيدلاني مسؤول';

    Modal.open({
      title: isEdit ? `<i class="fas fa-user-pen"></i> تعديل بيانات: ${u.fullName}` : '<i class="fas fa-user-plus"></i> إضافة مستخدم جديد',
      size: 'lg',
      body: `
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label"><i class="fas fa-id-card" style="color:var(--teal-500)"></i> الاسم الكامل <span class="req">*</span></label>
            <input class="form-control" id="fUsrName" value="${_esc(u?.fullName)}" placeholder="مثال: د. سارة أحمد" required />
          </div>
          <div class="form-group">
            <label class="form-label"><i class="fas fa-at" style="color:var(--teal-500)"></i> اسم المستخدم (Login) <span class="req">*</span></label>
            <input class="form-control" id="fUsrUsername" value="${_esc(u?.username)}" dir="ltr" placeholder="مثال: sarah_ahmed" required />
          </div>
        </div>

        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label"><i class="fas fa-user-tag" style="color:var(--teal-500)"></i> الدور الوظيفي / الصلاحية <span class="req">*</span></label>
            <select class="form-control" id="fUsrRole">
              ${ROLES.map(r => `<option value="${r.id}" ${currentRole === r.id ? 'selected' : ''}>${r.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label"><i class="fas fa-phone" style="color:var(--teal-500)"></i> رقم الهاتف</label>
            <input class="form-control" id="fUsrPhone" value="${_esc(u?.phone)}" dir="ltr" placeholder="05xxxxxxxx" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label"><i class="fas fa-envelope" style="color:var(--teal-500)"></i> البريد الإلكتروني</label>
          <input class="form-control" id="fUsrEmail" type="email" value="${_esc(u?.email)}" dir="ltr" placeholder="user@pharmacy.com" />
        </div>

        ${!isEdit ? `
          <div class="form-group" style="background:var(--surface-2);padding:.85rem;border-radius:var(--r-sm);border:1px solid var(--border-2)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.35rem">
              <label class="form-label" style="margin-bottom:0"><i class="fas fa-key" style="color:var(--teal-500)"></i> كلمة المرور الأولى</label>
              <button type="button" class="btn btn-ghost btn-sm" id="btnGenPwd" style="font-size:.74rem;padding:2px 8px">
                <i class="fas fa-wand-magic-sparkles"></i> توليد كلمة مرور
              </button>
            </div>
            <div class="input-wrap" style="position:relative">
              <input class="form-control" id="fUsrPassword" type="password" value="123456" placeholder="كلمة المرور (الافتراضية: 123456)" dir="ltr" />
              <button type="button" id="btnToggleUsrPwd" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--tx-3);cursor:pointer">
                <i class="fas fa-eye"></i>
              </button>
            </div>
            <div style="font-size:.73rem;color:var(--tx-3);margin-top:.3rem">
              <i class="fas fa-info-circle"></i> يمكن للمستخدم تغيير كلمة مروره بعد تسجيل الدخول.
            </div>
          </div>
        ` : ''}

        <!-- معاينة صلاحيات الدور المختار -->
        <div id="rolePermPreviewContainer">
          ${_renderRolePermsPreview(currentRole)}
        </div>
      `,
      foot: `
        <button class="btn btn-primary" id="saveUsrBtn"><i class="fas fa-check"></i> ${isEdit ? 'حفظ التعديلات' : 'إضافة المستخدم'}</button>
        <button class="btn btn-ghost" onclick="Modal.close()">إلغاء</button>
      `,
    });

    // تحديث معاينة الصلاحيات عند تغيير الدور
    document.getElementById('fUsrRole')?.addEventListener('change', e => {
      const container = document.getElementById('rolePermPreviewContainer');
      if (container) container.innerHTML = _renderRolePermsPreview(e.target.value);
    });

    // زر توليد كلمة المرور
    document.getElementById('btnGenPwd')?.addEventListener('click', () => {
      const pwdInp = document.getElementById('fUsrPassword');
      if (pwdInp) {
        pwdInp.value = _generateRandomPassword(8);
        pwdInp.type = 'text';
        Toast.ok('تم توليد كلمة مرور عشوائية');
      }
    });

    // زر إظهار/إخفاء كلمة المرور
    document.getElementById('btnToggleUsrPwd')?.addEventListener('click', () => {
      const pwdInp = document.getElementById('fUsrPassword');
      const icon = document.querySelector('#btnToggleUsrPwd i');
      if (!pwdInp) return;
      const isPwd = pwdInp.type === 'password';
      pwdInp.type = isPwd ? 'text' : 'password';
      if (icon) icon.className = isPwd ? 'fas fa-eye-slash' : 'fas fa-eye';
    });

    document.getElementById('saveUsrBtn')?.addEventListener('click', () => _saveUser(u?.id));
  }

  async function _saveUser(id) {
    const fullName = document.getElementById('fUsrName')?.value.trim();
    const username = document.getElementById('fUsrUsername')?.value.trim();
    const role     = document.getElementById('fUsrRole')?.value;
    const phone    = document.getElementById('fUsrPhone')?.value.trim();
    const email    = document.getElementById('fUsrEmail')?.value.trim();

    if (!fullName || !username) {
      Toast.err('بيانات ناقصة', 'الاسم الكامل واسم المستخدم حقول إجبارية');
      return;
    }

    const payload = {
      full_name: fullName,
      username:  username,
      role:      role,
      phone:     phone,
      email:     email,
    };

    const pwdInput = document.getElementById('fUsrPassword');
    if (pwdInput) payload.password = pwdInput.value.trim() || '123456';

    const saveBtn = document.getElementById('saveUsrBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جارٍ الحفظ...'; }

    try {
      if (id) {
        await DB.updateUser(id, payload);
        Toast.ok('تم تحديث المستخدم', `تم تحديث بيانات ${fullName} بنجاح`);
      } else {
        await DB.addUser(payload);
        Toast.ok('تمت إضافة المستخدم', `تم إنشاء حساب جديد لـ ${fullName}`);
      }
      Modal.close();
      await _loadUsers();
    } catch (e) {
      Toast.err('تعذر حفظ المستخدم', e.message);
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-check"></i> حفظ'; }
    }
  }

  function _openResetPwd(u) {
    Modal.open({
      title: `<i class="fas fa-key"></i> إعادة تعيين كلمة المرور: ${u.fullName}`,
      size: 'md',
      body: `
        <div style="display:flex;align-items:center;gap:.75rem;padding:.85rem;background:var(--surface-2);border-radius:var(--r-sm);margin-bottom:1rem">
          <div class="usr-avatar ${_getRoleMeta(u.role).cls}">${_getAvatarInitials(u.fullName)}</div>
          <div>
            <div style="font-weight:700;color:var(--tx)">${_esc(u.fullName)}</div>
            <div style="font-size:.76rem;color:var(--tx-3)">اسم الدخول: @${_esc(u.username)} | الصلاحية: ${u.role}</div>
          </div>
        </div>

        <div class="form-group">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.35rem">
            <label class="form-label" style="margin-bottom:0">كلمة المرور الجديدة</label>
            <div style="display:flex;gap:.35rem">
              <button type="button" class="btn btn-ghost btn-sm" id="btnPresetDefault" style="font-size:.72rem;padding:2px 7px">
                تعيين: 123456
              </button>
              <button type="button" class="btn btn-ghost btn-sm" id="btnGenPwdReset" style="font-size:.72rem;padding:2px 7px">
                <i class="fas fa-wand-magic-sparkles"></i> توليد عشوائي
              </button>
            </div>
          </div>
          <div class="input-wrap" style="position:relative">
            <input class="form-control" id="fNewPwd" type="text" value="123456" placeholder="أدخل كلمة المرور الجديدة" dir="ltr" required />
            <button type="button" id="btnToggleResetPwd" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--tx-3);cursor:pointer">
              <i class="fas fa-eye-slash"></i>
            </button>
          </div>
          <div style="font-size:.73rem;color:var(--tx-3);margin-top:.35rem">
            سيُطلب من المستخدم استخدام كلمة المرور هذه عند تسجيل الدخول القادم.
          </div>
        </div>
      `,
      foot: `
        <button class="btn btn-primary" id="savePwdBtn"><i class="fas fa-check"></i> تحديث كلمة المرور</button>
        <button class="btn btn-ghost" onclick="Modal.close()">إلغاء</button>
      `,
    });

    document.getElementById('btnPresetDefault')?.addEventListener('click', () => {
      const inp = document.getElementById('fNewPwd');
      if (inp) inp.value = '123456';
    });

    document.getElementById('btnGenPwdReset')?.addEventListener('click', () => {
      const inp = document.getElementById('fNewPwd');
      if (inp) {
        inp.value = _generateRandomPassword(8);
        Toast.ok('تم توليد كلمة مرور عشوائية');
      }
    });

    document.getElementById('btnToggleResetPwd')?.addEventListener('click', () => {
      const pwdInp = document.getElementById('fNewPwd');
      const icon = document.querySelector('#btnToggleResetPwd i');
      if (!pwdInp) return;
      const isPwd = pwdInp.type === 'password';
      pwdInp.type = isPwd ? 'text' : 'password';
      if (icon) icon.className = isPwd ? 'fas fa-eye-slash' : 'fas fa-eye';
    });

    document.getElementById('savePwdBtn')?.addEventListener('click', async () => {
      const pwd = document.getElementById('fNewPwd')?.value.trim() || '123456';
      const btn = document.getElementById('savePwdBtn');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جارٍ التحديث...'; }
      try {
        await DB.resetUserPassword(u.id, pwd);
        Toast.ok('تم تغيير كلمة المرور', `تم تعيين كلمة المرور الجديدة لـ ${u.fullName}`);
        Modal.close();
      } catch (e) {
        Toast.err('فشل إعادة التعيين', e.message);
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> تحديث كلمة المرور'; }
      }
    });
  }

  function _deleteUser(u) {
    const me = Auth.getCurrent();
    if (me && me.id === u.id) {
      Toast.err('إجراء غير مسموح', 'لا يمكنك حذف حسابك الشخصي المسجل به حالياً');
      return;
    }
    Modal.confirm(
      'حذف المستخدم',
      `هل أنت متأكد من رغبتك في حذف حساب "${u.fullName}" (@${u.username}) نهائياً من النظام؟ لن يتمكن المستخدم من الدخول بعد ذلك.`,
      async () => {
        try {
          await DB.deleteUser(u.id);
          Toast.ok('تم الحذف', `تم حذف حساب ${u.fullName} بنجاح`);
          await _loadUsers();
        } catch (e) {
          Toast.err('فشل الحذف', e.message);
        }
      }
    );
  }

  function _setMode(mode) {
    Theme.applyMode(mode);
    _save({ themeMode: mode }, false, true);
  }

  async function _save(fields, refreshBranding, silentRerender) {
    try {
      await Promise.all(Object.entries(fields).map(([name, val]) => DB.setSetting(KEYS[name], val)));
      Object.assign(_vals, fields);
      if (refreshBranding || 'pharmacyName' in fields || 'pharmacyLogo' in fields) App.applyBranding();
      if (silentRerender) { _renderTab(_activeTab); return; }
      Toast.ok('تم حفظ الإعدادات بنجاح');
    } catch (e) {
      Toast.err(e.message || 'فشل حفظ الإعدادات');
    }
  }

  function _esc(v) {
    return v === null || v === undefined ? '' : String(v).replace(/"/g, '&quot;');
  }

  return { render, afterRender };
})();
