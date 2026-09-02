/* ════════════════════════════════════════════════════════════
   DATA.JS  —  Flask REST API bridge
   بدل PyWebView، كل طلب بيروح لـ Flask على /api/<method>
   fallback: localStorage لو السيرفر مش شغال (dev mode)
════════════════════════════════════════════════════════════ */
'use strict';

/* ── هل السيرفر شغال؟ (Flask) ──────────────────────────── */
const _IS_FLASK = (() => {
  // لو الصفحة اتفتحت من سيرفر (http/https) مش من ملف محلي
  return location.protocol === 'http:' || location.protocol === 'https:';
})();

/* ── Flask fetch helper ─────────────────────────────────── */
async function _api(method, options = {}) {
  const { params = null, body = null } = options;

  let url = `/api/${method}`;
  if (params) {
    const q = new URLSearchParams(params);
    url += '?' + q.toString();
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  const fetchOpts = {
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
  };

  if (body !== null) {
    fetchOpts.method = 'POST';
    fetchOpts.body   = JSON.stringify(body);
  } else {
    fetchOpts.method = 'GET';
  }

  let res, parsed;
  try {
    res = await fetch(url, fetchOpts);
    parsed = await res.json();
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('انتهت مهلة الاتصال بالخادم. حاول مرة أخرى.');
    throw new Error('تعذر الاتصال بخادم الصيدلية. تأكد أن البرنامج يعمل ثم حاول مرة أخرى.');
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) throw new Error(parsed?.error || `خطأ في الخادم (${res.status})`);
  if (!parsed.ok) throw new Error(parsed.error || 'تعذر إتمام العملية');
  return parsed.data;
}


/* ════════════════════════════════════════════════════════
   FALLBACK — localStorage (لو فتحت الـ HTML مباشرة)
════════════════════════════════════════════════════════ */
const _LS = (() => {
  const get = k  => JSON.parse(localStorage.getItem(k) || '[]');
  const set = (k,v) => localStorage.setItem(k, JSON.stringify(v));

  function seed() {
    // Direct-file preview uses browser storage instead of SQLite. Older preview
    // builds could leave stale demo passwords behind, so migrate only the demo
    // accounts once without touching medicines, sales or other saved data.
    if (localStorage.getItem('ph_v2')) {
      if (!localStorage.getItem('ph_demo_auth_v1')) {
        const today = new Date().toISOString().split('T')[0];
        set('ph_users', [
          { id:'U001', username:'admin',      password:'admin123', full_name:'د. أحمد محمد',   role:'مدير النظام',    phone:'0500000001', email:'admin@shifa.sa',  created_at:today, last_login:null },
          { id:'U002', username:'pharmacist', password:'123456',   full_name:'خالد السعيد',    role:'صيدلاني مسؤول', phone:'0500000002', email:'khaled@shifa.sa', created_at:today, last_login:null },
          { id:'U003', username:'assistant',  password:'123456',   full_name:'نورة القحطاني', role:'مساعد صيدلي',   phone:'0500000003', email:'noura@shifa.sa',  created_at:today, last_login:null },
        ]);
        localStorage.setItem('ph_demo_auth_v1', '1');
      }
      return;
    }
    const today     = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now()-86400000).toISOString().split('T')[0];
    const twoDays   = new Date(Date.now()-172800000).toISOString().split('T')[0];

    set('ph_users', [
      { id:'U001', username:'admin',      password:'admin123', full_name:'د. أحمد محمد',   role:'مدير النظام',    phone:'0500000001', email:'admin@shifa.sa',   created_at:today, last_login:null },
      { id:'U002', username:'pharmacist', password:'123456',   full_name:'خالد السعيد',    role:'صيدلاني مسؤول', phone:'0500000002', email:'khaled@shifa.sa',  created_at:today, last_login:null },
      { id:'U003', username:'assistant',  password:'123456',   full_name:'نورة القحطاني', role:'مساعد صيدلي',   phone:'0500000003', email:'noura@shifa.sa',   created_at:today, last_login:null },
    ]);
    set('ph_medicines', [
      { id:'M001', name:'أموكسيسيلين 500mg', category:'مضادات حيوية', price:45,  cost:28, stock:120, min_stock:20, unit:'كبسولة', supplier_id:'S001', expiry:'2026-08-01', barcode:'6001000000001', location:'A-1-2', description:'مضاد حيوي واسع الطيف', is_active:1 },
      { id:'M002', name:'باراسيتامول 500mg', category:'مسكنات',        price:12,  cost:6,  stock:350, min_stock:50, unit:'قرص',    supplier_id:'S002', expiry:'2027-03-15', barcode:'6001000000002', location:'A-2-1', description:'مسكن ألم وخافض حرارة', is_active:1 },
      { id:'M003', name:'أوميبرازول 20mg',   category:'الجهاز الهضمي',price:38,  cost:22, stock:85,  min_stock:15, unit:'كبسولة', supplier_id:'S001', expiry:'2026-12-30', barcode:'6001000000003', location:'B-1-3', description:'مثبط مضخة البروتون', is_active:1 },
      { id:'M004', name:'ميتفورمين 500mg',   category:'السكري',        price:55,  cost:34, stock:200, min_stock:30, unit:'قرص',    supplier_id:'S003', expiry:'2026-09-20', barcode:'6001000000004', location:'C-2-1', description:'علاج السكري من النوع الثاني', is_active:1 },
      { id:'M005', name:'أتورفاستاتين 10mg', category:'القلب والأوعية',price:78,  cost:48, stock:95,  min_stock:20, unit:'قرص',    supplier_id:'S002', expiry:'2027-01-10', barcode:'6001000000005', location:'C-1-4', description:'لعلاج ارتفاع الكولسترول', is_active:1 },
      { id:'M006', name:'أملوديبين 5mg',     category:'القلب والأوعية',price:62,  cost:38, stock:8,   min_stock:20, unit:'قرص',    supplier_id:'S003', expiry:'2026-11-05', barcode:'6001000000006', location:'C-1-5', description:'لعلاج ارتفاع ضغط الدم', is_active:1 },
      { id:'M007', name:'فيتامين سي 1000mg', category:'فيتامينات',     price:28,  cost:15, stock:280, min_stock:40, unit:'قرص',    supplier_id:'S004', expiry:'2027-06-30', barcode:'6001000000007', location:'D-1-1', description:'فيتامين سي فوار', is_active:1 },
      { id:'M008', name:'أنتاسيد جيل',       category:'الجهاز الهضمي',price:32,  cost:18, stock:60,  min_stock:15, unit:'علبة',   supplier_id:'S002', expiry:'2026-10-15', barcode:'6001000000008', location:'B-2-2', description:'لعلاج حموضة المعدة', is_active:1 },
      { id:'M009', name:'لوراتادين 10mg',    category:'الحساسية',      price:35,  cost:20, stock:5,   min_stock:15, unit:'قرص',    supplier_id:'S001', expiry:'2025-12-01', barcode:'6001000000009', location:'A-3-2', description:'مضاد هيستامين', is_active:1 },
      { id:'M010', name:'إيبوبروفين 400mg',  category:'مسكنات',        price:22,  cost:12, stock:180, min_stock:30, unit:'قرص',    supplier_id:'S002', expiry:'2027-04-20', barcode:'6001000000010', location:'A-2-3', description:'مسكن ومضاد التهاب', is_active:1 },
    ]);
    set('ph_patients', [
      { id:'P001', name:'محمد أحمد علي',       phone:'0501234567', age:45, gender:'ذكر',  blood_type:'A+',  allergies:'بنسلين',  chronic_diseases:'ضغط دم - سكري', address:'الرياض', created_at:'2024-01-15', notes:'مريض منتظم', is_active:1 },
      { id:'P002', name:'فاطمة حسن محمود',     phone:'0551234567', age:32, gender:'أنثى', blood_type:'O+',  allergies:'لا يوجد', chronic_diseases:'حساسية موسمية', address:'جدة',    created_at:'2024-02-20', notes:'', is_active:1 },
      { id:'P003', name:'خالد عبدالله السعيد', phone:'0561234567', age:58, gender:'ذكر',  blood_type:'B+',  allergies:'سلفا',    chronic_diseases:'السكري - القلب', address:'الدمام', created_at:'2024-03-10', notes:'يأخذ ميتفورمين يومياً', is_active:1 },
    ]);
    set('ph_suppliers', [
      { id:'S001', name:'شركة الدواء الحديث',    contact:'عبدالرحمن الزهراني', phone:'0112345678', email:'info@moderndrug.sa',  address:'الرياض', tax_num:'300112345600003', payment_terms:'30 يوم', status:'نشط',    rating:5, total_orders:45, last_order:'2026-07-15', is_active:1 },
      { id:'S002', name:'مستودع الشفاء الطبي',   contact:'سامي العتيبي',       phone:'0223456789', email:'info@shifa-med.sa',   address:'جدة',    tax_num:'300223456700004', payment_terms:'15 يوم', status:'نشط',    rating:4, total_orders:38, last_order:'2026-07-20', is_active:1 },
      { id:'S003', name:'الوكيل الطبي الموحد',   contact:'هاني الدوسري',       phone:'0334567890', email:'info@unified-med.sa', address:'الدمام', tax_num:'300334567800005', payment_terms:'45 يوم', status:'نشط',    rating:4, total_orders:22, last_order:'2026-06-30', is_active:1 },
      { id:'S004', name:'توريدات الصحة والعافية',contact:'ليلى الشمري',        phone:'0445678901', email:'info@health-supply.sa',address:'الرياض',tax_num:'300445678900006', payment_terms:'30 يوم', status:'غير نشط',rating:3, total_orders:15, last_order:'2026-05-10', is_active:1 },
    ]);
    set('ph_sales', []);
    localStorage.setItem('ph_v2','1');
    localStorage.setItem('ph_demo_auth_v1','1');
  }

  /* ── normalisers ── */
  function normMed(m) {
    return { id:m.id, name:m.name, scientificName:m.scientific_name??m.scientificName??'', manufacturer:m.manufacturer??'', batchNumber:m.batch_number??m.batchNumber??'', category:m.category, price:+m.price, cost:+m.cost,
      stock:+m.stock, minStock:+(m.min_stock??m.minStock??10), unit:m.unit??'قرص',
      supplierId:m.supplier_id??m.supplierId??'', expiry:m.expiry??'',
      barcode:m.barcode??'', companyBarcode:m.company_barcode??m.companyBarcode??'',
      pharmacyBarcode:m.pharmacy_barcode??m.pharmacyBarcode??'',
      controlled:Boolean(m.controlled), purchaseUnit:m.purchase_unit??m.purchaseUnit??m.unit??'علبة',
      saleUnit:m.sale_unit??m.saleUnit??m.unit??'قرص', conversionFactor:+(m.conversion_factor??m.conversionFactor??1),
      location:m.location??'', description:m.description??'', imageData:m.image_data??m.imageData??'' };
  }
  function normPat(p) {
    return { id:p.id, name:p.name, phone:p.phone, age:+p.age, gender:p.gender??'',
      bloodType:p.blood_type??p.bloodType??'', allergies:p.allergies??'',
      chronicDiseases:p.chronic_diseases??p.chronicDiseases??'',
      address:p.address??'', notes:p.notes??'', createdAt:p.created_at??p.createdAt??'',
      insuranceCompany:p.insurance_company??p.insuranceCompany??'', policyNumber:p.policy_number??p.policyNumber??'', coveragePct:+(p.coverage_pct??p.coveragePct??0) };
  }
  function normSup(s) {
    return { id:s.id, name:s.name, contact:s.contact??'', phone:s.phone??'',
      email:s.email??'', address:s.address??'', taxNum:s.tax_num??s.taxNum??'',
      paymentTerms:s.payment_terms??s.paymentTerms??'30 يوم', status:s.status??'نشط',
      rating:+(s.rating??3), totalOrders:+(s.total_orders??s.totalOrders??0),
      lastOrder:s.last_order??s.lastOrder??'—' };
  }
  function normSale(s) {
    return { id:s.id, invoiceNum:s.invoice_num??s.invoiceNum??'',
      patientId:s.patient_id??s.patientId??null,
      patientName:s.patient_name??s.patientName??'',
      items:(s.items??[]).map(i=>({medId:i.med_id??i.medId,name:i.name,qty:+i.qty,price:+i.price,total:+i.total})),
      subtotal:+(s.subtotal??0), discount:+(s.discount??0), tax:+(s.tax??0), total:+(s.total??0),
      paymentMethod:s.payment_method??s.paymentMethod??'نقدي', cashier:s.cashier??'',
      date:s.sale_date??s.date??'', time:s.sale_time??s.time??'', status:s.status??'مكتمل' };
  }

  seed();
  const lsGet = k  => JSON.parse(localStorage.getItem(k)||'[]');
  const lsSet = (k,v) => localStorage.setItem(k,JSON.stringify(v));

  return {
    getMedicines:  () => Promise.resolve(lsGet('ph_medicines').filter(m=>m.is_active!==0).map(normMed)),
    getMedicine:   id => Promise.resolve((lsGet('ph_medicines').map(normMed).find(m=>m.id===id))||null),
    getMedicineByBarcode: bc => {
      const all = lsGet('ph_medicines').filter(m=>m.is_active!==0).map(normMed);
      return Promise.resolve(all.find(m=>m.pharmacyBarcode===bc)||all.find(m=>m.companyBarcode===bc)||all.find(m=>m.barcode===bc)||null);
    },
    addMedicine:   d  => { const l=lsGet('ph_medicines'); const m={...d,id:'M'+(l.length+1).toString().padStart(3,'0'),is_active:1}; l.push(m); lsSet('ph_medicines',l); return Promise.resolve(m.id); },
    updateMedicine:(id,d)=>{ lsSet('ph_medicines',lsGet('ph_medicines').map(m=>m.id===id?{...m,...d}:m)); return Promise.resolve(); },
    deleteMedicine: id => { lsSet('ph_medicines',lsGet('ph_medicines').map(m=>m.id===id?{...m,is_active:0}:m)); return Promise.resolve({archived:false}); },
    getLowStock:   () => Promise.resolve(lsGet('ph_medicines').filter(m=>m.is_active!==0).map(normMed).filter(m=>m.stock>0&&m.stock<=m.minStock)),
    getExpiring:   () => { const c=new Date();c.setMonth(c.getMonth()+3); return Promise.resolve(lsGet('ph_medicines').filter(m=>m.is_active!==0).map(normMed).filter(m=>new Date(m.expiry)<=c&&m.stock>0)); },
    getCategories: () => Promise.resolve([...new Set(lsGet('ph_medicines').filter(m=>m.is_active!==0).map(m=>m.category))]),

    getPatients:   () => Promise.resolve(lsGet('ph_patients').filter(p=>p.is_active!==0).map(normPat)),
    getPatient:    id => Promise.resolve((lsGet('ph_patients').map(normPat).find(p=>p.id===id))||null),
    addPatient:    d  => { const l=lsGet('ph_patients'); const p={...d,id:'P'+(l.length+1).toString().padStart(3,'0'),createdAt:new Date().toISOString().split('T')[0],is_active:1}; l.push(p); lsSet('ph_patients',l); return Promise.resolve(p.id); },
    updatePatient: (id,d)=>{ lsSet('ph_patients',lsGet('ph_patients').map(p=>p.id===id?{...p,...d}:p)); return Promise.resolve(); },
    deletePatient: id => { lsSet('ph_patients',lsGet('ph_patients').map(p=>p.id===id?{...p,is_active:0}:p)); return Promise.resolve({archived:false}); },

    getSuppliers:  () => Promise.resolve(lsGet('ph_suppliers').filter(s=>s.is_active!==0).map(normSup)),
    getSupplier:   id => Promise.resolve((lsGet('ph_suppliers').map(normSup).find(s=>s.id===id))||null),
    addSupplier:   d  => { const l=lsGet('ph_suppliers'); const s={...d,id:'S'+(l.length+1).toString().padStart(3,'0'),totalOrders:0,lastOrder:'—',is_active:1}; l.push(s); lsSet('ph_suppliers',l); return Promise.resolve(s.id); },
    updateSupplier:(id,d)=>{ lsSet('ph_suppliers',lsGet('ph_suppliers').map(s=>s.id===id?{...s,...d}:s)); return Promise.resolve(); },
    deleteSupplier: id => { lsSet('ph_suppliers',lsGet('ph_suppliers').map(s=>s.id===id?{...s,is_active:0}:s)); return Promise.resolve({archived:false}); },

    getSales:      () => Promise.resolve(lsGet('ph_sales').map(normSale)),
    getSale:       id => Promise.resolve((lsGet('ph_sales').map(normSale).find(s=>s.id===id))||null),
    addSale: d => {
      const l=lsGet('ph_sales'); const n=l.length+1;
      const s={...d,id:'SL'+String(n).padStart(3,'0'),invoiceNum:'INV-'+new Date().getFullYear()+'-'+String(n).padStart(3,'0'),
               date:new Date().toISOString().split('T')[0],time:new Date().toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'}),status:'مكتمل',cashier:d.cashier||''};
      d.items.forEach(item=>{const meds=lsGet('ph_medicines');lsSet('ph_medicines',meds.map(m=>m.id===item.medId?{...m,stock:Math.max(0,m.stock-item.qty)}:m));});
      l.unshift(s); lsSet('ph_sales',l); return Promise.resolve({id:s.id,invoiceNum:s.invoiceNum,date:s.date,time:s.time});
    },
    voidSale: id => {
      lsSet('ph_sales',lsGet('ph_sales').map(s=>s.id===id?{...s,status:'ملغاة'}:s));
      return Promise.resolve({});
    },

    getStats: () => {
      const meds=lsGet('ph_medicines').filter(m=>m.is_active!==0).map(m=>({...m,minStock:m.min_stock??m.minStock??10}));
      const sales=lsGet('ph_sales').map(normSale).filter(s=>s.status==='مكتمل');
      const today=new Date().toISOString().split('T')[0];
      const month=new Date().toISOString().slice(0,7);
      const cutoff=new Date();cutoff.setMonth(cutoff.getMonth()+3);
      const todaySales=sales.filter(s=>s.date===today);
      const monthSales=sales.filter(s=>s.date.startsWith(month));
      return Promise.resolve({
        totalMeds:meds.length, lowStock:meds.filter(m=>m.stock>0&&m.stock<=m.minStock).length,
        outOfStock:meds.filter(m=>m.stock===0).length,
        expiring:meds.filter(m=>new Date(m.expiry)<=cutoff&&m.stock>0).length,
        totalPatients:lsGet('ph_patients').filter(p=>p.is_active!==0).length,
        totalSuppliers:lsGet('ph_suppliers').filter(s=>s.is_active!==0).length,
        todayCount:todaySales.length, todayRevenue:todaySales.reduce((a,s)=>a+s.total,0),
        monthRevenue:monthSales.reduce((a,s)=>a+s.total,0),
        totalSales:sales.length, totalRevenue:sales.reduce((a,s)=>a+s.total,0),
      });
    },
    getMonthlySales: () => {
      const sales=lsGet('ph_sales').map(normSale).filter(s=>s.status==='مكتمل');
      const labels=["يناير","فبراير","مارس","إبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
      const values=Array(12).fill(0);
      sales.forEach(s=>{const m=parseInt(s.date.split('-')[1])-1;values[m]+=s.total;});
      return Promise.resolve({labels,values});
    },
    getTopMedicines: () => {
      const map={};
      lsGet('ph_sales').map(normSale).filter(s=>s.status==='مكتمل').forEach(s=>s.items.forEach(item=>{
        if(!map[item.name])map[item.name]={name:item.name,qty:0,revenue:0};
        map[item.name].qty+=item.qty; map[item.name].revenue+=item.total;
      }));
      return Promise.resolve(Object.values(map).sort((a,b)=>b.qty-a.qty).slice(0,5));
    },
    getCategoryDist: () => {
      const map={};
      lsGet('ph_medicines').filter(m=>m.is_active!==0).forEach(m=>{map[m.category]=(map[m.category]||0)+1;});
      return Promise.resolve(Object.entries(map).map(([cat,count])=>({cat,count})).sort((a,b)=>b.count-a.count));
    },
    getRecentActivity: () => {
      const sales=lsGet('ph_sales').map(normSale).slice(0,8);
      return Promise.resolve(sales.map(s=>({type:'sale',title:`فاتورة ${s.invoiceNum}`,desc:`${s.patientName} — ${s.total.toFixed(2)} ر.س`,time:s.time,date:s.date,icon:'fa-receipt',color:'var(--teal-500)',status:s.status})));
    },
    getProfitReport: () => Promise.resolve({revenue:0,cost:0,profit:0,margin_pct:0,by_medicine:[]}),

    getSetting:  k  => Promise.resolve(localStorage.getItem('ph_setting_'+k)),
    setSetting:  (k,v) => { localStorage.setItem('ph_setting_'+k,v); return Promise.resolve(); },
    listBackups: () => Promise.resolve([]),
    getAuditLog: () => Promise.resolve({items:[],total:0}),

    login: (username, password) => {
      username = String(username || '').trim().toLowerCase();
      const users = lsGet('ph_users');
      const user  = users.find(u=>String(u.username||'').trim().toLowerCase()===username);
      if (!user || user.password !== password) return Promise.reject(new Error('اسم المستخدم أو كلمة المرور غير صحيحة'));
      const u={...user}; delete u.password;
      u.last_login=new Date().toISOString();
      u.is_default_password = ['admin123','123456'].includes(password);
      lsSet('ph_users',users.map(x=>x.id===u.id?{...x,last_login:u.last_login}:x));
      return Promise.resolve(u);
    },
    getUsers: () => {
      return Promise.resolve(lsGet('ph_users').map(u=>{const x={...u};delete x.password;return x;}));
    },
    getCurrentUser: uid => {
      const u=lsGet('ph_users').find(x=>x.id===uid);
      if(!u) return Promise.resolve(null);
      const x={...u}; delete x.password; return Promise.resolve(x);
    },
    changePassword: (uid,oldPwd,newPwd) => {
      const users=lsGet('ph_users');
      const idx=users.findIndex(u=>u.id===uid);
      if(idx===-1) return Promise.reject(new Error('المستخدم غير موجود'));
      if(users[idx].password!==oldPwd) return Promise.reject(new Error('كلمة المرور الحالية غير صحيحة'));
      users[idx].password=newPwd; lsSet('ph_users',users); return Promise.resolve();
    },
    addUser: d => {
      const users = lsGet('ph_users');
      if (users.find(u => u.username.toLowerCase() === (d.username || '').toLowerCase())) {
        return Promise.reject(new Error('اسم المستخدم موجود بالفعل'));
      }
      const u = {
        id: 'U' + (users.length + 1).toString().padStart(3, '0'),
        username: d.username,
        password: d.password || '123456',
        full_name: d.full_name || d.fullName || '',
        role: d.role || 'صيدلاني مسؤول',
        phone: d.phone || '',
        email: d.email || '',
        created_at: new Date().toISOString().split('T')[0],
        last_login: null
      };
      users.push(u);
      lsSet('ph_users', users);
      return Promise.resolve(u.id);
    },
    updateUser: (uid, d) => {
      const users = lsGet('ph_users');
      if (d.username && users.find(u => u.id !== uid && u.username.toLowerCase() === d.username.toLowerCase())) {
        return Promise.reject(new Error('اسم المستخدم موجود بالفعل'));
      }
      lsSet('ph_users', users.map(u => {
        if (u.id !== uid) return u;
        return {
          ...u,
          full_name: d.full_name ?? d.fullName ?? u.full_name,
          username:  d.username ?? u.username,
          role:      d.role ?? u.role,
          phone:     d.phone ?? u.phone,
          email:     d.email ?? u.email,
        };
      }));
      return Promise.resolve();
    },
    deleteUser: uid => {
      const users = lsGet('ph_users');
      const current = Auth?.getCurrent?.();
      if (current && current.id === uid) return Promise.reject(new Error('لا يمكن حذف حسابك الشخصي'));
      if (users.length <= 1) return Promise.reject(new Error('لا يمكن حذف المستخدم الوحيد في النظام'));
      lsSet('ph_users', users.filter(u => u.id !== uid));
      return Promise.resolve();
    },
    resetUserPassword: (uid, newPwd) => {
      lsSet('ph_users', lsGet('ph_users').map(u => u.id === uid ? { ...u, password: newPwd } : u));
      return Promise.resolve();
    },
  };
})();


/* ════════════════════════════════════════════════════════
   DB — الواجهة الموحدة (Flask أو localStorage)
════════════════════════════════════════════════════════ */
const DB = {

  /* ── normalisers (نفس المنطق للـ two modes) ─────────── */
  _normMed(m) {
    return { id:m.id, name:m.name, scientificName:m.scientific_name??m.scientificName??'', manufacturer:m.manufacturer??'', batchNumber:m.batch_number??m.batchNumber??'', category:m.category, price:+m.price, cost:+m.cost,
      stock:+m.stock, minStock:+(m.min_stock??m.minStock??10), unit:m.unit??'قرص',
      supplierId:m.supplier_id??m.supplierId??'', expiry:m.expiry??'',
      barcode:m.barcode??'', companyBarcode:m.company_barcode??m.companyBarcode??'',
      pharmacyBarcode:m.pharmacy_barcode??m.pharmacyBarcode??'',
      location:m.location??'', description:m.description??'', imageData:m.image_data??m.imageData??'' };
  },
  _normPat(p) {
    return { id:p.id, name:p.name, phone:p.phone, age:+p.age, gender:p.gender??'',
      bloodType:p.blood_type??p.bloodType??'', allergies:p.allergies??'',
      chronicDiseases:p.chronic_diseases??p.chronicDiseases??'',
      address:p.address??'', notes:p.notes??'', createdAt:p.created_at??p.createdAt??'' };
  },
  _normSup(s) {
    return { id:s.id, name:s.name, contact:s.contact??'', phone:s.phone??'',
      email:s.email??'', address:s.address??'', taxNum:s.tax_num??s.taxNum??'',
      paymentTerms:s.payment_terms??s.paymentTerms??'30 يوم', status:s.status??'نشط',
      rating:+(s.rating??3), totalOrders:+(s.total_orders??s.totalOrders??0),
      lastOrder:s.last_order??s.lastOrder??'—' };
  },
  _normSale(s) {
    return { id:s.id, invoiceNum:s.invoice_num??s.invoiceNum??'',
      patientId:s.patient_id??s.patientId??null,
      patientName:s.patient_name??s.patientName??'',
      items:(s.items??[]).map(i=>({medId:i.med_id??i.medId,name:i.name,qty:+i.qty,price:+i.price,total:+i.total})),
      subtotal:+(s.subtotal??0), discount:+(s.discount??0), tax:+(s.tax??0), total:+(s.total??0),
      paymentMethod:s.payment_method??s.paymentMethod??'نقدي', cashier:s.cashier??'',
      date:s.sale_date??s.date??'', time:s.sale_time??s.time??'', status:s.status??'مكتمل' };
  },
  _normUser(u) {
    return { id:u.id, username:u.username, fullName:u.full_name??u.fullName??'',
      role:u.role??'صيدلاني', phone:u.phone??'', email:u.email??'',
      createdAt:u.created_at??u.createdAt??'', lastLogin:u.last_login??u.lastLogin??'',
      isDefaultPassword:u.is_default_password??false };
  },
  _toSnakeMed(d) {
    return { name:d.name, scientific_name:d.scientificName??'', manufacturer:d.manufacturer??'', batch_number:d.batchNumber??'', category:d.category, price:d.price, cost:d.cost,
      stock:d.stock, min_stock:d.minStock, unit:d.unit, supplier_id:d.supplierId,
      expiry:d.expiry, barcode:d.barcode, company_barcode:d.companyBarcode??'',
      pharmacy_barcode:d.pharmacyBarcode??'', location:d.location,
      description:d.description, image_data:d.imageData??null, controlled:d.controlled?1:0,
      purchase_unit:d.purchaseUnit||d.unit||'علبة', sale_unit:d.saleUnit||d.unit||'قرص',
      conversion_factor:Math.max(1, Number(d.conversionFactor)||1) };
  },
  _toSnakePat(d) {
    return { name:d.name, phone:d.phone, age:d.age, gender:d.gender,
      blood_type:d.bloodType, allergies:d.allergies,
      chronic_diseases:d.chronicDiseases, address:d.address, notes:d.notes,
      insurance_company:d.insuranceCompany??'',policy_number:d.policyNumber??'',coverage_pct:d.coveragePct??0 };
  },
  _toSnakeSup(d) {
    return { name:d.name, contact:d.contact, phone:d.phone, email:d.email,
      address:d.address, tax_num:d.taxNum, payment_terms:d.paymentTerms,
      status:d.status, rating:d.rating };
  },

  /* helper: يضيف user_id للـ body لو موجود */
  _withUser(obj) {
    const user = Auth?.getCurrent?.();
    if (user?.id) obj.__user_id = user.id;
    return obj;
  },

  /* ── MEDICINES ──────────────────────────────────────── */
  async getMedicines()      { return _IS_FLASK ? (await _api('get_medicines')).map(m=>this._normMed(m)) : _LS.getMedicines(); },
  async getMedicine(id)     { return _IS_FLASK ? this._normMed(await _api(`get_medicine/${id}`)) : _LS.getMedicine(id); },
  async getMedicineByBarcode(barcode) {
    if (_IS_FLASK) {
      const raw = await _api(`get_medicine_by_barcode/${encodeURIComponent(barcode)}`);
      return raw ? this._normMed(raw) : null;
    }
    const all = await _LS.getMedicines();
    return all.find(m => m.pharmacyBarcode===barcode) || all.find(m => m.companyBarcode===barcode) || all.find(m => m.barcode===barcode) || null;
  },
  async addMedicine(data)   {
    if (_IS_FLASK) return _api('add_medicine', {body: this._withUser(this._toSnakeMed(data))});
    return _LS.addMedicine(data);
  },
  async updateMedicine(id,d) {
    if (_IS_FLASK) return _api(`update_medicine/${id}`, {body: this._withUser(this._toSnakeMed(d))});
    return _LS.updateMedicine(id, d);
  },
  async deleteMedicine(id)  {
    if (_IS_FLASK) return _api(`delete_medicine/${id}`, {body: this._withUser({})});
    return _LS.deleteMedicine(id);
  },
  async getLowStock()       { return _IS_FLASK ? (await _api('get_low_stock')).map(m=>this._normMed(m)) : _LS.getLowStock(); },
  async getExpiring()       { return _IS_FLASK ? (await _api('get_expiring')).map(m=>this._normMed(m))  : _LS.getExpiring(); },
  async getCategories()     { return _IS_FLASK ? _api('get_categories') : _LS.getCategories(); },
  async getTopSellingMeds(limit=50) { return _IS_FLASK ? (await _api(`get_top_selling_meds/${limit}`)).map(m=>this._normMed(m)) : (await _LS.getMedicines()).slice(0,limit); },
  async searchMedicines(q)  { return _IS_FLASK ? (await _api('search_medicines',{params:{q}})).map(m=>this._normMed(m)) : (await _LS.getMedicines()).filter(m=>m.name.includes(q)); },

  /* ── PATIENTS ───────────────────────────────────────── */
  async getPatients()       { return _IS_FLASK ? (await _api('get_patients')).map(p=>this._normPat(p)) : _LS.getPatients(); },
  async getPatient(id)      { return _IS_FLASK ? this._normPat(await _api(`get_patient/${id}`)) : _LS.getPatient(id); },
  async addPatient(data)    {
    if (_IS_FLASK) return _api('add_patient', {body: this._withUser(this._toSnakePat(data))});
    return _LS.addPatient(data);
  },
  async updatePatient(id,d) {
    if (_IS_FLASK) return _api(`update_patient/${id}`, {body: this._withUser(this._toSnakePat(d))});
    return _LS.updatePatient(id, d);
  },
  async deletePatient(id)   {
    if (_IS_FLASK) return _api(`delete_patient/${id}`, {body: this._withUser({})});
    return _LS.deletePatient(id);
  },

  /* ── SUPPLIERS ──────────────────────────────────────── */
  async getSuppliers()       { return _IS_FLASK ? (await _api('get_suppliers')).map(s=>this._normSup(s)) : _LS.getSuppliers(); },
  async getSupplier(id)      { return _IS_FLASK ? this._normSup(await _api(`get_supplier/${id}`)) : _LS.getSupplier(id); },
  async addSupplier(data)    {
    if (_IS_FLASK) return _api('add_supplier', {body: this._withUser(this._toSnakeSup(data))});
    return _LS.addSupplier(data);
  },
  async updateSupplier(id,d) {
    if (_IS_FLASK) return _api(`update_supplier/${id}`, {body: this._withUser(this._toSnakeSup(d))});
    return _LS.updateSupplier(id, d);
  },
  async deleteSupplier(id)   {
    if (_IS_FLASK) return _api(`delete_supplier/${id}`, {body: this._withUser({})});
    return _LS.deleteSupplier(id);
  },

  /* ── SALES ──────────────────────────────────────────── */
  async getSales()          { return _IS_FLASK ? (await _api('get_sales')).map(s=>this._normSale(s)) : _LS.getSales(); },
  async getSale(id)         { return _IS_FLASK ? this._normSale(await _api(`get_sale/${id}`)) : _LS.getSale(id); },
  async addSale(data)       {
    if (_IS_FLASK) return _api('add_sale', {body: this._withUser({...data,
      patient_id:data.patientId??data.patient_id??null, patient_name:data.patientName??data.patient_name??'',
      payment_method:data.paymentMethod??data.payment_method??'نقدي', use_loyalty:Boolean(data.useLoyalty??data.use_loyalty)
    })});
    return _LS.addSale(data);
  },
  async voidSale(id)        {
    if (_IS_FLASK) return _api(`void_sale/${id}`, {body: this._withUser({})});
    return _LS.voidSale(id);
  },

  /* ── STATS ──────────────────────────────────────────── */
  async getStats()          { return _IS_FLASK ? _api('get_stats')           : _LS.getStats(); },
  async getDashboardReport(fromDate, toDate) {
    if (_IS_FLASK) {
      return _api('get_dashboard_report', {params:{from_date:fromDate,to_date:toDate}});
    }

    const [sales, medicines] = await Promise.all([_LS.getSales(), _LS.getMedicines()]);
    const completed = sales.filter(s => s.status === 'مكتمل' && s.date >= fromDate && s.date <= toDate);
    const medCosts = Object.fromEntries(medicines.map(m => [m.id, Number(m.cost) || 0]));
    const revenue = completed.reduce((sum, s) => sum + Number(s.total || 0), 0);
    const estimatedCost = completed.reduce((sum, s) => sum + (s.items || []).reduce(
      (itemSum, item) => itemSum + Number(item.qty || 0) * (medCosts[item.medId] || 0), 0), 0);
    const spanDays = Math.floor((new Date(toDate) - new Date(fromDate)) / 86400000) + 1;
    const bucketOf = value => spanDays <= 62 ? value : value.slice(0, 7);
    const seriesMap = {};
    const topMap = {};
    const paymentMap = {};
    completed.forEach(s => {
      const bucket = bucketOf(s.date);
      seriesMap[bucket] = (seriesMap[bucket] || 0) + Number(s.total || 0);
      const method = s.paymentMethod || 'غير محدد';
      paymentMap[method] ||= {method,count:0,total:0};
      paymentMap[method].count += 1;
      paymentMap[method].total += Number(s.total || 0);
      (s.items || []).forEach(item => {
        topMap[item.name] ||= {name:item.name,qty:0,revenue:0};
        topMap[item.name].qty += Number(item.qty || 0);
        topMap[item.name].revenue += Number(item.total || 0);
      });
    });
    return {
      from:fromDate,
      to:toDate,
      summary:{
        count:completed.length,
        revenue,
        average:completed.length ? revenue / completed.length : 0,
        discount:completed.reduce((sum,s)=>sum+Number(s.discount||0),0),
        tax:completed.reduce((sum,s)=>sum+Number(s.tax||0),0),
        estimatedCost,
        estimatedProfit:revenue-estimatedCost,
        growthPct:null,
      },
      series:{labels:Object.keys(seriesMap).sort(),values:Object.keys(seriesMap).sort().map(k=>seriesMap[k]),granularity:spanDays<=62?'day':'month'},
      topMedicines:Object.values(topMap).sort((a,b)=>b.qty-a.qty).slice(0,5),
      recentSales:completed.slice().sort((a,b)=>`${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)).slice(0,6).map(s=>({invoice_num:s.invoiceNum,patient_name:s.patientName,total:s.total,sale_date:s.date,sale_time:s.time,payment_method:s.paymentMethod})),
      payments:Object.values(paymentMap).sort((a,b)=>b.total-a.total),
    };
  },
  async getMonthlySales()   { return _IS_FLASK ? _api('get_monthly_sales')   : _LS.getMonthlySales(); },
  async getTopMeds()        { return _IS_FLASK ? _api('get_top_medicines')   : _LS.getTopMedicines(); },
  async getCatDist()        { return _IS_FLASK ? _api('get_category_dist')   : _LS.getCategoryDist(); },
  async getRecentActivity() { return _IS_FLASK ? _api('get_recent_activity') : _LS.getRecentActivity(); },
  async getProfitReport(period='all') {
    return _IS_FLASK ? _api(`get_profit_report/${period}`) : _LS.getProfitReport();
  },
  async getPrescriptionsReport(month='') {
    return _IS_FLASK ? _api('get_prescriptions_report', {params:{month}}) : {month, count:0, items:[]};
  },
  async getTurnoverReport(days=30) { return _IS_FLASK ? _api('get_turnover_report',{params:{days}}) : []; },
  async getDebts(overdue=false) { return _IS_FLASK ? _api('get_debts',{params:{overdue:overdue?'1':'0'}}) : []; },
  async getPatientDebt(patientId) { return _IS_FLASK ? _api(`get_patient_debt/${patientId}`) : {balance:0}; },
  async payDebt(id,amount) { return _IS_FLASK ? _api(`pay_debt/${id}`,{body:this._withUser({amount})}) : {}; },
  async getLoyalty(patientId) { return _IS_FLASK ? _api(`get_loyalty/${patientId}`) : {points:0}; },
  async getInsuranceReport(month='') { return _IS_FLASK ? _api('get_insurance_report',{params:{month}}) : {month,total:0,items:[]}; },
  async importMedicinesCSV(file) {
    if (!_IS_FLASK) throw new Error('الاستيراد متاح عند تشغيل الخادم فقط');
    const form=new FormData(); form.append('file',file); form.append('__user_id',Auth?.getCurrent?.()?.id||'');
    const res=await fetch('/api/import_medicines',{method:'POST',body:form}); const parsed=await res.json();
    if(!res.ok||!parsed.ok) throw new Error(parsed.error||'فشل الاستيراد'); return parsed.data;
  },

  /* ── SETTINGS ───────────────────────────────────────── */
  async getSetting(key)         { return _IS_FLASK ? _api(`get_setting/${key}`) : _LS.getSetting(key); },
  async setSetting(key, value)  {
    if (_IS_FLASK) return _api('set_setting', {body:{key, value}});
    return _LS.setSetting(key, value);
  },
  async listBackups()           { return _IS_FLASK ? _api('list_backups') : _LS.listBackups(); },
  async backupDatabase()        { return _IS_FLASK ? _api('backup_database', {body:{}}) : {message:'غير متاح'}; },
  async getBackupStatus()       { return _IS_FLASK ? _api('get_backup_status') : {stale:false}; },
  async restoreDatabase(path)   { return _IS_FLASK ? _api('restore_database', {body:{backup_path:path}}) : {}; },
  async getAuditLog(limit=100, offset=0) {
    return _IS_FLASK ? _api('get_audit_log', {params:{limit,offset}}) : _LS.getAuditLog();
  },

  /* ── AUTH ───────────────────────────────────────────── */
  async login(username, password) {
    if (_IS_FLASK) return this._normUser(await _api('login', {body:{username,password}}));
    return this._normUser(await _LS.login(username, password));
  },
  async getUsers() {
    if (_IS_FLASK) return (await _api('get_users')).map(u=>this._normUser(u));
    return (await _LS.getUsers()).map(u=>this._normUser(u));
  },
  async getCurrentUser(uid) {
    if (_IS_FLASK) { const u=await _api(`get_current_user/${uid}`); return u?this._normUser(u):null; }
    const u=await _LS.getCurrentUser(uid); return u?this._normUser(u):null;
  },
  async changePassword(uid, oldPwd, newPwd) {
    if (_IS_FLASK) return _api('change_password', {body:{uid,old_pwd:oldPwd,new_pwd:newPwd}});
    return _LS.changePassword(uid, oldPwd, newPwd);
  },

  /* ── USER MANAGEMENT (admin only) ──────────────────── */
  async addUser(data) {
    if (_IS_FLASK) return _api('add_user', {body: this._withUser({...data})});
    return _LS.addUser(data);
  },
  async updateUser(uid, data) {
    if (_IS_FLASK) return _api(`update_user/${uid}`, {body: this._withUser({...data})});
    return _LS.updateUser(uid, data);
  },
  async deleteUser(uid) {
    if (_IS_FLASK) return _api(`delete_user/${uid}`, {body: this._withUser({})});
    return _LS.deleteUser(uid);
  },
  async resetUserPassword(uid, newPwd) {
    if (_IS_FLASK) return _api(`reset_user_password/${uid}`, {body: this._withUser({new_pwd: newPwd})});
    return _LS.resetUserPassword(uid, newPwd);
  },

  /* ── no-op seed (Python handles it) ────────────────── */
  seed() {},

  /* ── PURCHASES ──────────────────────────────────────── */
  async getPurchases()          { return _IS_FLASK ? _api('get_purchases') : []; },
  async getPurchase(id)         { return _IS_FLASK ? _api(`get_purchase/${id}`) : null; },
  async addPurchase(data)       { return _IS_FLASK ? _api('add_purchase', {body: this._withUser({...data})}) : {}; },
  async receivePurchase(id, d)  { return _IS_FLASK ? _api(`receive_purchase/${id}`, {body: this._withUser({...d})}) : {}; },
  async cancelPurchase(id)      { return _IS_FLASK ? _api(`cancel_purchase/${id}`, {body: this._withUser({})}) : {}; },

  /* ── ACCOUNTS ───────────────────────────────────────── */
  async getAccounts()           { return _IS_FLASK ? _api('get_accounts') : []; },
  async addAccount(data)        { return _IS_FLASK ? _api('add_account', {body: this._withUser({...data})}) : {}; },
  async updateAccount(id, data) { return _IS_FLASK ? _api(`update_account/${id}`, {body: this._withUser({...data})}) : {}; },
  async deleteAccount(id)       { return _IS_FLASK ? _api(`delete_account/${id}`, {body: this._withUser({})}) : {}; },
  async getTransactions(accountId, limit=100, offset=0) {
    const params = { limit, offset };
    if (accountId) params.account_id = accountId;
    return _IS_FLASK ? _api('get_transactions', {params}) : {items:[],total:0};
  },
  async addTransaction(data)    { return _IS_FLASK ? _api('add_transaction', {body: this._withUser({...data})}) : {}; },
  async getFinancialSummary()   { return _IS_FLASK ? _api('get_financial_summary') : {accounts:[],total_income:0,total_expense:0,net:0,month_income:0,month_expense:0,month_net:0,today_income:0,today_expense:0}; },

  /* ── CASH SESSIONS ──────────────────────────────────── */
  async getActiveSession()      { return _IS_FLASK ? _api('get_active_session') : null; },
  async openSession(data)       { return _IS_FLASK ? _api('open_session', {body: this._withUser({...data})}) : {}; },
  async closeSession(id, data)  { return _IS_FLASK ? _api(`close_session/${id}`, {body: this._withUser({...data})}) : {}; },
  async getSessions()           { return _IS_FLASK ? _api('get_sessions') : []; },

  /* ── HR & PAYROLL ───────────────────────────────────── */
  async getEmployees()          { return _IS_FLASK ? _api('get_employees') : []; },
  async addEmployee(data)       { return _IS_FLASK ? _api('add_employee', {body: this._withUser({...data})}) : {}; },
  async updateEmployee(id, d)   { return _IS_FLASK ? _api(`update_employee/${id}`, {body: this._withUser({...d})}) : {}; },
  async deleteEmployee(id)      { return _IS_FLASK ? _api(`delete_employee/${id}`, {body: this._withUser({})}) : {}; },
  async getPayroll(empId)       {
    const params = empId ? {employee_id: empId} : {};
    return _IS_FLASK ? _api('get_payroll', {params}) : [];
  },
  async addPayroll(data)        { return _IS_FLASK ? _api('add_payroll', {body: this._withUser({...data})}) : {}; },
  async getEmployeePerformance(empId) {
    const params = empId ? {employee_id: empId} : {};
    return _IS_FLASK ? _api('get_employee_performance', {params}) : [];
  },
};
