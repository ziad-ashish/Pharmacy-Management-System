/* ════════════════════════════════════════════════════════════
   PAGE: MEDICINES & INVENTORY  (async) - ENHANCED VERSION
   مع نظام الوحدات الهرمي والتجزئة الذكية
════════════════════════════════════════════════════════════ */
'use strict';

const MedicinesPage = (() => {
  let _filter = 'all';
  let _search = '';
  let _cat    = '';
  let _allMeds = [];

  function render() {
    return `
<div class="page active" id="page-medicines">
  <div class="pg-header">
    <div class="pg-title-group">
      <h1 class="pg-title">
        <div class="pg-title-icon" style="background:var(--amb-100);color:var(--amb-700)"><i class="fas fa-pills"></i></div>
        الأدوية والمخزون
      </h1>
      <p class="pg-subtitle">إدارة كامل المخزون الدوائي</p>
    </div>
    <div class="pg-actions">
      <button class="btn btn-ghost btn-sm" id="medExportBtn"><i class="fas fa-download"></i> تصدير</button>
      <button class="btn btn-amber" id="medAddBtn"><i class="fas fa-plus"></i> إضافة دواء</button>
    </div>
  </div>

  <div class="inventory-strip" id="medInsightBar">
    <div class="inventory-strip-loading">جارٍ قراءة حالة المخزون...</div>
  </div>

  <div class="tabs" id="medTabs">
    <button class="tab-btn active" data-f="all">الكل</button>
    <button class="tab-btn" data-f="low">مخزون منخفض</button>
    <button class="tab-btn" data-f="out">نفد المخزون</button>
    <button class="tab-btn" data-f="expiring">قريبة الانتهاء</button>
  </div>

  <div class="toolbar">
    <div class="tb-srch">
      <i class="fas fa-magnifying-glass"></i>
      <input type="search" id="medSearch" placeholder="بحث بالاسم أو الباركود أو الاسم العلمي..." />
    </div>
    <div class="cat-filters" id="catFilters"></div>
  </div>

  <div class="card">
    <div class="card-body p0">
      <div class="tbl-wrap">
        <table class="dtable">
          <thead><tr>
            <th>الكود</th><th>اسم الدواء</th><th>الاسم العلمي</th><th>الشركة</th>
            <th>النوع</th><th>السعر</th><th>المخزون</th><th>الصلاحية</th><th>الموقع</th><th>الإجراءات</th>
          </tr></thead>
          <tbody id="medTbody">
            <tr><td colspan="10"><div class="empty-state">
              <div class="es-icon an-spin"><i class="fas fa-circle-notch"></i></div>
              <h3 class="es-title">جارٍ التحميل...</h3>
            </div></td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="card-foot"><div class="pagination" id="medPager"></div></div>
  </div>

  <!-- Modal: إضافة دواء جديد -->
  <div id="addMedModal" class="g-modal">
    <div class="modal-head">
      <h3>إضافة دواء جديد</h3>
      <button class="modal-close" onclick="Modal.close()">×</button>
    </div>
    <div class="modal-body" id="addMedBody"></div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="Modal.close()">إلغاء</button>
      <button class="btn btn-primary" id="saveMedBtn">حفظ الدواء</button>
    </div>
  </div>
</div>`;
  }

  async function afterRender() {
    document.getElementById('medAddBtn')?.addEventListener('click', openAddModal);
    document.getElementById('medExportBtn')?.addEventListener('click', exportData);

    document.getElementById('medTabs')?.addEventListener('click', e => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      _filter = btn.dataset.f;
      document.querySelectorAll('#medTabs .tab-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      renderTable();
    });

    document.getElementById('medSearch')?.addEventListener('input', debounce(e => {
      _search = e.target.value.trim();
      renderTable();
    }, 300));

    document.getElementById('catFilters')?.addEventListener('click', e => {
      const chip = e.target.closest('.cat-chip');
      if (!chip) return;
      _cat = chip.dataset.cat;
      document.querySelectorAll('.cat-chip').forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');
      renderTable();
    });

    await _loadData();
  }

  async function _loadData() {
    try {
      const [meds, cats, low, exp] = await Promise.all([
        DB.getMedicines(),
        DB.getCategories(),
        DB.getLowStock(),
        DB.getExpiring(),
      ]);
      _allMeds = meds || [];

      const costValue = meds.reduce((sum,m) => sum + (m.cost * m.stock), 0);
      const retailValue = meds.reduce((sum,m) => sum + (m.price * m.stock), 0);
      document.getElementById('medInsightBar').innerHTML = `
        <div class="inv-metric primary"><span class="inv-metric-icon"><i class="fas fa-boxes-stacked"></i></span><div><small>إجمالي الأصناف</small><strong>${Fmt.num(meds.length)}</strong></div></div>
        <div class="inv-metric"><span class="inv-metric-icon"><i class="fas fa-coins"></i></span><div><small>قيمة المخزون بالتكلفة</small><strong>${Fmt.money(costValue)}</strong></div></div>
        <div class="inv-metric"><span class="inv-metric-icon"><i class="fas fa-chart-line"></i></span><div><small>القيمة البيعية المتوقعة</small><strong>${Fmt.money(retailValue)}</strong></div></div>
        <div class="inv-metric alerting"><span class="inv-metric-icon"><i class="fas fa-triangle-exclamation"></i></span><div><small>تحتاج إجراء</small><strong>${Fmt.num(low.length + exp.length)}</strong></div></div>`;

      const tabs = document.getElementById('medTabs');
      if (tabs) {
        const btns = tabs.querySelectorAll('.tab-btn');
        btns[0].innerHTML = `الكل <span class="badge bdg-slate">${meds.length}</span>`;
        btns[1].innerHTML = `مخزون منخفض <span class="badge bdg-warn">${low.length}</span>`;
        btns[2].innerHTML = `نفد المخزون <span class="badge bdg-err">${meds.filter(m=>m.stock===0).length}</span>`;
        btns[3].innerHTML = `قريبة الانتهاء <span class="badge bdg-warn">${exp.length}</span>`;
      }

      const catHTML = `<button class="cat-chip active" data-cat="">الكل</button>` +
        cats.map(c => `<button class="cat-chip" data-cat="${c}">${c}</button>`).join('');
      document.getElementById('catFilters').innerHTML = catHTML;
      renderTable();
    } catch(e) { Toast.err('خطأ', e.message); }
  }

  function renderTable() {
    const tbody = document.getElementById('medTbody');
    if (!tbody) return;

    let list = [..._allMeds];

    if (_search) {
      const q = _search.toLowerCase();
      list = list.filter(m =>
        m.name.toLowerCase().includes(q) ||
        (m.scientificName && m.scientificName.toLowerCase().includes(q)) ||
        (m.barcode && m.barcode.includes(q)) ||
        (m.manufacturer && m.manufacturer.toLowerCase().includes(q))
      );
    }

    if (_cat) list = list.filter(m => m.category === _cat);

    if (_filter === 'low') list = list.filter(m => m.stock <= m.minStock);
    if (_filter === 'out') list = list.filter(m => m.stock === 0);
    if (_filter === 'expiring') list = list.filter(m => Fmt.daysUntil(m.expiry) <= 90 && Fmt.daysUntil(m.expiry) > 0);

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state">
        <div class="es-icon"><i class="fas fa-pills"></i></div>
        <h3 class="es-title">لا توجد أدوية</h3>
      </div></td></tr>`;
      return;
    }

    const pg = Paginator(list, 15);
    const draw = () => {
      tbody.innerHTML = pg.slice().map(m=>`
        <tr>
          <td><strong>${m.barcode || '—'}</strong></td>
          <td>${m.name}</td>
          <td>${m.scientificName || '—'}</td>
          <td>${m.manufacturer || '—'}</td>
          <td>${m.unit || '—'}</td>
          <td>${Fmt.money(m.price)}</td>
          <td><strong style="color:var(--teal-600)">${m.stock}</strong></td>
          <td>${Fmt.expiryBadge(m.expiry)}</td>
          <td>${m.location || '—'}</td>
          <td>
            <div class="td-actions">
              <button class="btn btn-ghost btn-icon sm" data-action="edit" data-id="${m.id}" title="تعديل"><i class="fas fa-pen"></i></button>
              <button class="btn btn-ghost btn-icon sm" data-action="delete" data-id="${m.id}" title="حذف"><i class="fas fa-trash"></i></button>
            </div>
          </td>
        </tr>`).join('');

      tbody.querySelectorAll('[data-action]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const m = _allMeds.find(x=>x.id===btn.dataset.id);
          if (!m) return;
          if (btn.dataset.action==='edit')  editMedicine(m);
          if (btn.dataset.action==='delete') deleteMedicine(m.id);
        });
      });
      pg.render(document.getElementById('medPager'));
    };
    draw();
    document.getElementById('medPager')?.addEventListener('click', draw);
  }

  /* ══════════════════════════════════════════════════════
     ADD MEDICINE MODAL  —  النسخة المحسّنة
     • صورة المنتج (اختيارية)
     • باركود الشركة + باركود الصيدلية
     • زر "مسودة جديدة" يمسح الحقول
     • حفظ بدون إغلاق (مع إعادة تعيين للحقول المتغيرة)
     • auto-fill عند مسح باركود معروف
  ════════════════════════════════════════════════════════ */
  let _savedImage = null;  // base64 صورة المنتج الحالية

  function _generatePharmacyBarcode() {
    const base = `29${Date.now().toString().slice(-9)}${Math.floor(Math.random() * 10)}`;
    const weightedSum = [...base].reduce((sum, digit, index) =>
      sum + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
    return base + ((10 - (weightedSum % 10)) % 10);
  }

  function _ensurePharmacyBarcode(showNotice = false) {
    const input = document.getElementById('fMedPharmacyBarcode');
    let value = input?.value.trim();
    if (value) return value;

    value = _generatePharmacyBarcode();
    if (input) input.value = value;
    const preview = document.getElementById('previewPharmacyBarcode');
    if (preview) preview.innerHTML = BarcodeGenerator.generateSVG(value, { height: 32, includeText: true });
    if (showNotice) {
      Toast.info('تم إنشاء باركود داخلي', 'تم توليد باركود الصيدلية تلقائيًا لاستخدامه في الملصقات');
    }
    return value;
  }

  async function openAddModal() {
    _savedImage = null;
    const [categories, suppliers] = await Promise.all([DB.getCategories(), DB.getSuppliers()]);
    const defaultCategories = ['مضادات حيوية','مسكنات','أدوية السكري','القلب والأوعية','الجهاز الهضمي','فيتامينات'];
    const allCategories = [...new Set([...(categories || []), ...defaultCategories])];

    const catOptions  = allCategories.map(c=>`<option value="${c}">${c}</option>`).join('');
    const suppOptions = (suppliers||[]).map(s=>`<option value="${s.id}">${s.name}</option>`).join('');

    const body = `
<form class="medicine-form" id="medicineAddForm" autocomplete="off">
  <div class="mf-layout">

    <!-- ═══ RAIL (ملخص + صورة) ═══ -->
    <aside class="mf-rail">
      <div class="mf-rail-mark"><i class="fas fa-prescription-bottle-medical"></i></div>
      <h3>ملخص الصنف</h3>
      <p>راجع أهم البيانات قبل إضافتها إلى كتالوج الصيدلية.</p>

      <!-- صورة المنتج -->
      <div class="mf-img-upload" id="imgUploadArea" title="انقر لاختيار صورة">
        <div class="mf-img-placeholder" id="imgPlaceholder">
          <i class="fas fa-image"></i>
          <span>صورة المنتج<br><em>اختياري</em></span>
        </div>
        <img id="imgPreview" class="mf-img-preview" style="display:none" alt="صورة المنتج">
        <button type="button" class="mf-img-remove" id="imgRemoveBtn" style="display:none" title="حذف الصورة"><i class="fas fa-times"></i></button>
        <input type="file" id="fMedImageFile" accept="image/*" style="display:none">
      </div>

      <div class="mf-summary-product">
        <strong id="summaryMedName">صنف جديد</strong>
        <small id="summaryMedCategory">لم يتم اختيار التصنيف</small>
      </div>
      <dl class="mf-summary-list">
        <div><dt>سعر البيع</dt><dd id="summaryMedPrice">—</dd></div>
        <div><dt>الرصيد الافتتاحي</dt><dd id="summaryMedStock">0</dd></div>
        <div><dt>تاريخ الصلاحية</dt><dd id="summaryMedExpiry">—</dd></div>
        <div><dt>حالة الصنف</dt><dd><span class="mf-ready-dot"></span> جاهز للإضافة</dd></div>
      </dl>
      <div class="mf-rail-tip"><i class="fas fa-shield-halved"></i><span>يتم التحقق من تكرار الباركود تلقائيًا</span></div>
    </aside>

    <!-- ═══ WORKSPACE ═══ -->
    <div class="mf-workspace">
      <div class="mf-workspace-head">
        <div><h3>بيانات الصنف الدوائي</h3><p>الحقول المعلّمة بنجمة مطلوبة لإتمام الحفظ.</p></div>
        <button type="button" class="mf-draft-btn" id="clearDraftBtn" title="تفريغ كل الحقول">
          <i class="fas fa-file-circle-plus"></i> مسودة جديدة
        </button>
      </div>

      <!-- قسم 01: تعريف الدواء -->
      <section class="mf-section">
        <div class="mf-section-title">
          <span>01</span>
          <div><strong>تعريف الدواء</strong><small>الاسم والتصنيف والباركود</small></div>
        </div>
        <div class="mf-grid cols-2">
          <label class="mf-field">
            <span>الاسم التجاري <b>*</b></span>
            <input id="fMedName" class="form-control" placeholder="أموكسيسيلين 500 مجم">
          </label>
          <label class="mf-field">
            <span>الاسم العلمي</span>
            <input id="fMedScientific" class="form-control" placeholder="Amoxicillin">
          </label>
          <label class="mf-field">
            <span>الشركة المصنعة</span>
            <input id="fMedManufacturer" class="form-control" placeholder="اسم الشركة">
          </label>
          <label class="mf-field">
            <span>التصنيف <b>*</b></span>
            <select id="fMedCategory" class="form-control">
              <option value="">اختر التصنيف</option>${catOptions}
            </select>
          </label>
          <label class="mf-field">
            <span>المورد</span>
            <select id="fMedSupplier" class="form-control">
              <option value="">بدون مورد محدد</option>${suppOptions}
            </select>
          </label>
        </div>
      </section>

      <!-- قسم 02: الباركودات -->
      <section class="mf-section">
        <div class="mf-section-title">
          <span>02</span>
          <div><strong>الباركود</strong><small>باركود الشركة للتعرّف على العبوة، وباركود الصيدلية هو المخصص لطباعة الملصقات</small></div>
        </div>
        <div class="mf-grid cols-2">
          <label class="mf-field">
            <span>باركود الشركة المصنّعة <em class="mf-bc-tag mf-bc-tag-neutral">موجود على العبوة — لا يُطبع</em></span>
            <div class="mf-barcode-wrap">
              <div class="mf-barcode-scan-icon"><i class="fas fa-barcode"></i></div>
              <input id="fMedCompanyBarcode" class="form-control" inputmode="numeric"
                     placeholder="امسح باركود الشركة هنا">
            </div>
            <div class="mf-barcode-preview" id="previewCompanyBarcode"></div>
          </label>
          <label class="mf-field">
            <span>باركود الصيدلية <em class="mf-bc-tag">داخلي</em></span>
            <div class="mf-barcode-wrap">
              <div class="mf-barcode-scan-icon mf-bc-pharmacy"><i class="fas fa-qrcode"></i></div>
              <input id="fMedPharmacyBarcode" class="form-control" inputmode="numeric"
                     placeholder="امسح باركود الصيدلية هنا">
              <button type="button" class="mf-bc-gen mf-bc-gen-ph" id="genPharmacyBarcode" title="توليد باركود داخلي جديد للصيدلية">
                <i class="fas fa-wand-magic-sparkles"></i>
              </button>
            </div>
            <div class="mf-barcode-preview" id="previewPharmacyBarcode"></div>
          </label>
        </div>
        <!-- مؤشر الـ auto-fill -->
        <div class="mf-autofill-hint" id="autofillHint" style="display:none">
          <i class="fas fa-circle-check"></i>
          <span id="autofillHintText">تم تعبئة البيانات تلقائياً من سجل الدواء</span>
          <button type="button" id="clearAutofillBtn" class="mf-autofill-clear">مسح</button>
        </div>
      </section>

      <!-- قسم 03: التسعير والمخزون -->
      <section class="mf-section">
        <div class="mf-section-title">
          <span>03</span>
          <div><strong>التسعير والمخزون</strong><small>الأسعار والكميات المتاحة</small></div>
        </div>
        <div class="mf-grid cols-3">
          <label class="mf-field">
            <span>سعر الشراء <b>*</b></span>
            <div class="mf-money"><input id="fMedCostPrice" class="form-control" type="number" min="0" step="0.01" placeholder="0.00"><em>ر.س</em></div>
          </label>
          <label class="mf-field">
            <span>سعر البيع <b>*</b></span>
            <div class="mf-money"><input id="fMedSellPrice" class="form-control" type="number" min="0" step="0.01" placeholder="0.00"><em>ر.س</em></div>
          </label>
          <label class="mf-field">
            <span>وحدة الصرف <b>*</b></span>
            <select id="fMedUnitType" class="form-control">
              <option value="علبة">علبة</option>
              <option value="شريط">شريط</option>
              <option value="قرص">قرص / كبسولة</option>
              <option value="زجاجة">زجاجة</option>
              <option value="أمبول">أمبول</option>
              <option value="أنبوب">أنبوب</option>
            </select>
          </label>
          <label class="mf-field">
            <span>الكمية الحالية <b>*</b></span>
            <input id="fMedQuantityPerBox" class="form-control" type="number" min="0" value="0">
          </label>
          <label class="mf-field">
            <span>حد إعادة الطلب</span>
            <input id="fMedMinStock" class="form-control" type="number" min="0" value="10">
          </label>
          <div class="mf-margin">
            <small>هامش الربح المتوقع</small>
            <strong id="marginCalc">—</strong>
          </div>
        </div>
      </section>

      <!-- قسم 04: الصلاحية والتخزين -->
      <section class="mf-section">
        <div class="mf-section-title">
          <span>04</span>
          <div><strong>الصلاحية والتخزين</strong><small>بيانات مهمة للتنبيهات والجرد</small></div>
        </div>
        <div class="mf-grid cols-3">
          <label class="mf-field">
            <span>تاريخ انتهاء الصلاحية <b>*</b></span>
            <input id="fMedExpiry" class="form-control" type="date">
          </label>
          <label class="mf-field">
            <span>رقم الدفعة</span>
            <input id="fMedBatch" class="form-control" placeholder="LOT-2026-001">
          </label>
          <label class="mf-field">
            <span>موقع التخزين</span>
            <input id="fMedLocation" class="form-control" placeholder="مثال: A-01-02">
          </label>
          <label class="mf-field mf-wide">
            <span>ملاحظات</span>
            <textarea id="fMedNotes" class="form-control" rows="2" placeholder="تعليمات الحفظ أو أي ملاحظات إضافية"></textarea>
          </label>
        </div>
      </section>
    </div><!-- /mf-workspace -->
  </div><!-- /mf-layout -->
</form>`;

    Modal.open({
      title: '<span class="mf-modal-title"><i class="fas fa-plus"></i> إضافة صنف دوائي</span>',
      body,
      size: 'lg',
      foot: `
        <div class="mf-foot-note"><i class="fas fa-circle-info"></i> يمكنك تعديل البيانات لاحقًا</div>
        <div class="mf-foot-actions">
          <button type="button" class="btn btn-ghost" onclick="Modal.close()">إلغاء</button>
          <button type="button" class="btn btn-outline-teal" id="saveMedBtn">
            <i class="fas fa-check"></i> حفظ
          </button>
          <button type="button" class="btn btn-outline-teal" id="printBarcodeBtn" title="طباعة باركود الصيدلية بعدد الكمية المُدخَلة">
            <i class="fas fa-print"></i> طباعة
          </button>
          <button type="button" class="btn btn-primary" id="savePrintMedBtn">
            <i class="fas fa-floppy-disk"></i> حفظ وطباعة
          </button>
        </div>`,
    });

    /* ── ربط الأحداث ───────────────────────────────────── */
    _bindAddModalEvents();
    setTimeout(() => document.getElementById('fMedName')?.focus(), 80);
  }

  /* ربط أحداث نموذج الإضافة */
  function _bindAddModalEvents() {
    /* هامش الربح */
    const updateMargin = () => {
      const cost  = Number(document.getElementById('fMedCostPrice')?.value) || 0;
      const price = Number(document.getElementById('fMedSellPrice')?.value) || 0;
      const margin = price - cost;
      const pct = cost > 0 ? Math.round((margin / cost) * 100) : 0;
      const el = document.getElementById('marginCalc');
      if (el) {
        el.textContent = price > 0 ? `${margin.toFixed(2)} ر.س (${pct}%)` : '—';
        el.classList.toggle('negative', margin < 0);
      }
    };
    document.getElementById('fMedCostPrice')?.addEventListener('input', updateMargin);
    document.getElementById('fMedSellPrice')?.addEventListener('input', updateMargin);

    /* ملخص الـ sidebar */
    const syncSummary = () => {
      const name = document.getElementById('fMedName')?.value.trim() || 'صنف جديد';
      const cat  = document.getElementById('fMedCategory')?.value   || 'لم يتم اختيار التصنيف';
      const p    = Number(document.getElementById('fMedSellPrice')?.value);
      const stk  = document.getElementById('fMedQuantityPerBox')?.value || '0';
      const exp  = document.getElementById('fMedExpiry')?.value || '—';
      document.getElementById('summaryMedName').textContent     = name;
      document.getElementById('summaryMedCategory').textContent = cat;
      document.getElementById('summaryMedPrice').textContent    = p > 0 ? `${p.toFixed(2)} ر.س` : '—';
      document.getElementById('summaryMedStock').textContent    = stk;
      document.getElementById('summaryMedExpiry').textContent   = exp;
    };
    ['fMedName','fMedCategory','fMedSellPrice','fMedQuantityPerBox','fMedExpiry']
      .forEach(id => document.getElementById(id)?.addEventListener('input', syncSummary));

    /* ── صورة المنتج ─────────────────────────────────── */
    const imgArea    = document.getElementById('imgUploadArea');
    const imgInput   = document.getElementById('fMedImageFile');
    const imgPreview = document.getElementById('imgPreview');
    const imgHolder  = document.getElementById('imgPlaceholder');
    const imgRemove  = document.getElementById('imgRemoveBtn');

    imgArea?.addEventListener('click', e => {
      if (e.target.closest('#imgRemoveBtn')) return;
      imgInput?.click();
    });
    imgInput?.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        _savedImage = ev.target.result;
        imgPreview.src = _savedImage;
        imgPreview.style.display  = 'block';
        imgHolder.style.display   = 'none';
        imgRemove.style.display   = 'flex';
      };
      reader.readAsDataURL(file);
    });
    imgRemove?.addEventListener('click', () => {
      _savedImage = null;
      imgInput.value = '';
      imgPreview.style.display = 'none';
      imgHolder.style.display  = 'flex';
      imgRemove.style.display  = 'none';
    });

    /* ── توليد الباركود ──────────────────────────────── */
    const renderBCPreview = (inputId, previewId) => {
      const val = document.getElementById(inputId)?.value.trim();
      const el  = document.getElementById(previewId);
      if (!el) return;
      el.innerHTML = val ? BarcodeGenerator.generateSVG(val, { height: 32, includeText: true }) : '';
    };

    document.getElementById('genPharmacyBarcode')?.addEventListener('click', () => {
      document.getElementById('fMedPharmacyBarcode').value = _generatePharmacyBarcode();
      renderBCPreview('fMedPharmacyBarcode', 'previewPharmacyBarcode');
    });

    /* render preview لما يكتب في حقل الباركود */
    const setupBCInput = (inputId, previewId) => {
      const inp = document.getElementById(inputId);
      if (!inp) return;
      let _bcTimer;
      inp.addEventListener('input', () => {
        clearTimeout(_bcTimer);
        _bcTimer = setTimeout(() => renderBCPreview(inputId, previewId), 400);
      });
    };
    setupBCInput('fMedCompanyBarcode',  'previewCompanyBarcode');
    setupBCInput('fMedPharmacyBarcode', 'previewPharmacyBarcode');

    /* ── auto-fill من الباركود ───────────────────────── */
    const _autofill = async (barcode) => {
      if (!barcode || barcode.length < 4) return;
      try {
        const med = await DB.getMedicineByBarcode(barcode);
        if (!med) return;
        /* عبّي الحقول الثابتة فقط (الاسم، الشركة، التصنيف، الوحدة، المورد، الوصف)
           واترك: الكمية، سعر الشراء/البيع، الصلاحية، رقم الدفعة فاضية */
        _setVal('fMedName',       med.name);
        _setVal('fMedScientific', med.scientificName);
        _setVal('fMedManufacturer', med.manufacturer);
        _setVal('fMedNotes',      med.description);
        _setVal('fMedLocation',   med.location);
        const catSel = document.getElementById('fMedCategory');
        if (catSel) {
          [...catSel.options].forEach(o => o.selected = o.value === med.category);
          if (!catSel.value) {
            const opt = document.createElement('option');
            opt.value = opt.text = med.category;
            catSel.appendChild(opt);
            catSel.value = med.category;
          }
        }
        const supSel = document.getElementById('fMedSupplier');
        if (supSel && med.supplierId) supSel.value = med.supplierId;
        const unitSel = document.getElementById('fMedUnitType');
        if (unitSel && med.unit) unitSel.value = med.unit;
        /* صورة المنتج لو عنده */
        if (med.imageData) {
          _savedImage = med.imageData;
          const imgPreviewEl = document.getElementById('imgPreview');
          if (imgPreviewEl) {
            imgPreviewEl.src = med.imageData;
            imgPreviewEl.style.display = 'block';
            document.getElementById('imgPlaceholder').style.display = 'none';
            document.getElementById('imgRemoveBtn').style.display   = 'flex';
          }
        }
        /* عدّل الباركود الثاني */
        const companyInput   = document.getElementById('fMedCompanyBarcode');
        const pharmacyInput  = document.getElementById('fMedPharmacyBarcode');
        if (companyInput && !companyInput.value)   { companyInput.value  = med.companyBarcode  || ''; renderBCPreview('fMedCompanyBarcode','previewCompanyBarcode'); }
        if (pharmacyInput && !pharmacyInput.value) { pharmacyInput.value = med.pharmacyBarcode || ''; renderBCPreview('fMedPharmacyBarcode','previewPharmacyBarcode'); }
        /* مؤشر الـ auto-fill */
        const hint = document.getElementById('autofillHint');
        const hintTxt = document.getElementById('autofillHintText');
        if (hint && hintTxt) {
          hintTxt.textContent = `تم تعبئة بيانات "${med.name}" — أدخل الكمية والسعر والصلاحية فقط`;
          hint.style.display = 'flex';
        }
        syncSummary();
        Toast.ok('تم التعرّف', `الدواء "${med.name}" موجود — أدخل الكمية والسعر والصلاحية`);
      } catch(_) { /* لو الباركود مش موجود — ما نعمل شيء */ }
    };

    const _setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val) el.value = val;
    };

    /* scanner delay: لما يوقف الكتابة يبحث */
    let _scanTimer;
    const onBarcodeInput = (e) => {
      clearTimeout(_scanTimer);
      _scanTimer = setTimeout(() => _autofill(e.target.value.trim()), 600);
    };
    document.getElementById('fMedCompanyBarcode')?.addEventListener('input',  onBarcodeInput);
    document.getElementById('fMedPharmacyBarcode')?.addEventListener('input', onBarcodeInput);

    /* زر "مسح" الـ autofill hint */
    document.getElementById('clearAutofillBtn')?.addEventListener('click', () => {
      document.getElementById('autofillHint').style.display = 'none';
    });

    /* ── زر مسودة جديدة ─────────────────────────────── */
    document.getElementById('clearDraftBtn')?.addEventListener('click', () => {
      _clearAddForm();
      Toast.info('مسودة جديدة', 'تم تفريغ النموذج وأصبح جاهزًا لإدخال صنف جديد');
    });

    /* ── حفظ الصنف ───────────────────────────────────── */
    document.getElementById('saveMedBtn')?.addEventListener('click', () => saveMedicine(false));
    document.getElementById('savePrintMedBtn')?.addEventListener('click', () => saveMedicine(true));

    /* ── طباعة الباركود ──────────────────────────────── */
    document.getElementById('printBarcodeBtn')?.addEventListener('click', _printBarcodesFromForm);
  }

  /* مسح نموذج الإضافة دون إغلاق الـ Modal */
  function _clearAddForm() {
    const ids = ['fMedName','fMedScientific','fMedManufacturer','fMedBatch',
                 'fMedLocation','fMedNotes','fMedCompanyBarcode','fMedPharmacyBarcode',
                 'fMedCostPrice','fMedSellPrice','fMedQuantityPerBox'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const qty = document.getElementById('fMedQuantityPerBox'); if (qty) qty.value = '0';
    const min = document.getElementById('fMedMinStock'); if (min) min.value = '10';
    const cat = document.getElementById('fMedCategory'); if (cat) cat.value = '';
    const sup = document.getElementById('fMedSupplier'); if (sup) sup.value = '';
    const unit = document.getElementById('fMedUnitType'); if (unit) unit.value = 'علبة';
    const exp = document.getElementById('fMedExpiry'); if (exp) exp.value = '';
    ['previewCompanyBarcode','previewPharmacyBarcode'].forEach(id => {
      const el = document.getElementById(id); if (el) el.innerHTML = '';
    });
    /* إعادة تعيين الصورة */
    _savedImage = null;
    const imgInput = document.getElementById('fMedImageFile'); if (imgInput) imgInput.value = '';
    const imgPrev = document.getElementById('imgPreview');
    if (imgPrev) { imgPrev.style.display = 'none'; imgPrev.src = ''; }
    document.getElementById('imgPlaceholder')?.style && (document.getElementById('imgPlaceholder').style.display = 'flex');
    document.getElementById('imgRemoveBtn')?.style && (document.getElementById('imgRemoveBtn').style.display = 'none');
    /* إخفاء autofill hint */
    document.getElementById('autofillHint') && (document.getElementById('autofillHint').style.display = 'none');
    /* إعادة تعيين الملخص */
    ['summaryMedName','summaryMedCategory','summaryMedPrice','summaryMedStock','summaryMedExpiry'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = id === 'summaryMedName' ? 'صنف جديد'
                              : id === 'summaryMedCategory' ? 'لم يتم اختيار التصنيف'
                              : id === 'summaryMedStock' ? '0' : '—';
    });
    const mc = document.getElementById('marginCalc'); if (mc) mc.textContent = '—';
    document.getElementById('fMedName')?.focus();
  }

  /* طباعة الباركود من بيانات النموذج الحالي */
  function _printBarcodesFromForm() {
    const qty  = parseInt(document.getElementById('fMedQuantityPerBox')?.value) || 1;
    const name = document.getElementById('fMedName')?.value.trim() || 'دواء';
    const pharmacyBC = _ensurePharmacyBarcode(true);
    const price      = document.getElementById('fMedSellPrice')?.value || '';
    const expiry     = document.getElementById('fMedExpiry')?.value || '';
    const pharmacyName = document.querySelector('.brand-name')?.textContent?.trim() || 'الصيدلية';

    /* بناء ورقة الملصقات */
    const makeSticker = bcVal => {
      const svg = BarcodeGenerator.generateSVG(bcVal, { height: 28, includeText: true, color: '#0d5c5c' });
      return `
        <div class="barcode-sticker">
          <div class="bs-pharmacy">${pharmacyName}</div>
          <div class="bs-name">${name}</div>
          <div class="bs-bc-label">باركود الصيدلية</div>
          <div class="bs-barcode">${svg}</div>
          <div class="bs-info">
            <span>${price ? price + ' ر.س' : ''}</span>
            <span>${expiry || ''}</span>
          </div>
        </div>`;
    };

    let stickers = '';
    for (let i = 0; i < qty; i++) {
      stickers += makeSticker(pharmacyBC);
    }

    const sheet = document.createElement('div');
    sheet.className = 'barcode-sheet';
    sheet.innerHTML = stickers;
    document.body.appendChild(sheet);
    printElement(sheet);
    setTimeout(() => sheet.remove(), 500);
  }

  async function saveMedicine(printAfterSave = false) {
    if (printAfterSave) _ensurePharmacyBarcode(false);
    const data = {
      name:            document.getElementById('fMedName')?.value.trim(),
      scientificName:  document.getElementById('fMedScientific')?.value.trim(),
      manufacturer:    document.getElementById('fMedManufacturer')?.value.trim(),
      batchNumber:     document.getElementById('fMedBatch')?.value.trim(),
      category:        document.getElementById('fMedCategory')?.value,
      companyBarcode:  document.getElementById('fMedCompanyBarcode')?.value.trim(),
      pharmacyBarcode: document.getElementById('fMedPharmacyBarcode')?.value.trim(),
      barcode:         document.getElementById('fMedCompanyBarcode')?.value.trim(), // compat
      cost:            parseFloat(document.getElementById('fMedCostPrice')?.value),
      price:           parseFloat(document.getElementById('fMedSellPrice')?.value),
      unit:            document.getElementById('fMedUnitType')?.value,
      minStock:        parseInt(document.getElementById('fMedMinStock')?.value),
      stock:           parseInt(document.getElementById('fMedQuantityPerBox')?.value),
      expiry:          document.getElementById('fMedExpiry')?.value,
      location:        document.getElementById('fMedLocation')?.value?.trim(),
      supplierId:      document.getElementById('fMedSupplier')?.value,
      description:     document.getElementById('fMedNotes')?.value.trim(),
      imageData:       _savedImage || null,
    };

    if (!data.name || !data.category ||
        !Number.isFinite(data.cost) || !Number.isFinite(data.price) ||
        !data.unit || !Number.isInteger(data.stock) || data.stock < 0 ||
        !data.expiry) {
      Toast.err('بيانات غير مكتملة', 'راجع الحقول المطلوبة والأسعار والكمية وتاريخ الصلاحية');
      return;
    }

    const saveBtn = document.getElementById('saveMedBtn');
    const savePrintBtn = document.getElementById('savePrintMedBtn');
    [saveBtn, savePrintBtn].forEach(btn => { if (btn) btn.disabled = true; });
    const activeBtn = printAfterSave ? savePrintBtn : saveBtn;
    if (activeBtn) activeBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> جارٍ الحفظ...';
    try {
      await DB.addMedicine(data);
      if (printAfterSave) _printBarcodesFromForm();
      Toast.ok('تم الحفظ بنجاح', printAfterSave
        ? `تم حفظ "${data.name}" وإرسال باركود الصيدلية للطباعة`
        : `تم حفظ "${data.name}" — يمكنك طباعته الآن أو بدء مسودة جديدة`);
      await _loadData();
      /* إعادة تعيين الحقول المتغيرة بين دفعة ودفعة */
      _resetBetweenBatches();
    } catch(e) {
      Toast.err('خطأ', e.message);
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-check"></i> حفظ'; }
      if (savePrintBtn) { savePrintBtn.disabled = false; savePrintBtn.innerHTML = '<i class="fas fa-floppy-disk"></i> حفظ وطباعة'; }
    }
  }

  /* إعادة تعيين الحقول التي تتغير بين دفعة ودفعة فقط */
  function _resetBetweenBatches() {
    const resetIds = ['fMedQuantityPerBox','fMedCostPrice','fMedSellPrice','fMedExpiry','fMedBatch'];
    resetIds.forEach(id => { const el = document.getElementById(id); if (el) el.value = id === 'fMedQuantityPerBox' ? '0' : ''; });
    /* نحافظ على الباركودين بعد الحفظ حتى تطبع الملصق بنفس الكود المخزن.
       يتم مسحهما فقط عند الضغط على "مسودة جديدة". */
    /* إخفاء autofill hint */
    document.getElementById('autofillHint') && (document.getElementById('autofillHint').style.display = 'none');
    const mc = document.getElementById('marginCalc'); if (mc) mc.textContent = '—';
    document.getElementById('printBarcodeBtn')?.focus();
  }

  function editMedicine(med) {
    const body = `
      <div class="form-row cols-2">
        <div class="form-group"><label class="form-label">اسم الدواء *</label><input class="form-control" id="eMedName" value="${med.name || ''}"></div>
        <div class="form-group"><label class="form-label">التصنيف *</label><input class="form-control" id="eMedCategory" value="${med.category || ''}"></div>
      </div>
      <div class="form-row cols-2">
        <div class="form-group"><label class="form-label">الاسم العلمي</label><input class="form-control" id="eMedScientific" value="${med.scientificName || ''}"></div>
        <div class="form-group"><label class="form-label">الشركة المصنعة</label><input class="form-control" id="eMedManufacturer" value="${med.manufacturer || ''}"></div>
      </div>
      <div class="form-row cols-3">
        <div class="form-group"><label class="form-label">سعر البيع *</label><input class="form-control" id="eMedPrice" type="number" min="0" step="0.01" value="${med.price}"></div>
        <div class="form-group"><label class="form-label">التكلفة</label><input class="form-control" id="eMedCost" type="number" min="0" step="0.01" value="${med.cost}"></div>
        <div class="form-group"><label class="form-label">الوحدة</label><input class="form-control" id="eMedUnit" value="${med.unit || 'قرص'}"></div>
      </div>
      <div class="form-row cols-3">
        <div class="form-group"><label class="form-label">المخزون *</label><input class="form-control" id="eMedStock" type="number" min="0" value="${med.stock}"></div>
        <div class="form-group"><label class="form-label">حد التنبيه</label><input class="form-control" id="eMedMin" type="number" min="0" value="${med.minStock}"></div>
        <div class="form-group"><label class="form-label">الصلاحية *</label><input class="form-control" id="eMedExpiry" type="date" value="${med.expiry || ''}"></div>
      </div>
      <div class="form-row cols-3">
        <div class="form-group"><label class="form-label">الباركود</label><input class="form-control" id="eMedBarcode" value="${med.barcode || ''}"></div>
        <div class="form-group"><label class="form-label">رقم الدفعة</label><input class="form-control" id="eMedBatch" value="${med.batchNumber || ''}"></div>
        <div class="form-group"><label class="form-label">الموقع</label><input class="form-control" id="eMedLocation" value="${med.location || ''}"></div>
      </div>
      <div class="form-group"><label class="form-label">الوصف</label><input class="form-control" id="eMedDescription" value="${med.description || ''}"></div>`;

    Modal.open({
      title: `<i class="fas fa-pen"></i> تعديل ${med.name}`,
      body,
      size: 'lg',
      foot: `<button class="btn btn-ghost" onclick="Modal.close()">إلغاء</button><button class="btn btn-primary" id="updateMedBtn">حفظ التعديلات</button>`,
    });
    document.getElementById('updateMedBtn')?.addEventListener('click', async () => {
      const updated = {
        name: document.getElementById('eMedName').value.trim(),
        scientificName: document.getElementById('eMedScientific').value.trim(),
        manufacturer: document.getElementById('eMedManufacturer').value.trim(),
        batchNumber: document.getElementById('eMedBatch').value.trim(),
        category: document.getElementById('eMedCategory').value.trim(),
        price: Number(document.getElementById('eMedPrice').value),
        cost: Number(document.getElementById('eMedCost').value),
        unit: document.getElementById('eMedUnit').value.trim() || 'قرص',
        stock: Number(document.getElementById('eMedStock').value),
        minStock: Number(document.getElementById('eMedMin').value),
        expiry: document.getElementById('eMedExpiry').value,
        barcode: document.getElementById('eMedBarcode').value.trim(),
        location: document.getElementById('eMedLocation').value.trim(),
        description: document.getElementById('eMedDescription').value.trim(),
        supplierId: med.supplierId,
      };
      if (!updated.name || !updated.category || !updated.expiry || !Number.isFinite(updated.price) || updated.price < 0 || !Number.isInteger(updated.stock) || updated.stock < 0) {
        Toast.err('بيانات غير صحيحة', 'راجع الحقول المطلوبة والقيم الرقمية');
        return;
      }
      try {
        await DB.updateMedicine(med.id, updated);
        Toast.ok('تم', 'تم تحديث الدواء بنجاح');
        Modal.close();
        await _loadData();
      } catch (e) { Toast.err('خطأ', e.message); }
    });
  }

  function deleteMedicine(id) {
    Modal.confirm('حذف الدواء', 'هل أنت متأكد من حذف هذا الدواء؟', async () => {
      try {
        await DB.deleteMedicine(id);
        Toast.ok('تم', 'تم حذف الدواء');
        await _loadData();
      } catch(e) {
        Toast.err('خطأ', e.message);
      }
    });
  }

  function exportData() {
    exportCSV('الأدوية',
      ['الكود', 'اسم الدواء', 'الاسم العلمي', 'الشركة', 'التصنيف', 'السعر', 'المخزون', 'الصلاحية', 'الموقع'],
      _allMeds.map(m => [m.barcode, m.name, '', '', m.category, m.price, m.stock, m.expiry, m.location])
    );
  }

  return { render, afterRender, openAddModal };
})();
