/* ════════════════════════════════════════════════════════════
   PAGE: POINT OF SALE  (async)
════════════════════════════════════════════════════════════ */
'use strict';

const SalesPage = (() => {
  let _cart      = [];
  let _discount  = 0;
  let _payMethod = 'نقدي';
  let _catFilter = '';
  let _search    = '';
  let _allMeds   = [];
  let _pharmacyName = 'صيدلية الشفاء';
  let _pharmacyLogo = '';
  let _invoiceNote  = 'شكراً لزيارتكم • صحة وعافية';
  let TAX_RATE = 0.05;
  let _showTax     = true;
  let _showCashier = true;
  let _maxDiscountPct = 100;
  let _barcodeBuf  = '';
  let _barcodeTimer = null;
  let _barcodeListenerAttached = false;

  function render() {
    return `
<div class="page active" id="page-sales">
  <div class="pg-header">
    <div class="pg-title-group">
      <h1 class="pg-title">
        <div class="pg-title-icon" style="background:var(--teal-50);color:var(--teal-500)"><i class="fas fa-cash-register"></i></div>
        نقطة البيع
      </h1>
      <p class="pg-subtitle">إنشاء فاتورة مبيعات جديدة</p>
    </div>
    <div class="pg-actions">
      <button class="btn btn-ghost btn-sm" onclick="App.navigate('invoices')">
        <i class="fas fa-file-invoice-dollar"></i> سجل الفواتير
      </button>
    </div>
  </div>

  <div class="pos-layout">
    <!-- Products -->
    <div class="pos-prods">
      <div class="pos-prods-head">
        <div class="tb-srch" style="flex:1">
          <i class="fas fa-magnifying-glass"></i>
          <input type="search" id="posSearch" placeholder="بحث عن دواء..." />
        </div>
      </div>
      <div class="cat-filters" id="posCatFilters">
        <button class="cat-chip active" data-cat="">الكل</button>
      </div>
      <div class="pos-prods-body">
        <div class="med-grid" id="posGrid">
          <div class="empty-state" style="grid-column:1/-1">
            <div class="es-icon an-spin"><i class="fas fa-circle-notch"></i></div>
            <h3 class="es-title">جارٍ التحميل...</h3>
          </div>
        </div>
      </div>
    </div>

    <!-- Cart -->
    <div class="pos-cart">
      <div class="cart-head">
        <h3><i class="fas fa-shopping-cart"></i> سلة المشتريات</h3>
        <span class="cart-count" id="cartCount">0</span>
      </div>
      <div style="padding:.6rem .8rem;border-bottom:1px solid var(--border-2)">
        <select class="form-control" id="posPatient" style="font-size:.8rem">
          <option value="">— عميل عادي —</option>
        </select>
      </div>
      <div class="cart-body" id="cartBody">
        <div class="cart-empty">
          <i class="fas fa-cart-plus"></i>
          <p>اختر الأدوية من القائمة<br>لإضافتها للسلة</p>
        </div>
      </div>
      <div class="cart-foot">
        <div class="cart-row"><span class="cr-label">المجموع الفرعي</span><span class="cr-val" id="crSub">0.00 ر.س</span></div>
        <div class="cart-row">
          <span class="cr-label">الخصم (ر.س)</span>
          <input type="number" class="discount-input" id="discountInput" min="0" value="0" />
        </div>
        <div class="cart-row"><span class="cr-label" id="crTaxLabel">الضريبة 5%</span><span class="cr-val" id="crTax">0.00 ر.س</span></div>
        <div class="cart-row grand">
          <span>الإجمالي</span><span class="cr-val" id="crTotal">0.00 ر.س</span>
        </div>
        <div style="margin-top:.5rem">
          <div style="font-size:.76rem;font-weight:600;color:var(--tx-3);margin-bottom:.4rem">طريقة الدفع</div>
          <div class="pay-btns">
            <button class="pay-btn sel" data-pm="نقدي"><i class="fas fa-money-bill"></i> نقدي</button>
            <button class="pay-btn" data-pm="بطاقة"><i class="fas fa-credit-card"></i> بطاقة</button>
            <button class="pay-btn" data-pm="تحويل"><i class="fas fa-mobile-screen"></i> تحويل</button>
            <button class="pay-btn" data-pm="آجل"><i class="fas fa-clock"></i> آجل</button>
          </div>
        </div>
        <button class="checkout-btn" id="checkoutBtn" disabled>
          <i class="fas fa-receipt"></i> إصدار الفاتورة
        </button>
      </div>
    </div>
  </div>
</div>`;
  }

  async function afterRender() {
    _cart = []; _discount = 0; _payMethod = 'نقدي';

    try {
      const [meds, cats, patients, taxSetting, nameSetting, noteSetting, logoSetting, showTaxSetting, showCashierSetting, defaultPaymentSetting, maxDiscountSetting] = await Promise.all([
        DB.getMedicines(), DB.getCategories(), DB.getPatients(),
        DB.getSetting('tax_rate'), DB.getSetting('pharmacy_name'), DB.getSetting('invoice_footer_note'),
        DB.getSetting('pharmacy_logo'), DB.getSetting('invoice_show_tax'), DB.getSetting('invoice_show_cashier'),
        DB.getSetting('sales_default_payment'), DB.getSetting('sales_max_discount_percent'),
      ]);
      _allMeds = meds;

      if (nameSetting) _pharmacyName = nameSetting;
      if (noteSetting) _invoiceNote = noteSetting;
      if (logoSetting) _pharmacyLogo = logoSetting;
      _showTax     = showTaxSetting !== '0';
      _showCashier = showCashierSetting !== '0';
      _payMethod = defaultPaymentSetting === 'بطاقة' ? 'بطاقة' : 'نقدي';
      const parsedMaxDiscount = parseFloat(maxDiscountSetting);
      _maxDiscountPct = Number.isFinite(parsedMaxDiscount) ? Math.max(0, Math.min(100, parsedMaxDiscount)) : 100;
      document.querySelectorAll('.pay-btn').forEach(b=>b.classList.toggle('sel', b.dataset.pm===_payMethod));
      const parsedTax = parseFloat(taxSetting);
      if (!isNaN(parsedTax) && parsedTax >= 0) {
        TAX_RATE = parsedTax / 100;
        const taxLabel = document.getElementById('crTaxLabel');
        if (taxLabel) taxLabel.textContent = `الضريبة ${parsedTax}%`;
      }
      // FIX: don't show a tax row at all when there's no tax rate configured,
      // or when the "show tax" option is switched off in settings
      const taxRow = document.getElementById('crTaxLabel')?.closest('.cart-row');
      if (taxRow) taxRow.style.display = (_showTax && TAX_RATE > 0) ? '' : 'none';

      // category chips
      const cf = document.getElementById('posCatFilters');
      if (cf) cf.innerHTML = `<button class="cat-chip active" data-cat="">الكل</button>` +
        cats.map(c=>`<button class="cat-chip" data-cat="${c}">${c}</button>`).join('');

      // patients list
      const ps = document.getElementById('posPatient');
      if (ps) ps.innerHTML = `<option value="">— عميل عادي —</option>` +
        patients.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');

      renderGrid();
    } catch(e) { Toast.err('خطأ', e.message); }

    // events
    document.getElementById('posSearch')?.addEventListener('input', debounce(e=>{
      _search = e.target.value.trim(); renderGrid();
    }, 250));

    document.getElementById('posCatFilters')?.addEventListener('click', e=>{
      const chip = e.target.closest('.cat-chip');
      if (!chip) return;
      _catFilter = chip.dataset.cat;
      document.querySelectorAll('#posCatFilters .cat-chip').forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');
      renderGrid();
    });

    document.getElementById('discountInput')?.addEventListener('input', e => {
      // FIX [11]: cap discount to subtotal and give visual feedback
      const raw  = parseFloat(e.target.value) || 0;
      const sub  = _cart.reduce((a, i) => a + i.total, 0);
      const allowed = sub * (_maxDiscountPct / 100);
      if (raw > allowed && sub > 0) {
        e.target.value = allowed.toFixed(2);
        _discount      = allowed;
        Toast.warn('تنبيه', `الخصم الأقصى المسموح ${_maxDiscountPct}% (${Fmt.money(allowed)})`);
      } else {
        _discount = raw;
      }
      updateTotals();
    });

    document.querySelectorAll('.pay-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        _payMethod = btn.dataset.pm;
        document.querySelectorAll('.pay-btn').forEach(b=>b.classList.remove('sel'));
        btn.classList.add('sel');
      });
    });

    document.getElementById('checkoutBtn')?.addEventListener('click', checkout);

    _setupBarcodeScanner();
  }

  /* ── BARCODE SCANNER (USB scanners act as a fast keyboard) ──
     Detects fast scanner keystrokes globally and handles barcode input
     inside search box seamlessly. */
  function _setupBarcodeScanner() {
    // 1. Handle Enter key inside posSearch (if scanner was focused in search)
    const searchInput = document.getElementById('posSearch');
    if (searchInput) {
      searchInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          const val = searchInput.value.trim();
          if (val) {
            const med = _allMeds.find(m => m.barcode === val || m.id.toLowerCase() === val.toLowerCase());
            if (med) {
              e.preventDefault();
              addToCart(med.id);
              searchInput.value = '';
              _search = '';
              renderGrid();
              Toast.ok('تمت الإضافة بالباركود', `${med.name} — ${Fmt.money(med.price)}`);
              return;
            }
          }
        }
      });
    }

    // 2. Global fast scanner listener
    if (_barcodeListenerAttached) return;
    _barcodeListenerAttached = true;

    let _lastKeystrokeTime = 0;
    document.addEventListener('keydown', e => {
      if (!DeviceSettings.get().barcodeScan) return;
      if (!document.getElementById('page-sales')) return; // only while POS is open

      const now = Date.now();
      const diff = now - _lastKeystrokeTime;
      _lastKeystrokeTime = now;

      const activeTag = document.activeElement?.tagName;
      const isSearchBox = document.activeElement?.id === 'posSearch';

      if (e.key === 'Enter') {
        const code = _barcodeBuf.trim();
        _barcodeBuf = '';
        if (code.length >= 3) {
          const med = _allMeds.find(m => m.barcode === code || m.id.toLowerCase() === code.toLowerCase());
          if (med) {
            e.preventDefault();
            addToCart(med.id);
            if (isSearchBox && searchInput) {
              searchInput.value = '';
              _search = '';
              renderGrid();
            }
            Toast.ok('تم المسح بنجاح', `${med.name} — ${Fmt.money(med.price)}`);
            return;
          } else if (!isSearchBox) {
            Toast.warn('غير موجود', `لا يوجد صنف بالباركود: ${code}`);
          }
        }
        return;
      }

      // If typed inside other inputs (e.g. discount or patient notes), ignore unless it's fast scanner burst
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
        if (!isSearchBox && diff > 60) return; // normal human typing in an input
      }

      if (e.key.length === 1) {
        _barcodeBuf += e.key;
        clearTimeout(_barcodeTimer);
        // Reset buffer if delay between keystrokes > 350ms (human typing)
        _barcodeTimer = setTimeout(() => { _barcodeBuf = ''; }, 350);
      }
    });
  }

  function renderGrid() {
    const grid = document.getElementById('posGrid');
    if (!grid) return;
    let meds = [..._allMeds];
    // FEAT [1]: Arabic-aware POS search
    if (_search) {
      const q = normalizeArabicText(_search);
      meds = meds.filter(m =>
        normalizeArabicText(m.name).includes(q) ||
        normalizeArabicText(m.category).includes(q)
      );
    }
    if (_catFilter) meds = meds.filter(m=>m.category===_catFilter);

    if (!meds.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <div class="es-icon"><i class="fas fa-pills"></i></div>
        <h3 class="es-title">لا توجد نتائج</h3>
      </div>`;
      return;
    }

    grid.innerHTML = meds.map(m=>{
      const oos = m.stock===0;
      const low = m.stock>0 && m.stock<=m.minStock;
      return `
      <div class="med-card ${oos?'oos':''}" data-mid="${m.id}">
        ${oos?'<span class="oos-badge">نفد</span>':''}
        ${low?'<span class="low-badge">منخفض</span>':''}
        <div class="med-card-ico"><i class="fas fa-capsules"></i></div>
        <div class="med-card-nm">${m.name}</div>
        <div class="med-card-cat">${m.category}</div>
        <div class="med-card-ft">
          <span class="med-card-price">${Fmt.money(m.price)}</span>
          <span class="med-card-stock">${m.stock} ${m.unit}</span>
        </div>
      </div>`;
    }).join('');

    grid.querySelectorAll('.med-card:not(.oos)').forEach(card=>{
      card.addEventListener('click', ()=>addToCart(card.dataset.mid));
    });
  }

  function addToCart(medId) {
    const med = _allMeds.find(m=>m.id===medId);
    if (!med || med.stock===0) return;
    const existing = _cart.find(i=>i.medId===medId);
    if (existing) {
      if (existing.qty >= med.stock) { Toast.warn('تنبيه',`لا يوجد مخزون كافٍ (${med.stock} فقط)`); return; }
      existing.qty++; existing.total = existing.qty * existing.price;
    } else {
      _cart.push({ medId, name:med.name, qty:1, price:med.price, total:med.price, unit:med.unit });
    }
    updateCartUI();
    Toast.info('', `تمت إضافة ${med.name}`, 1200);
  }

  function removeFromCart(medId) { _cart=_cart.filter(i=>i.medId!==medId); updateCartUI(); }

  function changeQty(medId, delta) {
    const item = _cart.find(i=>i.medId===medId);
    if (!item) return;
    const med = _allMeds.find(m=>m.id===medId);
    item.qty  = Math.max(1, Math.min(item.qty+delta, med?.stock||999));
    item.total= item.qty * item.price;
    updateCartUI();
  }

  function updateCartUI() {
    const body  = document.getElementById('cartBody');
    const count = document.getElementById('cartCount');
    if (!body) return;

    if (!_cart.length) {
      body.innerHTML = `<div class="cart-empty"><i class="fas fa-cart-plus"></i><p>اختر الأدوية من القائمة<br>لإضافتها للسلة</p></div>`;
      document.getElementById('checkoutBtn')?.setAttribute('disabled','');
    } else {
      body.innerHTML = _cart.map(item=>`
        <div class="cart-item">
          <div>
            <div class="ci-name">${item.name}</div>
            <div class="ci-price">${Fmt.money(item.price)} / ${item.unit}</div>
          </div>
          <div class="qty-ctrl">
            <button class="qty-btn" data-mid="${item.medId}" data-d="-1">−</button>
            <span class="qty-num">${item.qty}</span>
            <button class="qty-btn" data-mid="${item.medId}" data-d="1">+</button>
          </div>
          <div style="min-width:68px;text-align:left;font-weight:700;font-size:.84rem;color:var(--teal-600)">${Fmt.money(item.total)}</div>
          <button class="ci-del" data-mid="${item.medId}"><i class="fas fa-trash"></i></button>
        </div>`).join('');

      body.querySelectorAll('.qty-btn').forEach(b=>b.addEventListener('click',()=>changeQty(b.dataset.mid, parseInt(b.dataset.d))));
      body.querySelectorAll('.ci-del').forEach(b=>b.addEventListener('click',()=>removeFromCart(b.dataset.mid)));
      document.getElementById('checkoutBtn')?.removeAttribute('disabled');
    }

    if (count) count.textContent = _cart.reduce((a,i)=>a+i.qty,0);
    updateTotals();
  }

  function updateTotals() {
    const sub  = _cart.reduce((a,i)=>a+i.total,0);
    const disc = Math.min(_discount, sub);
    const tax  = (sub-disc)*TAX_RATE;
    const tot  = (sub-disc)+tax;
    const el = id => document.getElementById(id);
    if (el('crSub'))   el('crSub').textContent   = Fmt.money(sub);
    if (el('crTax'))   el('crTax').textContent   = Fmt.money(tax);
    if (el('crTotal')) el('crTotal').textContent = Fmt.money(tot);
  }

  async function checkout() {
    if (!_cart.length) { Toast.err('السلة فارغة','أضف أدوية للسلة أولاً'); return; }
    const sub   = _cart.reduce((a,i)=>a+i.total,0);
    const disc  = Math.min(_discount,sub);
    const tax   = (sub-disc)*TAX_RATE;
    const total = (sub-disc)+tax;
    const patId = document.getElementById('posPatient')?.value||null;
    const patient= patId ? (await DB.getPatient(patId)) : null;
    // FIX: use the actually logged-in user's name instead of a hardcoded doctor name
    const cashierName = Auth?.getCurrent?.()?.fullName || '';

    try {
      const result = await DB.addSale({
        patientId:   patId,
        patientName: patient?.name||'عميل عادي',
        items:       _cart.map(i=>({medId:i.medId,name:i.name,qty:i.qty,price:i.price,total:i.total})),
        subtotal:sub, discount:disc, tax, total,
        paymentMethod: _payMethod,
        cashier: cashierName,
      });

      const saleData = {
        invoiceNum: result.invoiceNum, date:result.date, time:result.time,
        patientName: patient?.name||'عميل عادي',
        items: _cart.slice(),
        subtotal:sub, discount:disc, tax, total,
        paymentMethod: _payMethod,
        cashier: cashierName,
      };

      Modal.open({
        title: `<i class="fas fa-receipt"></i> الفاتورة ${result.invoiceNum}`,
        size: 'sm',
        body: `<div id="receiptPrint">${_buildReceipt(saleData)}</div>`,
        foot: `<button class="btn btn-primary" onclick="printElement('receiptPrint')"><i class="fas fa-print"></i> طباعة</button>
               <button class="btn btn-ghost" onclick="Modal.close()">إغلاق</button>`,
      });
      if (DeviceSettings.get().autoPrint) {
        setTimeout(() => printElement('receiptPrint'), 300);
      }

      Toast.ok('تمت العملية', `تم إصدار ${result.invoiceNum} بقيمة ${Fmt.money(total)}`);
      _cart=[]; _discount=0;
      const di=document.getElementById('discountInput'); if(di) di.value='0';
      const pp=document.getElementById('posPatient');    if(pp) pp.value='';

      // refresh meds stock
      const meds = await DB.getMedicines(); _allMeds = meds;
      updateCartUI(); renderGrid();
    } catch(e) { Toast.err('خطأ في الحفظ', e.message); }
  }

  function _buildReceipt(s) {
    return `
    <div class="receipt">
      <div class="rcp-head">
        ${_pharmacyLogo ? `<img src="${_pharmacyLogo}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;margin-bottom:.4rem" />` : ''}
        <div class="rcp-title">${_pharmacyName}</div>
        <div class="rcp-sub">نظام إدارة الصيدلية المتكامل</div>
        <div class="rcp-sub" style="margin-top:.3rem">${s.date} — ${s.time}</div>
      </div>
      <div class="rcp-div"></div>
      <div class="rcp-row"><span>رقم الفاتورة</span><span>${s.invoiceNum}</span></div>
      <div class="rcp-row"><span>العميل</span><span>${s.patientName}</span></div>
      ${(_showCashier && s.cashier) ? `<div class="rcp-row"><span>الصيدلي/الطبيب المسؤول</span><span>${s.cashier}</span></div>` : ''}
      <div class="rcp-row"><span>طريقة الدفع</span><span>${s.paymentMethod}</span></div>
      <div class="rcp-div"></div>
      ${s.items.map(i=>`
        <div class="rcp-row"><span>${i.name}</span><span>${Fmt.money(i.total)}</span></div>
        <div class="rcp-row" style="font-size:.72rem;color:var(--tx-3)"><span>${i.qty} × ${Fmt.money(i.price)}</span></div>
      `).join('')}
      <div class="rcp-div"></div>
      <div class="rcp-row"><span>المجموع الفرعي</span><span>${Fmt.money(s.subtotal)}</span></div>
      ${s.discount>0?`<div class="rcp-row"><span>الخصم</span><span>− ${Fmt.money(s.discount)}</span></div>`:''}
      ${(_showTax && s.tax>0)?`<div class="rcp-row"><span>الضريبة ${Math.round(TAX_RATE*10000)/100}%</span><span>${Fmt.money(s.tax)}</span></div>`:''}
      <div class="rcp-div"></div>
      <div class="rcp-row total"><span>الإجمالي</span><span>${Fmt.money(s.total)}</span></div>
      <div class="rcp-barcode">
        ${BarcodeGenerator.generateSVG(s.invoiceNum, { height: 28, includeText: true })}
      </div>
      <div class="rcp-foot-note">${_invoiceNote}</div>
    </div>`;
  }

  return { render, afterRender };
})();
