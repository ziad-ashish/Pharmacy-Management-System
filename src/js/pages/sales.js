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
  let _prescription = null;
  let _rxDraft = null, _draftPatient = null, _restoring = true, _checkoutBusy = false;
  let _credit = {name:'', phone:'', paid:0};
  let _useLoyalty = false;
  let _pharmacyName = 'صيدلية الشفاء';
  let _pharmacyLogo = '';
  let _invoiceNote  = 'شكراً لزيارتكم • صحة وعافية';
  let TAX_RATE = 0;
  let _showTax     = false;
  let _showCashier = true;
  let _maxDiscountPct = 100;
  let _barcodeBuf  = '';
  let _barcodeTimer = null;
  let _barcodeListenerAttached = false;
  let _shortcutListenerAttached = false;
  let _keyboardIndex = -1;

  function render() {
    return `
<div class="page active" id="page-sales">
  <div class="pg-header">
    <div class="pg-title-group">
      <h1 class="pg-title">
        <div class="pg-title-icon" style="background:var(--teal-50);color:var(--teal-500)"><i class="fas fa-cash-register"></i></div>
        نقطة البيع
      </h1>
      <p class="pg-subtitle">إنشاء فاتورة مبيعات جديدة</p><small id="posDraftStatus" role="status">جارٍ استرجاع المسودة…</small>
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
        <button type="button" class="btn btn-ghost" id="posCameraBtn"><i class="fas fa-camera"></i> مسح بالكاميرا</button>
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
        <button class="btn btn-ghost btn-sm" id="addPrescriptionBtn" style="width:100%;margin-top:.5rem;justify-content:center">
          <i class="fas fa-file-prescription"></i> إضافة روشتة
        </button>
        <div id="prescriptionStatus" style="display:none;margin-top:.45rem;font-size:.72rem;color:var(--green-600)"></div>
        <label id="loyaltyOption" style="display:none;margin-top:.5rem;font-size:.75rem"><input type="checkbox" id="useLoyalty"> استخدام نقاط الولاء المتاحة</label>
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
        <div class="cart-row" id="crTaxRow" style="display:none"><span class="cr-label" id="crTaxLabel">الضريبة 0%</span><span class="cr-val" id="crTax">0.00 ر.س</span></div>
        <div class="cart-row grand">
          <span>الإجمالي</span><span class="cr-val" id="crTotal">0.00 ر.س</span>
        </div>
        <div style="margin-top:.5rem">
          <div style="font-size:.76rem;font-weight:600;color:var(--tx-3);margin-bottom:.4rem">طريقة الدفع</div>
          <div class="pay-btns">
            <button type="button" class="pay-btn sel" data-pm="نقدي" aria-pressed="true"><i class="fas fa-money-bill"></i> نقدي</button>
            <button type="button" class="pay-btn" data-pm="بطاقة" aria-pressed="false"><i class="fas fa-credit-card"></i> بطاقة</button>
            <button type="button" class="pay-btn" data-pm="تحويل" aria-pressed="false"><i class="fas fa-mobile-screen"></i> تحويل</button>
            <button type="button" class="pay-btn" data-pm="آجل" aria-pressed="false"><i class="fas fa-clock"></i> آجل</button>
          </div>
          <div class="credit-payment-panel" id="creditPaymentPanel" hidden>
            <div class="credit-panel-title"><i class="fas fa-address-card"></i><div><strong>بيانات البيع الآجل</strong><small>سيُنشأ سجل مديونية مرتبط بالعميل</small></div></div>
            <label class="credit-field"><span>اسم العميل <b>*</b></span><input id="creditCustomerName" class="form-control" maxlength="100" autocomplete="name" placeholder="اكتب اسم العميل" required></label>
            <label class="credit-field"><span>رقم التليفون <small>(اختياري)</small></span><input id="creditPhone" class="form-control" type="tel" maxlength="30" autocomplete="tel" inputmode="tel" placeholder="01xxxxxxxxx"></label>
            <div class="credit-money-grid">
              <label class="credit-field"><span>دفع الآن</span><input id="creditPaidAmount" class="form-control" type="number" min="0" step="0.01" value="0" inputmode="decimal"></label>
              <div class="credit-remaining"><span>المتبقي عليه</span><strong id="creditRemaining">0.00 ر.س</strong></div>
            </div>
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
    _restoring=true; _cart = []; _discount = 0; _payMethod = 'نقدي'; _prescription = null; _rxDraft=null; _draftPatient=null; _credit={name:'',phone:'',paid:0}; _useLoyalty=false; _checkoutBusy=false;
    // الصفر هو الوضع الآمن. لا توجد ضريبة إلا إذا قرأنا قيمة موجبة محفوظة فعلياً.
    TAX_RATE = 0;
    _showTax = false;

    try {
      const safe = promise => promise.catch(() => null);
      const [meds, cats, patients, taxSetting, nameSetting, noteSetting, logoSetting, showTaxSetting, showCashierSetting, defaultPaymentSetting, maxDiscountSetting] = await Promise.all([
        safe(DB.getTopSellingMeds(50)), safe(DB.getCategories()), safe(DB.getPatients()),
        safe(DB.getSetting('tax_rate')), safe(DB.getSetting('pharmacy_name')), safe(DB.getSetting('invoice_footer_note')),
        safe(DB.getSetting('pharmacy_logo')), safe(DB.getSetting('invoice_show_tax')), safe(DB.getSetting('invoice_show_cashier')),
        safe(DB.getSetting('sales_default_payment')), safe(DB.getSetting('sales_max_discount_percent')),
      ]);
      _allMeds = meds || [];

      if (nameSetting) _pharmacyName = nameSetting;
      if (noteSetting) _invoiceNote = noteSetting;
      if (logoSetting) _pharmacyLogo = logoSetting;
      _showTax     = showTaxSetting !== '0';
      _showCashier = showCashierSetting !== '0';
      _payMethod = defaultPaymentSetting === 'بطاقة' ? 'بطاقة' : 'نقدي';
      const parsedMaxDiscount = parseFloat(maxDiscountSetting);
      _maxDiscountPct = Number.isFinite(parsedMaxDiscount) ? Math.max(0, Math.min(100, parsedMaxDiscount)) : 100;
      _setPayment(_payMethod, false);
      const parsedTax = Number.parseFloat(taxSetting);
      const effectiveTax = Number.isFinite(parsedTax) && parsedTax > 0 ? parsedTax : 0;
      TAX_RATE = effectiveTax / 100;
      const taxLabel = document.getElementById('crTaxLabel');
      if (taxLabel) taxLabel.textContent = `الضريبة ${effectiveTax}%`;
      // FIX: don't show a tax row at all when there's no tax rate configured,
      // or when the "show tax" option is switched off in settings
      const taxRow = document.getElementById('crTaxRow');
      if (taxRow) taxRow.style.display = (_showTax && TAX_RATE > 0) ? '' : 'none';

      // category chips
      const cf = document.getElementById('posCatFilters');
      if (cf) cf.innerHTML = `<button class="cat-chip active" data-cat="">الكل</button>` +
        (cats || []).map(c=>`<button class="cat-chip" data-cat="${_esc(c)}">${_esc(c)}</button>`).join('');

      // patients list
      const ps = document.getElementById('posPatient');
      if (ps) ps.innerHTML = `<option value="">— عميل عادي —</option>` +
        (patients || []).map(p=>`<option value="${_esc(p.id)}">${_esc(p.name)}</option>`).join('');

      renderGrid();
    } catch(e) { Toast.err('خطأ', e.message); }

    // events
    document.getElementById('posSearch')?.addEventListener('input', debounce(async e=>{
      _search = e.target.value.trim();
      if (_search.length >= 2) {
        try { _allMeds = await DB.searchMedicines(_search); } catch (_) {}
      } else if (!_search) {
        try { _allMeds = await DB.getTopSellingMeds(50); } catch (_) {}
      }
      renderGrid();
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
        _setPayment(btn.dataset.pm);
      });
    });
    document.getElementById('creditCustomerName')?.addEventListener('input',e=>{_credit.name=e.target.value;_persistDraft();});
    document.getElementById('creditPhone')?.addEventListener('input',e=>{_credit.phone=e.target.value;_persistDraft();});
    document.getElementById('creditPaidAmount')?.addEventListener('input',e=>{_credit.paid=Math.max(0,Number(e.target.value)||0);_syncCreditPanel();_persistDraft();});

    document.getElementById('checkoutBtn')?.addEventListener('click', checkout);
    document.getElementById('posCameraBtn')?.addEventListener('click',()=>CameraWorkflows.scan({title:'مسح صنف للبيع',context:'sale',allowAuto:true,acceptLabel:'إضافة للسلة',onAccept:async med=>{
      const current=await DB.getMedicine(med.id);const index=_allMeds.findIndex(m=>m.id===med.id);
      if(index<0)_allMeds.push(current);else _allMeds[index]=current;
      if(!addToCart(med.id,med.scanQuantity))throw new Error('لم تتم الإضافة. راجع المخزون والكمية المطلوبة.');
    }}));
    document.getElementById('addPrescriptionBtn')?.addEventListener('click', _openPrescriptionModal);
    document.getElementById('posPatient')?.addEventListener('change', async e=>{
      _draftPatient=e.target.value||null; _useLoyalty=false; document.getElementById('useLoyalty').checked=false; _persistDraft();
      if(!e.target.value){document.getElementById('loyaltyOption').style.display='none';_syncCreditPanel();return;}
      try {
        const [debt,loyalty,patient]=await Promise.all([DB.getPatientDebt(e.target.value),DB.getLoyalty(e.target.value),DB.getPatient(e.target.value)]);
        if(debt.balance>0) Toast.warn('تنبيه مديونية',`على العميل دين سابق بقيمة ${Fmt.money(debt.balance)}`);
        const option=document.getElementById('loyaltyOption'); if(option){option.style.display=loyalty.points>0?'block':'none';option.title=`الرصيد ${Number(loyalty.points).toFixed(2)} نقطة`;}
        if(_payMethod==='آجل'&&patient){_credit.name=patient.name||'';_credit.phone=patient.phone||'';_syncCreditPanel();_persistDraft();}
      } catch(_){}
    });
    document.getElementById('useLoyalty')?.addEventListener('change',e=>{_useLoyalty=e.target.checked;_persistDraft();});

    _setupBarcodeScanner();
    _setupKeyboardShortcuts();
    try {
      const saved=await PosDraft.load();
      if(saved) {
        _cart=saved.cart||[];_discount=Number(saved.discount)||0;_payMethod=saved.paymentMethod||_payMethod;
        _prescription=saved.prescription||null;_rxDraft=saved.prescriptionDraft||null;_draftPatient=saved.patientId||null;_credit={name:saved.credit?.name||'',phone:saved.credit?.phone||'',paid:Number(saved.credit?.paid)||0};_useLoyalty=!!saved.useLoyalty;
        const needed=await Promise.all(_cart.map(item=>DB.getMedicine(item.medId)));
        for(const med of needed.filter(Boolean)){const index=_allMeds.findIndex(m=>m.id===med.id);if(index<0)_allMeds.push(med);else _allMeds[index]=med;}
        document.getElementById('discountInput').value=_discount;
        document.getElementById('posPatient').value=_draftPatient||'';
        _setPayment(_payMethod, false);
        document.getElementById('loyaltyOption').style.display=_draftPatient?'':'none';
        document.getElementById('useLoyalty').checked=_useLoyalty;
        if(_prescription){const label=document.getElementById('prescriptionStatus');label.style.display='block';label.textContent='روشتة مرتبطة بالمسودة';}
        if(_cart.length||_rxDraft)Toast.info('تم استرجاع المسودة','راجع الكميات والأسعار الحالية قبل إصدار الفاتورة');
      }
      updateCartUI();renderGrid();_restoring=false;
    }catch(error){document.getElementById('posDraftStatus').textContent='تعذر استرجاع المسودة: '+error.message;Toast.err('تعذر فتح المسودة',error.message);}
  }

  function _persistDraft() {
    if(_restoring)return;
    PosDraft.save({cart:_cart,discount:_discount,paymentMethod:_payMethod,patientId:_draftPatient,
      prescription:_prescription,prescriptionDraft:_rxDraft,useLoyalty:_useLoyalty,credit:_credit});
  }

  function _setPayment(method, persist=true) {
    _payMethod=method;
    document.querySelectorAll('.pay-btn').forEach(button=>{
      const selected=button.dataset.pm===method;
      button.classList.toggle('sel',selected);
      button.setAttribute('aria-pressed',selected?'true':'false');
    });
    _syncCreditPanel();
    if(method==='آجل'&&!_credit.name){
      const patientId=document.getElementById('posPatient')?.value;
      if(patientId)DB.getPatient(patientId).then(patient=>{
        if(_payMethod!=='آجل'||!patient)return;
        _credit.name=patient.name||'';_credit.phone=patient.phone||'';_syncCreditPanel();_persistDraft();
      }).catch(()=>{});
    }
    if(persist)_persistDraft();
  }

  function _syncCreditPanel(total=null) {
    const panel=document.getElementById('creditPaymentPanel');if(!panel)return;
    panel.hidden=_payMethod!=='آجل';
    if(panel.hidden)return;
    const name=document.getElementById('creditCustomerName'),phone=document.getElementById('creditPhone'),paid=document.getElementById('creditPaidAmount');
    if(name&&name.value!==_credit.name)name.value=_credit.name;
    if(phone&&phone.value!==_credit.phone)phone.value=_credit.phone;
    if(paid&&Number(paid.value)!==Number(_credit.paid))paid.value=Number(_credit.paid)||0;
    const due=total===null?_cart.reduce((sum,item)=>sum+item.total,0)-Math.min(_discount,_cart.reduce((sum,item)=>sum+item.total,0)):total;
    if(paid)paid.max=Math.max(0,due).toFixed(2);
    const remaining=document.getElementById('creditRemaining');
    if(remaining)remaining.textContent=Fmt.money(Math.max(0,due-(Number(_credit.paid)||0)));
  }

  function _setupKeyboardShortcuts(){
    if(_shortcutListenerAttached)return; _shortcutListenerAttached=true;
    document.addEventListener('keydown',e=>{
      if(!document.getElementById('page-sales'))return;
      if(e.key==='F1'){e.preventDefault();document.getElementById('posSearch')?.focus();}
      else if(e.key==='F2'){e.preventDefault();document.getElementById('checkoutBtn')?.click();}
      else if(e.key==='F3'){e.preventDefault();if(_cart.length)Modal.confirm('مسح السلة','هل تريد حذف كل الأصناف من السلة؟',()=>{_cart=[];updateCartUI();},'مسح السلة');}
      else if(e.key==='Escape'&&!Modal.isLocked()){Modal.close();}
      else if((e.key==='ArrowDown'||e.key==='ArrowUp')&&document.activeElement?.id==='posSearch'){
        e.preventDefault();const cards=[...document.querySelectorAll('#posGrid .med-card:not(.oos)')];if(!cards.length)return;
        _keyboardIndex=e.key==='ArrowDown'?Math.min(cards.length-1,_keyboardIndex+1):Math.max(0,_keyboardIndex-1);
        cards.forEach((c,i)=>c.style.outline=i===_keyboardIndex?'2px solid var(--teal-500)':'');cards[_keyboardIndex]?.scrollIntoView({block:'nearest'});
      } else if(e.key==='Enter'&&document.activeElement?.id==='posSearch'&&_keyboardIndex>=0){
        const card=document.querySelectorAll('#posGrid .med-card:not(.oos)')[_keyboardIndex];if(card){e.preventDefault();addToCart(card.dataset.mid);}
      }
    });
  }

  function _findByBarcode(code) {
    const c = String(code || '').trim();
    return _allMeds.find(m=>m.pharmacyBarcode===c) ||
      _allMeds.find(m=>m.companyBarcode===c) ||
      _allMeds.find(m=>m.barcode===c) ||
      _allMeds.find(m=>String(m.id).toLowerCase()===c.toLowerCase());
  }
  async function _resolveBarcode(code){
    try{
      const remote=await CameraWorkflows.resolve(String(code||'').trim());
      if(remote?.scanRequiresConfiguration){Toast.warn('وحدة الباركود غير محددة','افتح الأدوية ← ضبط وحدات الباركود وحدد عدد وحدات البيع في العبوة');return null;}
      if(remote){const index=_allMeds.findIndex(m=>m.id===remote.id);if(index<0)_allMeds.push(remote);else _allMeds[index]=remote;}
      return remote;
    }catch(_){return null;}
  }

  function _openPrescriptionModal() {
    const rx=_rxDraft||_prescription;
    Modal.open({
      title:'<i class="fas fa-file-prescription"></i> بيانات الروشتة', size:'sm',
      body:`<div class="form-grid cols-2">
        <div class="form-group"><label>اسم الطبيب *</label><input class="form-control" id="rxDoctor" value="${_esc(rx?.doctor_name||'')}"></div>
        <div class="form-group"><label>رقم الترخيص *</label><input class="form-control" id="rxLicense" value="${_esc(rx?.doctor_license||'')}"></div>
        <div class="form-group"><label>نوع الروشتة *</label><select class="form-control" id="rxType"><option>عادية</option><option>مخدرات</option><option>جدول</option><option>مزمنة</option></select></div>
        <div class="form-group"><label>تاريخ الروشتة</label><input class="form-control" id="rxDate" type="date" value="${rx?.date||new Date().toISOString().slice(0,10)}"></div>
      </div><div id="rxAlbum"></div>`,
      foot:'<button class="btn btn-ghost" onclick="Modal.close()">إلغاء</button><button class="btn btn-primary" id="saveRxBtn"><i class="fas fa-check"></i> ربط الروشتة</button>'
    });
    if (rx?.prescription_type) document.getElementById('rxType').value=rx.prescription_type;
    let rxImages=rx?.images||(rx?.image_data?[rx.image_data]:[]);
    const saveEditing=()=>{
      _prescription=null; // Editing requires reconfirmation; don't duplicate five image pages in the draft.
      const hint=document.getElementById('prescriptionStatus');hint.style.display='block';hint.textContent='تعديلات الروشتة محفوظة كمسودة؛ يلزم ربطها قبل إصدار الفاتورة';
      _rxDraft={doctor_name:document.getElementById('rxDoctor').value,doctor_license:document.getElementById('rxLicense').value,
        prescription_type:document.getElementById('rxType').value,date:document.getElementById('rxDate').value,images:rxImages};
      _persistDraft();
    };
    const album=CameraWorkflows.album(document.getElementById('rxAlbum'),rxImages,images=>{rxImages=images;saveEditing();});
    ['rxDoctor','rxLicense','rxType','rxDate'].forEach(id=>document.getElementById(id).addEventListener('input',saveEditing));
    document.getElementById('saveRxBtn')?.addEventListener('click', async()=>{
      const doctor_name=document.getElementById('rxDoctor').value.trim();
      const doctor_license=document.getElementById('rxLicense').value.trim();
      if(!doctor_name||!doctor_license){ Toast.warn('بيانات ناقصة','اسم الطبيب ورقم الترخيص مطلوبان'); return; }
      let images;try{images=album.images();}catch(e){Toast.warn(e.message);return;}
      _prescription={doctor_name,doctor_license,prescription_type:document.getElementById('rxType').value,date:document.getElementById('rxDate').value,images};
      _rxDraft=null;_persistDraft();
      const status=document.getElementById('prescriptionStatus');
      if(status){status.style.display='block';status.innerHTML=`<i class="fas fa-circle-check"></i> روشتة د. ${_esc(doctor_name)} مرتبطة بالفاتورة`;}
      document.getElementById('addPrescriptionBtn').innerHTML='<i class="fas fa-pen"></i> تعديل الروشتة';
      Modal.close(); Toast.ok('تم ربط الروشتة');
    });
  }

  /* ── BARCODE SCANNER (USB scanners act as a fast keyboard) ──
     Detects fast scanner keystrokes globally and handles barcode input
     inside search box seamlessly. */
  function _setupBarcodeScanner() {
    // 1. Handle Enter key inside posSearch (if scanner was focused in search)
    const searchInput = document.getElementById('posSearch');
    if (searchInput) {
      searchInput.addEventListener('keydown', async e => {
        if (e.key === 'Enter') {
          e.stopPropagation();
          const val = searchInput.value.trim();
          if (val) {
            const med = await _resolveBarcode(val);
            if (med) {
              e.preventDefault();
              addToCart(med.id,med.scanQuantity||1);
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
    document.addEventListener('keydown', async e => {
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
          const med = await _resolveBarcode(code);
          if (med) {
            e.preventDefault();
            addToCart(med.id,med.scanQuantity||1);
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

    _keyboardIndex=-1;
    grid.innerHTML = meds.map(m=>{
      const oos = (m.sellableStock??m.stock)===0;
      const low = m.stock>0 && m.stock<=m.minStock;
      return `
      <div class="med-card ${oos?'oos':''}" data-mid="${_esc(m.id)}">
        ${oos?'<span class="oos-badge">نفد</span>':''}
        ${low?'<span class="low-badge">منخفض</span>':''}
        <div class="med-card-ico">${m.imageUrl?`<img loading="lazy" src="${_esc(m.imageUrl)}" alt="" style="width:42px;height:42px;object-fit:contain">`:'<i class="fas fa-capsules"></i>'}</div>
        <div class="med-card-nm">${_esc(m.name)}</div>
        <div class="med-card-cat">${_esc(m.category)}</div>
        <div class="med-card-ft">
          <span class="med-card-price">${Fmt.money(m.price)}</span>
          <span class="med-card-stock">${Fmt.num(m.stock)} ${_esc(m.unit)}</span>
        </div>
      </div>`;
    }).join('');

    grid.querySelectorAll('.med-card:not(.oos)').forEach(card=>{
      card.addEventListener('click', ()=>addToCart(card.dataset.mid));
    });
  }

  function addToCart(medId, quantity=1) {
    if(_checkoutBusy||_restoring)return false;
    const med = _allMeds.find(m=>m.id===medId);
    if (!med || (med.sellableStock??med.stock)<quantity || !Number.isInteger(quantity) || quantity<1) return false;
    const existing = _cart.find(i=>i.medId===medId);
    if (existing) {
      if (existing.qty+quantity > (med.sellableStock??med.stock)) { Toast.warn('تنبيه',`لا يوجد مخزون كافٍ (${med.stock} فقط)`); return false; }
      existing.qty+=quantity; existing.total = existing.qty * existing.price;
    } else {
      _cart.push({ medId, name:med.name, qty:quantity, price:med.price, total:med.price*quantity, unit:med.saleUnit||med.unit, controlled:med.controlled });
    }
    updateCartUI();
    Toast.info('', `تمت إضافة ${med.name}`, 1200);
    return true;
  }

  function removeFromCart(medId) { _cart=_cart.filter(i=>i.medId!==medId); updateCartUI(); }

  function changeQty(medId, delta) {
    const item = _cart.find(i=>i.medId===medId);
    if (!item) return;
    const med = _allMeds.find(m=>m.id===medId);
    item.qty  = Math.max(1, Math.min(item.qty+delta, med?.sellableStock??med?.stock??0));
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
            <div class="ci-name">${_esc(item.name)}</div>
            <div class="ci-price">${Fmt.money(item.price)} / ${_esc(item.unit)}</div>
          </div>
          <div class="qty-ctrl">
            <button class="qty-btn" data-mid="${_esc(item.medId)}" data-d="-1">−</button>
            <span class="qty-num">${item.qty}</span>
            <button class="qty-btn" data-mid="${_esc(item.medId)}" data-d="1">+</button>
          </div>
          <div style="min-width:68px;text-align:left;font-weight:700;font-size:.84rem;color:var(--teal-600)">${Fmt.money(item.total)}</div>
          <button class="ci-del" data-mid="${_esc(item.medId)}"><i class="fas fa-trash"></i></button>
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
    _persistDraft();
    const el = id => document.getElementById(id);
    if (el('crSub'))   el('crSub').textContent   = Fmt.money(sub);
    if (el('crTax'))   el('crTax').textContent   = Fmt.money(tax);
    if (el('crTotal')) el('crTotal').textContent = Fmt.money(tot);
    _syncCreditPanel(tot);
  }

  async function checkout() {
    if (!_cart.length) { Toast.err('السلة فارغة','أضف أدوية للسلة أولاً'); return; }
    const controlled = _cart.filter(i=>i.controlled);
    if (controlled.length && !_prescription) {
      Toast.warn('الروشتة مطلوبة', `لا يمكن بيع ${controlled.map(i=>i.name).join('، ')} بدون روشتة`);
      _openPrescriptionModal(); return;
    }
    const sub   = _cart.reduce((a,i)=>a+i.total,0);
    const disc  = Math.min(_discount,sub);
    const tax   = (sub-disc)*TAX_RATE;
    const total = (sub-disc)+tax;
    const patId = document.getElementById('posPatient')?.value||null;
    if(_payMethod==='آجل'){
      _credit.name=document.getElementById('creditCustomerName')?.value.trim()||'';
      _credit.phone=document.getElementById('creditPhone')?.value.trim()||'';
      _credit.paid=Number(document.getElementById('creditPaidAmount')?.value||0);
      if(_credit.name.length<2){Toast.warn('اسم العميل مطلوب','اكتب اسم العميل لإصدار فاتورة آجلة');document.getElementById('creditCustomerName')?.focus();return;}
      if(!Number.isFinite(_credit.paid)||_credit.paid<0){Toast.warn('المبلغ غير صحيح','اكتب المبلغ الذي دفعه العميل أو اتركه صفرًا');document.getElementById('creditPaidAmount')?.focus();return;}
      if(_credit.paid>total){Toast.warn('المبلغ أكبر من الإجمالي','لا يمكن أن يكون المدفوع أكبر من قيمة الفاتورة');document.getElementById('creditPaidAmount')?.focus();return;}
    }
    if(_checkoutBusy)return;
    _checkoutBusy=true;
    const page=document.getElementById('page-sales');page.inert=true;
    // FIX: use the actually logged-in user's name instead of a hardcoded doctor name
    const cashierName = Auth?.getCurrent?.()?.fullName || '';

    try {
      _persistDraft();
      const draftMeta=await PosDraft.flush();
      const patient=patId ? await DB.getPatient(patId) : null;
      const current=await Promise.all(_cart.map(item=>DB.getMedicine(item.medId)));
      for(let i=0;i<_cart.length;i++){
        if(!current[i]||(current[i].sellableStock??current[i].stock)<_cart[i].qty)throw new Error('المخزون تغيّر؛ راجع كميات السلة');
        if(current[i].price!==_cart[i].price)throw new Error('سعر '+_cart[i].name+' تغيّر؛ احذف الصنف وأضفه بالسعر الحالي');
      }
      const result = await DB.addSale({
        ...draftMeta,
        patientId:   patId,
        patientName: patient?.name||'عميل عادي',
        items:       _cart.map(i=>({medId:i.medId,name:i.name,qty:i.qty,price:i.price,total:i.total})),
        subtotal:sub, discount:disc, tax, total,
        paymentMethod: _payMethod,
        creditCustomerName:_credit.name,
        creditPhone:_credit.phone,
        creditPaidAmount:_credit.paid,
        cashier: cashierName,
        prescription: _prescription,
        useLoyalty: _useLoyalty,
      });

      const saleData = {
        invoiceNum: result.invoiceNum, date:result.date, time:result.time,
        patientName: result.patientName||patient?.name||(_payMethod==='آجل'?_credit.name:'عميل عادي'),
        items: _cart.slice(),
        subtotal:sub, discount:disc, tax, total:result.total??total,
        patientAmount:result.patientAmount??result.total??total,
        insuranceAmount:result.insuranceAmount??0,
        loyaltyDiscount:result.loyaltyDiscount??0,
        paymentMethod: _payMethod,
        creditPaid:result.creditPaid??0,
        creditRemaining:result.creditRemaining??0,
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

      Toast.ok('تمت العملية', `تم إصدار ${result.invoiceNum} بقيمة ${Fmt.money(result.total??total)}`);
      PosDraft.completed();_restoring=true;
      _cart=[]; _discount=0; _prescription=null;_rxDraft=null;_draftPatient=null;_credit={name:'',phone:'',paid:0};_useLoyalty=false;
      document.getElementById('prescriptionStatus').style.display='none';
      document.getElementById('addPrescriptionBtn').innerHTML='<i class="fas fa-file-prescription"></i> إضافة روشتة';
      document.getElementById('useLoyalty').checked=false;document.getElementById('loyaltyOption').style.display='none';
      const di=document.getElementById('discountInput'); if(di) di.value='0';
      const pp=document.getElementById('posPatient');    if(pp) pp.value='';
      _syncCreditPanel(0);

      // refresh meds stock
      const meds = await DB.getTopSellingMeds(50); _allMeds = meds;
      updateCartUI(); renderGrid();
    } catch(e) { Toast.err('خطأ في الحفظ', e.message); }
    finally {_checkoutBusy=false;_restoring=false;page.inert=false;}
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
      <div class="rcp-row"><span>العميل</span><span>${_esc(s.patientName)}</span></div>
        ${(_showCashier && s.cashier) ? `<div class="rcp-row"><span>الصيدلي/الطبيب المسؤول</span><span>${_esc(s.cashier)}</span></div>` : ''}
      <div class="rcp-row"><span>طريقة الدفع</span><span>${_esc(s.paymentMethod)}</span></div>
      <div class="rcp-div"></div>
      ${s.items.map(i=>`
        <div class="rcp-row"><span>${_esc(i.name)}</span><span>${Fmt.money(i.total)}</span></div>
        <div class="rcp-row" style="font-size:.72rem;color:var(--tx-3)"><span>${i.qty} × ${Fmt.money(i.price)}</span></div>
      `).join('')}
      <div class="rcp-div"></div>
      <div class="rcp-row"><span>المجموع الفرعي</span><span>${Fmt.money(s.subtotal)}</span></div>
      ${s.discount>0?`<div class="rcp-row"><span>الخصم</span><span>− ${Fmt.money(s.discount)}</span></div>`:''}
      ${s.loyaltyDiscount>0?`<div class="rcp-row"><span>خصم نقاط الولاء</span><span>− ${Fmt.money(s.loyaltyDiscount)}</span></div>`:''}
      ${(_showTax && s.tax>0)?`<div class="rcp-row"><span>الضريبة ${Math.round(TAX_RATE*10000)/100}%</span><span>${Fmt.money(s.tax)}</span></div>`:''}
      ${s.insuranceAmount>0?`<div class="rcp-row"><span>تغطية التأمين</span><span>${Fmt.money(s.insuranceAmount)}</span></div><div class="rcp-row"><span>المطلوب من المريض</span><span>${Fmt.money(s.patientAmount)}</span></div>`:''}
      ${s.paymentMethod==='آجل'?`<div class="rcp-row"><span>المدفوع الآن</span><span>${Fmt.money(s.creditPaid)}</span></div><div class="rcp-row bold"><span>المتبقي على العميل</span><span>${Fmt.money(s.creditRemaining)}</span></div>`:''}
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
