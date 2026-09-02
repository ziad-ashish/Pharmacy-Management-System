/* ════════════════════════════════════════════════════════════
   APP.JS  —  Main controller  (async-aware)
════════════════════════════════════════════════════════════ */
'use strict';

/* ════════════════════════════════════════════════════════════
   AUTH  —  Session management (localStorage)
════════════════════════════════════════════════════════════ */
const Auth = (() => {
  const KEY = 'ph_auth_user';
  const LAST = 'ph_last_username';

  function _parse(raw) {
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  }
  function getCurrent() {
    return _parse(sessionStorage.getItem(KEY)) || _parse(localStorage.getItem(KEY));
  }
  function set(user, remember) {
    const json = JSON.stringify(user);
    if (remember) {
      localStorage.setItem(KEY, json);
      sessionStorage.removeItem(KEY);
      if (user.username) localStorage.setItem(LAST, user.username);
    } else {
      sessionStorage.setItem(KEY, json);
      localStorage.removeItem(KEY);
    }
    sessionStorage.removeItem('ph_auth_tmp');
  }
  function clear() {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem('ph_auth_tmp');
  }
  function lastUsername() {
    return localStorage.getItem(LAST) || '';
  }
  function isLoggedIn() {
    const u = getCurrent();
    return !!(u && u.id);
  }
  function isRemembered() { return !!_parse(localStorage.getItem(KEY)); }
  return { getCurrent, set, clear, isLoggedIn, isRemembered, lastUsername };
})();

const App = (() => {

  const pages = {
    dashboard: { module: DashboardPage,  label: 'لوحة التحكم' },
    medicines: { module: MedicinesPage,  label: 'الأدوية والمخزون' },
    sales:     { module: SalesPage,      label: 'نقطة البيع' },
    invoices:  { module: InvoicesPage,   label: 'الفواتير' },
    purchases: { module: PurchasesPage,  label: 'أوامر الشراء' },
    shortage:  { module: ShortagePage,   label: 'كشكول النواقص' },
    accounts:  { module: AccountsPage,   label: 'الحسابات المالية' },
    debts:     { module: DebtsPage,      label: 'ديون العملاء' },
    patients:  { module: PatientsPage,   label: 'المرضى' },
    suppliers: { module: SuppliersPage,  label: 'الموردون' },
    hr:        { module: HRPage,         label: 'الموارد البشرية' },
    reports:   { module: ReportsPage,    label: 'التقارير' },
    settings:  { module: SettingsPage,   label: 'الإعدادات' },
  };

  /* ── INIT ── */
  async function init() {
    DB.seed();
    Theme.init();

    if (!Auth.isLoggedIn()) {
      _setupLogin();
      return;
    }
    // Never trust a stale browser session blindly. The account may have been
    // removed or its role changed since the previous launch.
    try {
      const cached = Auth.getCurrent();
      const fresh = await DB.getCurrentUser(cached.id);
      if (!fresh?.id) {
        Auth.clear();
        _setupLogin('انتهت الجلسة أو لم يعد الحساب موجودًا. سجل الدخول مرة أخرى.');
        return;
      }
      Auth.set({ ...cached, ...fresh }, Auth.isRemembered());
    } catch (err) {
      _setupLogin(err.message || 'تعذر التحقق من جلسة الدخول');
      return;
    }
    _enterApp();
  }

  function _enterApp() {
    const loginScreen = document.getElementById('loginScreen');
    const splash = document.getElementById('splashScreen');
    if (loginScreen) loginScreen.classList.add('hidden');
    if (splash) splash.classList.remove('hidden');

    _runSplash(() => {
      try {
        document.getElementById('appShell')?.classList.remove('hidden');
        _setupSidebar();
        _setupUserMenu();
        _updateUserInfo();
        _applyBranding();
        _setupSearch();
        _setupNotifications();
        _startClock();
        navigate('dashboard');
        _updateBadges().catch(e => console.warn('badges error:', e));
      } catch(err) {
        console.error('[_enterApp] critical error:', err);
        // أظهر الـ app على أي حال بدون تجميد
        document.getElementById('appShell')?.classList.remove('hidden');
        navigate('dashboard');
      }
    });
  }

  /* ── LOGIN ── */
  function _forcePasswordChange(user, oldPassword, remember) {
    return new Promise(resolve => {
      Modal.open({
        locked: true,
        size: 'sm',
        title: '<i class="fas fa-shield-halved"></i> تأمين الحساب مطلوب',
        body: `<p class="form-hint" style="margin-bottom:1rem">أنت تستخدم كلمة المرور الافتراضية. يجب تغييرها قبل الدخول للنظام.</p>
          <div class="form-group"><label>كلمة المرور الجديدة</label><input class="form-control" id="forcedNewPwd" type="password" minlength="8" autocomplete="new-password"></div>
          <div class="form-group"><label>تأكيد كلمة المرور</label><input class="form-control" id="forcedConfirmPwd" type="password" minlength="8" autocomplete="new-password"></div>
          <div id="forcedPwdError" class="form-error" style="display:none;margin-top:.7rem"></div>`,
        foot: '<button class="btn btn-primary" id="forcedPwdSave"><i class="fas fa-lock"></i> تغيير كلمة المرور والمتابعة</button>'
      });
      const save = document.getElementById('forcedPwdSave');
      save?.addEventListener('click', async () => {
        const pwd = document.getElementById('forcedNewPwd')?.value || '';
        const confirm = document.getElementById('forcedConfirmPwd')?.value || '';
        const err = document.getElementById('forcedPwdError');
        const fail = msg => { if (err) { err.textContent=msg; err.style.display='block'; } };
        if (pwd.length < 8) return fail('كلمة المرور يجب ألا تقل عن 8 أحرف.');
        if (pwd !== confirm) return fail('كلمتا المرور غير متطابقتين.');
        if (pwd === oldPassword) return fail('اختر كلمة مرور مختلفة عن الافتراضية.');
        save.disabled = true;
        try {
          await DB.changePassword(user.id, oldPassword, pwd);
          const secured = {...user, isDefaultPassword:false};
          Auth.set(secured, remember);
          Modal.close(true);
          Toast.ok('تم تأمين الحساب', 'تم تغيير كلمة المرور بنجاح');
          resolve(secured);
        } catch (e) {
          save.disabled = false;
          fail(e.message || 'تعذر تغيير كلمة المرور');
        }
      });
      document.getElementById('forcedNewPwd')?.focus();
    });
  }

  function _setupLogin(initialError = '') {
    const loginScreen = document.getElementById('loginScreen');
    const splash = document.getElementById('splashScreen');
    const appShell = document.getElementById('appShell');
    if (splash) splash.classList.add('hidden');
    if (appShell) appShell.classList.add('hidden');
    if (loginScreen) loginScreen.classList.remove('hidden');
    _applyBranding();

    const form = document.getElementById('loginForm');
    if (initialError) {
      const box=document.getElementById('loginError'), text=document.getElementById('loginErrorText');
      if(text) text.textContent=initialError;
      box?.classList.remove('hidden');
    }
    if (!form || form.dataset.bound === '1') {
      document.getElementById('loginUsername')?.focus();
      return;
    }
    form.dataset.bound = '1';

    const usernameInp = document.getElementById('loginUsername');
    const passwordInp = document.getElementById('loginPassword');
    const togglePwd = document.getElementById('togglePwd');
    const rememberMe = document.getElementById('rememberMe');
    const loginBtn = document.getElementById('btnLogin');
    const btnText = document.querySelector('.btn-login-text');
    const btnSpin = document.querySelector('.btn-login-spin');
    const errBox = document.getElementById('loginError');
    const errText = document.getElementById('loginErrorText');
    let loginInFlight = false;

    const savedUser = Auth.lastUsername();
    if (savedUser && usernameInp) {
      usernameInp.value = savedUser;
      if (rememberMe) rememberMe.checked = true;
      passwordInp?.focus();
    } else {
      usernameInp?.focus();
    }

    function showErr(msg) {
      errText.textContent = msg;
      errBox.classList.remove('hidden');
    }
    function setLoading(loading) {
      loginBtn.disabled = loading;
      btnText.classList.toggle('hidden', loading);
      btnSpin.classList.toggle('hidden', !loading);
      loginBtn.style.opacity = loading ? .7 : '';
      loginBtn.style.cursor = loading ? 'not-allowed' : '';
    }

    togglePwd?.addEventListener('click', () => {
      const isPwd = passwordInp.type === 'password';
      passwordInp.type = isPwd ? 'text' : 'password';
      togglePwd.querySelector('i').className = isPwd ? 'fas fa-eye-slash' : 'fas fa-eye';
      togglePwd.title = isPwd ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور';
      passwordInp.focus();
    });

    document.querySelectorAll('.cred-item[data-user]').forEach(item => {
      item.addEventListener('click', () => {
        usernameInp.value = item.dataset.user || '';
        passwordInp.value = item.dataset.pass || '';
        errBox.classList.add('hidden');
        passwordInp.focus();
      });
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (loginInFlight) return;
      const username = usernameInp.value.trim();
      const password = passwordInp.value;
      if (!username || !password) {
        showErr('يرجى إدخال اسم المستخدم وكلمة المرور');
        return;
      }
      loginInFlight = true;
      setLoading(true);
      errBox.classList.add('hidden');
      try {
        const user = await DB.login(username, password);
        if (!user || !user.id) throw new Error('فشل تسجيل الدخول');
        Auth.set(user, rememberMe.checked);
        if (user.isDefaultPassword) await _forcePasswordChange(user, password, rememberMe.checked);
        passwordInp.value = '';
        setLoading(false);
        loginInFlight = false;
        Toast.ok(`مرحباً ${user.fullName || user.username}`);
        setTimeout(() => _enterApp(), 250);
      } catch (err) {
        setLoading(false);
        loginInFlight = false;
        showErr(err.message || 'فشل تسجيل الدخول');
        passwordInp.value = '';
        passwordInp.focus();
      }
    });
  }

  /* ── LOGOUT ── */
  function logout() {
    Modal.confirm(
      'تسجيل الخروج',
      'هل أنت متأكد من تسجيل الخروج من النظام؟',
      () => {
        Auth.clear();
        Toast.info('تم تسجيل الخروج بنجاح');
        setTimeout(() => location.reload(), 300);
      },
      'تأكيد الخروج',
      'btn-amber'
    );
  }

  /* ── USER INFO & MENU ── */
  function _updateUserInfo() {
    const user = Auth.getCurrent();
    if (!user) return;
    const nmEl = document.getElementById('userNm');
    const rlEl = document.getElementById('userRl');
    const avEl = document.getElementById('userAva');
    if (nmEl) nmEl.textContent = user.fullName || 'مستخدم';
    if (rlEl) rlEl.textContent = user.role || '';
    if (avEl) {
      const name = user.fullName || 'U';
      const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
      avEl.textContent = parts.map(p => p[0]).join('') || name[0] || 'U';
    }
  }

  /* ── BRANDING (name / logo shown across login, splash, sidebar) ── */
  async function _applyBranding() {
    try {
      const [name, logo] = await Promise.all([
        DB.getSetting('pharmacy_name'),
        DB.getSetting('pharmacy_logo'),
      ]);
      const iconHTML = logo
        ? `<img src="${logo}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit" />`
        : `<img src="assets/logo-mark.svg" alt="شفاء" style="width:100%;height:100%;object-fit:contain;border-radius:inherit" />`;
      ['brandIconWrap', 'loginIconWrap', 'splashIconWrap'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = iconHTML;
      });
      if (name) {
        ['brandName', 'loginTitle', 'splashTitle'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.textContent = name;
        });
      }
    } catch (e) { /* keep defaults if settings unavailable */ }
  }

  function _setupUserMenu() {
    const menuBtn    = document.getElementById('userMenuBtn');
    const menu       = document.getElementById('userMenu');
    const umLogout   = document.getElementById('umLogout');
    const umChangePwd= document.getElementById('umChangePwd');
    const umProfile  = document.getElementById('umProfile');
    const umSettings = document.getElementById('umSettings');

    if (!menuBtn || !menu) return;

    // Toggle menu on button click — stopPropagation prevents the document
    // listener from immediately closing it in the same event cycle.
    menuBtn.addEventListener('click', e => {
      e.stopPropagation();
      const isHidden = menu.classList.contains('hidden');
      menu.classList.toggle('hidden', !isHidden);
    });

    // Close when clicking anywhere outside the sidebar footer
    document.addEventListener('click', e => {
      if (!e.target.closest('#userMenu') && !e.target.closest('#userMenuBtn')) {
        menu.classList.add('hidden');
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') menu.classList.add('hidden');
    });

    umProfile?.addEventListener('click', () => {
      menu.classList.add('hidden');
      _showProfile();
    });

    umChangePwd?.addEventListener('click', () => {
      menu.classList.add('hidden');
      _showChangePwd();
    });

    umSettings?.addEventListener('click', () => {
      menu.classList.add('hidden');
      navigate('settings');
    });

    umLogout?.addEventListener('click', () => {
      menu.classList.add('hidden');
      logout();
    });
  }

  function _showChangePwd() {
    const user = Auth.getCurrent();
    if (!user) return;
    Modal.open({
      title: '<i class="fas fa-key"></i> تغيير كلمة المرور',
      body: `
        <form id="cpForm" onsubmit="event.preventDefault()">
          <div class="form-group">
            <label class="form-label" style="font-size:.8rem;font-weight:600;color:var(--tx-2);display:block;margin-bottom:.35rem">كلمة المرور الحالية</label>
            <input type="password" id="cpOld" class="form-input" required style="width:100%;padding:.6rem .85rem;background:var(--surface-2);border:1.5px solid var(--border);border-radius:var(--r-sm);font-size:.88rem;color:var(--tx);outline:none;font-family:inherit" />
          </div>
          <div class="form-group" style="margin-top:.8rem">
            <label class="form-label" style="font-size:.8rem;font-weight:600;color:var(--tx-2);display:block;margin-bottom:.35rem">كلمة المرور الجديدة</label>
            <input type="password" id="cpNew" class="form-input" minlength="4" required style="width:100%;padding:.6rem .85rem;background:var(--surface-2);border:1.5px solid var(--border);border-radius:var(--r-sm);font-size:.88rem;color:var(--tx);outline:none;font-family:inherit" />
          </div>
          <div class="form-group" style="margin-top:.8rem">
            <label class="form-label" style="font-size:.8rem;font-weight:600;color:var(--tx-2);display:block;margin-bottom:.35rem">تأكيد كلمة المرور الجديدة</label>
            <input type="password" id="cpConfirm" class="form-input" minlength="4" required style="width:100%;padding:.6rem .85rem;background:var(--surface-2);border:1.5px solid var(--border);border-radius:var(--r-sm);font-size:.88rem;color:var(--tx);outline:none;font-family:inherit" />
          </div>
        </form>
      `,
      foot: `
        <button class="btn btn-ghost" id="cpCancelBtn">إلغاء</button>
        <button class="btn btn-primary" id="cpSubmitBtn">
          <span id="cpBtnText">تحديث</span>
          <span id="cpBtnSpin" class="hidden"><i class="fas fa-spinner fa-spin"></i></span>
        </button>
      `,
    });
    document.getElementById('cpCancelBtn')?.addEventListener('click', Modal.close);
    document.getElementById('cpSubmitBtn')?.addEventListener('click', async () => {
      const oldPwd = document.getElementById('cpOld').value;
      const newPwd = document.getElementById('cpNew').value;
      const confirm = document.getElementById('cpConfirm').value;
      const btnText = document.getElementById('cpBtnText');
      const btnSpin = document.getElementById('cpBtnSpin');
      if (newPwd !== confirm) { Toast.err('كلمات المرور الجديدة غير متطابقة'); return; }
      btnText.classList.add('hidden'); btnSpin.classList.remove('hidden');
      try {
        await DB.changePassword(user.id, oldPwd, newPwd);
        Toast.ok('تم تغيير كلمة المرور بنجاح');
        Modal.close();
      } catch (err) {
        Toast.err(err.message || 'فشل التغيير');
      } finally {
        btnText.classList.remove('hidden'); btnSpin.classList.add('hidden');
      }
    });
  }

  function _showProfile() {
    const user = Auth.getCurrent();
    if (!user) return;
    Modal.open({
      title: '<i class="fas fa-user-circle"></i> الملف الشخصي',
      body: `
        <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem;padding-bottom:1rem;border-bottom:1px solid var(--border-2)">
          <div style="width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,var(--teal-500),var(--teal-400));color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:700;flex-shrink:0">
            ${(user.fullName || 'U').split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]).join('') || (user.fullName||'U')[0]}
          </div>
          <div>
            <div style="font-size:1.05rem;font-weight:700;color:var(--tx)">${user.fullName || '—'}</div>
            <div style="font-size:.8rem;color:var(--teal-600);font-weight:600">${user.role || '—'}</div>
          </div>
        </div>
        <div style="display:grid;gap:.75rem;font-size:.85rem">
          <div style="display:flex;gap:.6rem"><span style="color:var(--tx-3);min-width:110px;flex-shrink:0">اسم المستخدم:</span><span style="color:var(--tx);font-weight:600">${user.username || '—'}</span></div>
          <div style="display:flex;gap:.6rem"><span style="color:var(--tx-3);min-width:110px;flex-shrink:0">الهاتف:</span><span style="color:var(--tx);font-weight:600">${user.phone || '—'}</span></div>
          <div style="display:flex;gap:.6rem"><span style="color:var(--tx-3);min-width:110px;flex-shrink:0">البريد:</span><span style="color:var(--tx);font-weight:600">${user.email || '—'}</span></div>
          <div style="display:flex;gap:.6rem"><span style="color:var(--tx-3);min-width:110px;flex-shrink:0">تاريخ الإنشاء:</span><span style="color:var(--tx);font-weight:600">${user.createdAt ? (user.createdAt.split('T')[0]) : '—'}</span></div>
          <div style="display:flex;gap:.6rem"><span style="color:var(--tx-3);min-width:110px;flex-shrink:0">آخر دخول:</span><span style="color:var(--tx);font-weight:600">${user.lastLogin ? (user.lastLogin.split('T')[0] + ' ' + (user.lastLogin.split('T')[1]||'').slice(0,5)) : '—'}</span></div>
        </div>
      `,
      foot: `
        <button class="btn btn-primary" id="profCloseBtn">إغلاق</button>
      `,
    });
    document.getElementById('profCloseBtn')?.addEventListener('click', Modal.close);
  }

  /* ── SPLASH ── */
  function _runSplash(cb) {
    const splash = document.getElementById('splashScreen');
    const fill   = document.getElementById('splashFill');
    const pct    = document.getElementById('splashPct');
    if (!splash) { cb(); return; }
    let p = 0;
    const step = () => {
      p = Math.min(p + Math.random()*14 + 6, 100);
      if (fill) fill.style.width = p + '%';
      if (pct)  pct.textContent  = Math.round(p) + '%';
      if (p < 100) setTimeout(step, 70 + Math.random()*50);
      else setTimeout(()=>{
        splash.classList.add('out');
        setTimeout(()=>{ splash.remove(); cb(); }, 440);
      }, 150);
    };
    setTimeout(step, 280);
  }

  /* ── NAVIGATION ── */
  function navigate(pageId) {
    const pg = pages[pageId];
    if (!pg) return;

    const host = document.getElementById('pageHost');
    if (!host) return;

    // render HTML shell
    host.innerHTML = pg.module.render();

    // call async afterRender
    if (typeof pg.module.afterRender === 'function') {
      requestAnimationFrame(() => {
        Promise.resolve(pg.module.afterRender()).catch(err => {
          console.error(`[navigate] afterRender error on page "${pageId}":`, err);
          Toast.err('خطأ في تحميل الصفحة', err?.message || String(err));
        });
      });
    }

    // sidebar active state
    document.querySelectorAll('.nav-item').forEach(li => {
      li.classList.toggle('active', li.dataset.page === pageId);
    });

    // breadcrumb
    const bcLabel = document.getElementById('bcLabel');
    if (bcLabel) bcLabel.textContent = pg.label;

    // close mobile sidebar
    document.getElementById('sidebar')?.classList.remove('mob-open');
    document.getElementById('mobOverlay')?.classList.remove('on');
  }

  /* ── SIDEBAR ── */
  function _setupSidebar() {
    document.getElementById('btnCollapse')?.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.toggle('collapsed');
      document.getElementById('mainWrap')?.classList.toggle('expanded');
    });

    document.getElementById('sidebar')?.addEventListener('click', e => {
      const item = e.target.closest('.nav-item[data-page]');
      if (!item) return;
      e.preventDefault();
      navigate(item.dataset.page);
    });

    document.getElementById('btnMobMenu')?.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.toggle('mob-open');
      document.getElementById('mobOverlay')?.classList.toggle('on');
    });

    document.getElementById('mobOverlay')?.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.remove('mob-open');
      document.getElementById('mobOverlay')?.classList.remove('on');
    });
  }

  /* ── CLOCK ── */
  function _startClock() {
    const el = document.getElementById('tbClock');
    const tick = () => {
      if (!el) return;
      const now = new Date();
      el.innerHTML = `
        <span>${now.toLocaleDateString('ar-SA',{weekday:'short',month:'short',day:'numeric'})}</span>
        <span style="font-weight:700">${now.toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'})}</span>`;
    };
    tick(); setInterval(tick, 1000);
  }

  /* ── NOTIFICATIONS ── */
  async function _updateBadges() {
    try {
      const [low, exp] = await Promise.all([DB.getLowStock(), DB.getExpiring()]);
      const total = low.length + exp.length;

      const badge = document.getElementById('badgeLow');
      if (badge) { badge.textContent=total>0?total:''; badge.style.display=total>0?'':'none'; }

      // badge كشكول النواقص
      const badgeShortage = document.getElementById('badgeShortage');
      if (badgeShortage) { badgeShortage.textContent=low.length>0?low.length:''; badgeShortage.style.display=low.length>0?'':'none'; }

      // badge أوامر الشراء المفتوحة
      try {
        const purchases = await DB.getPurchases();
        const openPO = (purchases||[]).filter(p=>p.status==='مفتوح').length;
        const badgePO = document.getElementById('badgePO');
        if (badgePO) { badgePO.textContent=openPO>0?openPO:''; badgePO.style.display=openPO>0?'':'none'; }
      } catch(_) { /* ignore if no purchases table yet */ }

      const nb = document.getElementById('notifBadge');
      if (nb) { nb.textContent=total; nb.classList.toggle('hidden',total===0); }

      const body = document.getElementById('npBody');
      if (!body) return;

      const notifs = [
        ...low.map(m=>({ ico:'fa-box-open', bg:'var(--warn-light)', color:'var(--warn)',
          text:`مخزون منخفض: <strong>${m.name}</strong> (${m.stock} ${m.unit} متبقي)`, time:'الآن' })),
        ...exp.map(m=>({ ico:'fa-clock', bg:'var(--err-light)', color:'var(--err)',
          text:`صلاحية قريبة: <strong>${m.name}</strong> — ${Fmt.expiryBadge(m.expiry)}`, time:'الآن' })),
      ];

      if (!notifs.length) {
        body.innerHTML=`<div style="text-align:center;padding:2rem;color:var(--tx-3);font-size:.84rem">
          <i class="fas fa-check-circle" style="font-size:1.5rem;color:var(--ok);margin-bottom:.5rem;display:block"></i>
          كل شيء على ما يرام!</div>`;
        return;
      }
      body.innerHTML = notifs.map(n=>`
        <div class="np-item">
          <div class="np-ico" style="background:${n.bg};color:${n.color}"><i class="fas ${n.ico}"></i></div>
          <div><div class="np-text">${n.text}</div><div class="np-time">${n.time}</div></div>
        </div>`).join('');
    } catch(e) { console.warn('notifications error', e); }
  }

  function _setupNotifications() {
    document.getElementById('notifBtn')?.addEventListener('click', e => {
      e.stopPropagation();
      document.getElementById('notifPanel')?.classList.toggle('on');
    });
    document.getElementById('npClose')?.addEventListener('click', () => {
      document.getElementById('notifPanel')?.classList.remove('on');
    });
    document.addEventListener('click', e => {
      if (!e.target.closest('#notifPanel') && !e.target.closest('#notifBtn')) {
        document.getElementById('notifPanel')?.classList.remove('on');
      }
    });
  }

  /* ── GLOBAL SEARCH ── */
  function _setupSearch() {
    const input = document.getElementById('globalSearch');
    const drop  = document.getElementById('searchDrop');
    if (!input || !drop) return;

    // FIX: searchDrop used to be pinned via a fixed CSS offset based on the
    // *expanded* sidebar width, so it landed in the wrong place whenever the
    // sidebar was collapsed (or on smaller screens). Position it from the
    // actual search box position instead, every time it's shown.
    const _positionDrop = () => {
      const wrap = input.closest('.tb-search');
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      drop.style.top   = (r.bottom + 8) + 'px';
      drop.style.left  = r.left + 'px';
      drop.style.width = r.width + 'px';
    };
    window.addEventListener('resize', () => { if (!drop.classList.contains('hidden')) _positionDrop(); });

    input.addEventListener('input', debounce(async e => {
      const raw = e.target.value.trim();
      if (!raw) { drop.classList.add('hidden'); return; }
      // FEAT [1]: Arabic-aware global search
      const q = normalizeArabicText(raw);
      try {
        const [meds, pats] = await Promise.all([DB.getMedicines(), DB.getPatients()]);
        const fm = meds.filter(m =>
          normalizeArabicText(m.name).includes(q) ||
          normalizeArabicText(m.category).includes(q) ||
          (m.barcode && m.barcode.includes(raw))
        ).slice(0,5);
        const fp = pats.filter(p =>
          normalizeArabicText(p.name).includes(q) ||
          p.phone.includes(raw)
        ).slice(0,3);
        if (!fm.length && !fp.length) { drop.classList.add('hidden'); return; }
        drop.innerHTML = [
          ...fm.map(m=>`<div class="sd-item" data-type="med" data-id="${m.id}">
            <div class="sd-icon"><i class="fas fa-pills"></i></div>
            <div>
              <div class="sd-name">${m.name}</div>
              <div class="sd-sub">${m.category} — ${Fmt.money(m.price)} — مخزون: ${m.stock}</div>
            </div>
          </div>`),
          ...fp.map(p=>`<div class="sd-item" data-type="pat" data-id="${p.id}">
            <div class="sd-icon"><i class="fas fa-user-injured"></i></div>
            <div>
              <div class="sd-name">${p.name}</div>
              <div class="sd-sub">${p.phone} — ${p.bloodType}</div>
            </div>
          </div>`),
        ].join('');
        // FEAT [1]: clicking a result opens the detail modal directly
        drop.querySelectorAll('.sd-item').forEach(item => {
          item.addEventListener('click', async () => {
            input.value = ''; drop.classList.add('hidden');
            const { type, id } = item.dataset;
            if (type === 'med') {
              navigate('medicines');
              // wait for page render then open medicine view
              setTimeout(() => MedicinesPage.openEditModal(id), 400);
            } else if (type === 'pat') {
              navigate('patients');
              setTimeout(() => PatientsPage.viewPt(id), 400);
            }
          });
        });
        _positionDrop();
        drop.classList.remove('hidden');
      } catch(e) { console.warn('search error', e); }
    }, 280));

    document.addEventListener('click', e => {
      if (!e.target.closest('#globalSearch') && !e.target.closest('#searchDrop')) {
        drop.classList.add('hidden');
      }
    });
  }

  return { init, navigate, applyBranding: _applyBranding };
})();

/* ── BOOT ── */
document.addEventListener('DOMContentLoaded', () => App.init());
