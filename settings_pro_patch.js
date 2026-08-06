/* ============================================================
   Coach & Horses Kitchen Pro — Settings, rebuilt
   ------------------------------------------------------------
   Replaces the old flat Settings screen with a single tabbed
   page. Reuses the existing module system, equipment editors,
   probe form and backup tools rather than duplicating them,
   and fixes the copy that still described the old browser-only
   build (this build stores everything on the server and keeps
   the OpenAI key on the server).
   This is loaded last, so its VIEWS.settings is the one that wins.
   ============================================================ */
(function () {
  function boot(fn) {
    if (window.VIEWS && typeof window.page === 'function' && typeof window.state === 'object') fn();
    else setTimeout(function () { boot(fn); }, 60);
  }

  boot(function () {
    if (!document.getElementById('settings-pro-css')) {
      var css = document.createElement('style');
      css.id = 'settings-pro-css';
      css.textContent =
        '.settings-tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:18px;border-bottom:1px solid var(--line,#e3ded4);padding-bottom:10px}' +
        '.settings-tabs .stab{border:1px solid transparent;background:transparent;padding:8px 14px;border-radius:10px 10px 0 0;cursor:pointer;font:inherit;font-weight:600;color:var(--muted,#7a7365)}' +
        '.settings-tabs .stab:hover{background:rgba(0,0,0,.04)}' +
        '.settings-tabs .stab.on{color:var(--ink,#2a2620);border-color:var(--line,#e3ded4);border-bottom-color:var(--bg,#fff);background:var(--card,#fff)}' +
        '.set-note{background:rgba(0,0,0,.03);border:1px solid var(--line,#e3ded4);border-radius:10px;padding:10px 12px;font-size:.92em;color:var(--muted,#7a7365);margin-top:10px}' +
        '.set-ok{color:var(--ok,#2e7d32);font-weight:600}.set-off{color:var(--bad,#b3261e);font-weight:600}';
      document.head.appendChild(css);
    }

    var api = window.__moduleApi || {};
    var MODULE_DEFS = api.MODULE_DEFS || {};
    var PRESETS = api.PRESETS || {};
    var moduleOn = api.moduleOn || function () { return true; };
    var ensureModules = api.ensureModules || function () {};
    var esc = window.esc || function (s) { return String(s == null ? '' : s); };

    var TABS = [
      ['modules', 'Kitchen modules'],
      ['business', 'Business & equipment'],
      ['team', 'Team'],
      ['probe', 'Probe & sensors'],
      ['data', 'AI & backups']
    ];
    var tab = 'modules';
    var serverCfg = null;

    function loadCfg() {
      if (serverCfg) { renderBody(); return; }
      fetch('/api/config').then(function (r) { return r.json(); })
        .then(function (c) { serverCfg = c; if (tab === 'data') renderBody(); })
        .catch(function () { serverCfg = { aiEnabled: false, serverStorage: true }; });
    }

    function isMgr() { return window.me && me.role === 'manager'; }

    function modulesTab() {
      ensureModules();
      var mgr = isMgr();
      var presetRow = mgr
        ? '<div class="btn-row" style="margin-bottom:14px">' +
            '<button class="btn sm" onclick="applyModulePreset(\'basic\')">Basic kitchen</button>' +
            '<button class="btn sm ghost" onclick="applyModulePreset(\'compliance\')">Full compliance</button>' +
            '<button class="btn sm ghost" onclick="applyModulePreset(\'full\')">Full management</button></div>'
        : '<div class="set-note">Only a manager can turn modules on or off.</div>';
      var grid = Object.keys(MODULE_DEFS).map(function (k) {
        var d = MODULE_DEFS[k];
        var on = moduleOn(k);
        var box = mgr
          ? '<input type="checkbox" ' + (on ? 'checked' : '') + ' onchange="toggleModule(\'' + k + '\',this.checked)">' 
          : '<span class="badge">' + (on ? 'On' : 'Off') + '</span>';
        return '<label class="module-card ' + (on ? 'on' : '') + '"><div class="module-toggle">' +
          '<div><b>' + esc(d.label) + '</b><div class="hint">' + esc(d.desc) + '</div></div>' + box + '</div></label>';
      }).join('');
      return '<div class="card"><div class="card-head"><div><h2>Kitchen modules</h2>' +
        '<p class="muted">Switch parts of the app on or off. Turning a module off hides its tab and stops it prompting for tasks.</p></div></div>' +
        presetRow + '<div class="module-grid">' + grid + '</div></div>';
    }

    function businessTab() {
      var s = state.settings || {};
      var mgr = isMgr();
      var name = esc(s.businessName || 'The Coach & Horses');
      var eqRows = (state.appliances || []).map(function (a) {
        return '<div class="row"><span class="tick done"></span><div><b>' + esc(a.name) + '</b><br>' +
          '<small>' + esc(a.type) + ' · target ≤ ' + a.target + '°C · critical ' + a.critical + '°C</small></div>' +
          (mgr ? '<div class="btn-row"><button class="btn sm ghost" onclick="editEquipment(\'' + a.id + '\')">Edit</button>' +
            '<button class="btn sm ghost" onclick="removeEquipment(\'' + a.id + '\')">Remove</button></div>' : '') + '</div>';
      }).join('') || '<p class="muted">No equipment added yet.</p>';

      var nameForm = mgr
        ? '<form id="bizForm" class="form"><label>Business name<input name="businessName" value="' + name + '"></label>' +
            '<button class="btn" type="submit" style="justify-content:center">Save business name</button></form>'
        : '<p><b>' + name + '</b></p>';

      return '<div class="grid cols-even">' +
        '<div class="card"><h2>Business</h2>' + nameForm +
          '<div class="set-note">Main Kitchen · Europe/London. Times shown across the app use this timezone.</div></div>' +
        '<div class="card"><div class="card-head"><h2>Equipment</h2>' +
          (mgr ? '<button class="btn sm" onclick="addEquipment()">Add equipment</button>' : '') + '</div>' +
          '<div class="rows" style="margin-top:10px">' + eqRows + '</div>' +
          '<div class="set-note">Fridges, freezers and hot-holding units checked on the Temperatures tab. Target and critical limits drive the pass/exception colours.</div></div>' +
        '</div>';
    }

    function teamTab() {
      var mgr = isMgr();
      var rows = (state.users || []).map(function (u) {
        var role = u.role === 'manager' ? 'Manager' : 'Chef';
        return '<div class="row"><span class="tick ' + (u.active !== false ? 'done' : '') + '"></span>' +
          '<div><b>' + esc(u.name) + '</b><br><small>@' + esc(u.username) + ' · ' + role +
          (u.active === false ? ' · disabled' : '') + '</small></div></div>';
      }).join('') || '<p class="muted">No team members.</p>';
      return '<div class="card"><div class="card-head"><div><h2>Team</h2>' +
        '<p class="muted">Everyone who can sign in. Each person uses their own phone and login.</p></div>' +
        '<button class="btn sm" onclick="route=\'staff\';renderNav();render()">Manage team</button></div>' +
        '<div class="rows" style="margin-top:10px">' + rows + '</div>' +
        (mgr ? '<div class="set-note">Add people, reset passwords and change roles on the full <b>Staff &amp; security</b> screen.</div>'
             : '<div class="set-note">Only a manager can add people or change roles.</div>') + '</div>';
    }

    function probeTab() {
      var s = state.settings || {};
      return '<div class="card"><h2>Bluetooth probe</h2>' +
        '<form id="probeForm" class="form">' +
        '<label>Service UUID<input name="probeService" value="' + esc(s.probeService || '') + '"></label>' +
        '<label>Characteristic UUID<input name="probeChar" value="' + esc(s.probeChar || '') + '"></label>' +
        '<label>Probe serial / asset ID<input name="probeSerial" value="' + esc(s.probeSerial || '') + '"></label>' +
        '<button class="btn" type="submit" style="justify-content:center">Save probe settings</button></form>' +
        '<div class="set-note">These identify your Bluetooth temperature probe so the app can read it directly. Leave blank if you enter temperatures by hand.</div></div>';
    }

    function dataTab() {
      var cfg = serverCfg || { aiEnabled: false, serverStorage: true };
      var aiLine = cfg.aiEnabled
        ? 'AI features are <span class="set-ok">active</span>. The OpenAI key is held securely on the server — staff never see or enter it.'
        : 'AI features are <span class="set-off">off</span>. A manager can add an <code>OPENAI_API_KEY</code> in the Render dashboard to switch them on.';
      return '<div class="grid cols-even">' +
        '<div class="card"><h2>AI assistant</h2><p class="muted">' + aiLine + '</p></div>' +
        '<div class="card"><h2>Backups</h2>' +
          '<p class="muted">Live records are stored on the shared server and saved automatically. Download a JSON copy whenever you want your own backup.</p>' +
          '<div class="btn-row" style="margin-top:8px">' +
            '<button class="btn ghost" onclick="exportJSON()">Download backup</button>' +
            (isMgr()
              ? '<label class="btn ghost" style="margin:0"><input id="impFile" type="file" accept="application/json" hidden onchange="importJSON(this)">Restore from backup</label>'
              : '') +
          '</div>' +
          (isMgr() ? '<div class="set-note">Restoring replaces the shared records for everyone. Use with care.</div>'
                   : '<div class="set-note">Only a manager can restore a backup.</div>') +
        '</div></div>';
    }

    function bodyFor(t) {
      switch (t) {
        case 'business': return businessTab();
        case 'team': return teamTab();
        case 'probe': return probeTab();
        case 'data': return dataTab();
        default: return modulesTab();
      }
    }

    function wireBody() {
      var biz = document.getElementById('bizForm');
      if (biz) biz.onsubmit = function (e) {
        e.preventDefault();
        var f = Object.fromEntries(new FormData(e.target));
        state.settings = state.settings || {};
        state.settings.businessName = (f.businessName || '').trim() || 'The Coach & Horses';
        if (typeof save === 'function') save();
        if (typeof toast === 'function') toast('Business name saved', 'ok');
      };
      var pf = document.getElementById('probeForm');
      if (pf) pf.onsubmit = function (e) {
        e.preventDefault();
        var f = Object.fromEntries(new FormData(e.target));
        state.settings = state.settings || {};
        Object.assign(state.settings, f);
        if (typeof save === 'function') save();
        if (typeof toast === 'function') toast('Probe settings saved', 'ok');
      };
    }

    function renderBody() {
      var host = document.getElementById('settingsBody');
      if (!host) return;
      host.innerHTML = bodyFor(tab);
      wireBody();
    }

    function wireTabs() {
      var btns = document.querySelectorAll('.settings-tabs .stab');
      Array.prototype.forEach.call(btns, function (b) {
        b.onclick = function () {
          tab = b.dataset.t;
          Array.prototype.forEach.call(btns, function (x) { x.classList.toggle('on', x.dataset.t === tab); });
          renderBody();
          if (tab === 'data') loadCfg();
        };
      });
    }

    VIEWS.settings = function () {
      ensureModules();
      var strip = '<div class="settings-tabs">' + TABS.map(function (t) {
        return '<button class="stab ' + (tab === t[0] ? 'on' : '') + '" data-t="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>';
      page('Settings', 'Modules, business, team, equipment and backups', strip + '<div id="settingsBody"></div>');
      wireTabs();
      renderBody();
      if (tab === 'data') loadCfg();
    };
  });
})();
