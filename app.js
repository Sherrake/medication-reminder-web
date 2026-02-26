(function() {
  var REMINDER_OFFSETS = [
    { key: '20b', min: -20, title: '提醒', body: '20 分钟后该吃药了' },
    { key: '10b', min: -10, title: '提醒', body: '10 分钟后该吃药了' },
    { key: '0', min: 0, title: '提醒', body: '到点啦，该吃药了' },
    { key: '10a', min: 10, title: '忘记吃药', body: '已过服药时间 10 分钟，请尽快服药' },
    { key: '30a', min: 30, title: '忘记吃药', body: '已过服药时间 30 分钟，请尽快服药' },
    { key: '60a', min: 60, title: '忘记吃药', body: '已过服药时间 1 小时，请尽快服药' }
  ];

  var SYNC_KEY = 'med_sync_code';
  var schedules = [];
  var takens = {};
  var editingIds = null;

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function getSyncCode() {
    return (typeof localStorage !== 'undefined' && localStorage.getItem(SYNC_KEY)) || '';
  }
  function setSyncCode(code) {
    if (typeof localStorage !== 'undefined') localStorage.setItem(SYNC_KEY, code);
  }

  function randomCode() {
    var s = 'abcdefghjkmnpqrstuvwxyz23456789';
    var out = '';
    for (var i = 0; i < 6; i++) out += s[Math.floor(Math.random() * s.length)];
    return out;
  }

  function useFirebase() {
    return typeof db === 'undefined' ? false : db !== null;
  }

  async function getSchedules() {
    var code = getSyncCode();
    if (!code) return [];
    if (useFirebase()) {
      var snap = await db.collection('schedules').where('syncCode', '==', code).get();
      return snap.docs.map(function(d) {
        var x = d.data();
        return { id: d.id, name: x.name, dosage: x.dosage || '', time: x.time };
      });
    }
    try {
      var raw = localStorage.getItem('med_schedules_' + code);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  async function getTakens(date) {
    var code = getSyncCode();
    if (!code) return {};
    if (useFirebase()) {
      var snap = await db.collection('takens').where('syncCode', '==', code).where('date', '==', date).get();
      var out = {};
      snap.docs.forEach(function(d) {
        var x = d.data();
        out[x.scheduleId] = x.takenAt;
      });
      return out;
    }
    var raw = localStorage.getItem('med_takens_' + code);
    var all = raw ? JSON.parse(raw) : {};
    return all[date] || {};
  }

  async function postTake(scheduleId, date) {
    var code = getSyncCode();
    var takenAt = new Date().toISOString();
    if (useFirebase()) {
      var docId = scheduleId + '_' + date;
      await db.collection('takens').doc(docId).set({
        syncCode: code,
        scheduleId: scheduleId,
        date: date,
        takenAt: takenAt
      });
      return;
    }
    var key = 'med_takens_' + code;
    var all = JSON.parse(localStorage.getItem(key) || '{}');
    if (!all[date]) all[date] = {};
    all[date][scheduleId] = takenAt;
    localStorage.setItem(key, JSON.stringify(all));
  }

  async function deleteTake(scheduleId, date) {
    var code = getSyncCode();
    if (useFirebase()) {
      await db.collection('takens').doc(scheduleId + '_' + date).delete();
      return;
    }
    var key = 'med_takens_' + code;
    var all = JSON.parse(localStorage.getItem(key) || '{}');
    if (all[date]) {
      delete all[date][scheduleId];
      if (Object.keys(all[date]).length === 0) delete all[date];
    }
    localStorage.setItem(key, JSON.stringify(all));
  }

  async function postSchedules(name, dosage, times) {
    var code = getSyncCode();
    if (useFirebase()) {
      for (var i = 0; i < times.length; i++) {
        await db.collection('schedules').add({
          syncCode: code,
          name: name,
          dosage: dosage || '',
          time: times[i]
        });
      }
      return;
    }
    var key = 'med_schedules_' + code;
    var list = JSON.parse(localStorage.getItem(key) || '[]');
    times.forEach(function(t) {
      list.push({
        id: 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        name: name,
        dosage: dosage || '',
        time: t
      });
    });
    localStorage.setItem(key, JSON.stringify(list));
  }

  async function deleteSchedules(ids) {
    var code = getSyncCode();
    if (useFirebase()) {
      var batch = db.batch();
      var takensSnap = await db.collection('takens').get();
      takensSnap.docs.forEach(function(d) {
        var data = d.data();
        if (data.syncCode === code && ids.indexOf(data.scheduleId) !== -1) batch.delete(d.ref);
      });
      ids.forEach(function(id) { batch.delete(db.collection('schedules').doc(id)); });
      await batch.commit();
      return;
    }
    var key = 'med_schedules_' + code;
    var list = JSON.parse(localStorage.getItem(key) || '[]').filter(function(s) { return ids.indexOf(s.id) === -1; });
    var takensKey = 'med_takens_' + code;
    var allTakens = JSON.parse(localStorage.getItem(takensKey) || '{}');
    ids.forEach(function(id) {
      for (var date in allTakens) {
        if (allTakens[date][id]) delete allTakens[date][id];
      }
    });
    localStorage.setItem(key, JSON.stringify(list));
    localStorage.setItem(takensKey, JSON.stringify(allTakens));
  }

  function reminderKey(scheduleId, date, key) {
    return 'reminder_' + scheduleId + '_' + date + '_' + key;
  }
  function parseTimeHHmm(timeStr) {
    var p = timeStr.split(':').map(Number);
    return (p[0] || 0) * 60 + (p[1] || 0);
  }
  function getScheduledMinutesToday(timeStr) {
    var p = timeStr.split(':').map(Number);
    return (p[0] || 0) * 60 + (p[1] || 0);
  }
  function checkReminders(schedulesList, takensMap, date) {
    var now = new Date();
    var nowMinutes = now.getHours() * 60 + now.getMinutes();
    var today = date || todayStr();
    schedulesList.forEach(function(s) {
      if (takensMap[s.id]) return;
      var scheduledMin = getScheduledMinutesToday(s.time);
      REMINDER_OFFSETS.forEach(function(r) {
        var targetMin = scheduledMin + r.min;
        if (nowMinutes < targetMin || nowMinutes >= targetMin + 1) return;
        var keyStr = reminderKey(s.id, today, r.key);
        if (sessionStorage.getItem(keyStr)) return;
        sessionStorage.setItem(keyStr, '1');
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(r.title + '：' + s.name, { body: r.body });
        }
      });
    });
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function renderToday() {
    var date = todayStr();
    document.getElementById('todayDate').textContent = '日期：' + date;
    var list = document.getElementById('scheduleList');
    var empty = document.getElementById('emptyTip');
    var items = schedules.slice().sort(function(a, b) { return parseTimeHHmm(a.time) - parseTimeHHmm(b.time); });
    list.innerHTML = '';
    if (items.length === 0) {
      empty.classList.add('visible');
      return;
    }
    empty.classList.remove('visible');
    items.forEach(function(s) {
      var taken = !!takens[s.id];
      var li = document.createElement('li');
      li.className = 'schedule-item' + (taken ? ' taken' : '');
      li.innerHTML =
        '<span class="time">' + s.time + '</span>' +
        '<span class="name-wrap">' +
          '<span class="name">' + escapeHtml(s.name) + '</span>' +
          (s.dosage ? ' <span class="dosage">' + escapeHtml(s.dosage) + '</span>' : '') +
        '</span>' +
        (taken ? '<span class="taken-badge">已服用</span>' : '') +
        '<button type="button" class="toggle-taken' + (taken ? ' taken' : '') + '" data-id="' + escapeHtml(String(s.id)) + '" aria-label="标记已服用">' +
        (taken ? '✓' : '') + '</button>';
      list.appendChild(li);
    });
    list.querySelectorAll('.toggle-taken').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var id = btn.getAttribute('data-id');
        if (takens[id]) await deleteTake(id, date);
        else await postTake(id, date);
        takens = await getTakens(date);
        renderToday();
      });
    });
  }

  function groupSchedules() {
    var map = {};
    schedules.forEach(function(s) {
      var k = (s.name || '') + '\0' + (s.dosage || '');
      if (!map[k]) map[k] = [];
      map[k].push(s);
    });
    return Object.values(map);
  }

  function renderMedList() {
    var list = document.getElementById('medList');
    var groups = groupSchedules();
    list.innerHTML = '';
    groups.forEach(function(group) {
      var first = group[0];
      var times = group.map(function(s) { return s.time; }).sort(function(a, b) { return parseTimeHHmm(a) - parseTimeHHmm(b); });
      var ids = group.map(function(s) { return s.id; });
      var li = document.createElement('li');
      li.className = 'med-item';
      li.innerHTML =
        '<div class="info">' +
          '<div class="name-line">' +
            '<span class="name">' + escapeHtml(first.name) + '</span>' +
            (first.dosage ? ' <span class="dosage">' + escapeHtml(first.dosage) + '</span>' : '') +
          '</div>' +
          '<div class="times">' + times.join('、') + '</div>' +
        '</div>' +
        '<div class="actions">' +
          '<button type="button" class="btn-icon edit" data-ids="' + ids.map(function(id) { return escapeHtml(String(id)); }).join(',') + '" aria-label="编辑">✎</button>' +
          '<button type="button" class="btn-icon delete" data-ids="' + ids.map(function(id) { return escapeHtml(String(id)); }).join(',') + '" aria-label="删除">×</button>' +
        '</div>';
      list.appendChild(li);
    });
    list.querySelectorAll('.edit').forEach(function(btn) {
      btn.addEventListener('click', function() {
        openEditModal(btn.getAttribute('data-ids').split(','));
      });
    });
    list.querySelectorAll('.delete').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        if (!confirm('确定删除该药物及所有服药时间？')) return;
        await deleteSchedules(btn.getAttribute('data-ids').split(','));
        load();
      });
    });
  }

  function addTimeRow(container, value) {
    var row = document.createElement('div');
    row.className = 'time-row';
    var input = document.createElement('input');
    input.type = 'time';
    input.value = value || '08:00';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'remove-time';
    btn.textContent = '×';
    btn.addEventListener('click', function() { row.remove(); });
    row.appendChild(input);
    row.appendChild(btn);
    container.appendChild(row);
  }

  function openAddModal() {
    editingIds = null;
    document.getElementById('modalTitle').textContent = '添加药物';
    document.getElementById('medId').value = '';
    document.getElementById('medName').value = '';
    document.getElementById('medDosage').value = '';
    var container = document.getElementById('timeInputs');
    container.innerHTML = '';
    addTimeRow(container, '08:00');
    document.getElementById('medModal').showModal();
  }

  function openEditModal(ids) {
    editingIds = ids;
    var group = schedules.filter(function(s) { return ids.indexOf(String(s.id)) !== -1; });
    var first = group[0];
    document.getElementById('modalTitle').textContent = '编辑药物';
    document.getElementById('medId').value = ids[0];
    document.getElementById('medName').value = first.name;
    document.getElementById('medDosage').value = first.dosage || '';
    var container = document.getElementById('timeInputs');
    container.innerHTML = '';
    group.slice().sort(function(a, b) { return parseTimeHHmm(a.time) - parseTimeHHmm(b.time); }).forEach(function(s) {
      addTimeRow(container, s.time);
    });
    document.getElementById('medModal').showModal();
  }

  async function load() {
    schedules = await getSchedules();
    takens = await getTakens(todayStr());
    renderToday();
    renderMedList();
  }

  function showNotifyStatus(text, isSuccess) {
    var el = document.getElementById('notifyStatus');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    el.className = 'notify-status ' + (isSuccess ? 'notify-ok' : 'notify-warn');
    setTimeout(function() { el.hidden = true; }, 3000);
  }

  function showApp() {
    document.getElementById('syncScreen').classList.add('hidden');
    document.getElementById('appMain').hidden = false;
    document.getElementById('syncCodeDisplay').textContent = getSyncCode();
    load();
    setInterval(function() {
      checkReminders(schedules, takens, todayStr());
    }, 30 * 1000);
    setTimeout(function() { checkReminders(schedules, takens, todayStr()); }, 500);
  }

  function initSync() {
    var code = getSyncCode();
    if (code) {
      showApp();
      return;
    }
    document.getElementById('appMain').hidden = true;
    document.getElementById('syncScreen').classList.remove('hidden');

    document.getElementById('btnConfirmSync').onclick = function() {
      var input = document.getElementById('syncCodeInput').value.trim().toLowerCase();
      if (!input) {
        alert('请输入同步码或点击「生成新码」');
        return;
      }
      setSyncCode(input);
      document.getElementById('syncCodeInput').value = '';
      showApp();
    };

    document.getElementById('btnNewSync').onclick = function() {
      var newCode = randomCode();
      setSyncCode(newCode);
      document.getElementById('syncCodeInput').value = '';
      showApp();
    };
  }

  document.getElementById('btnChangeSync').onclick = function() {
    setSyncCode('');
    document.getElementById('syncScreen').classList.remove('hidden');
    document.getElementById('appMain').hidden = true;
    document.getElementById('syncCodeInput').value = '';
  };

  document.getElementById('btnAddMed').addEventListener('click', openAddModal);
  document.getElementById('btnAddTime').addEventListener('click', function() {
    addTimeRow(document.getElementById('timeInputs'), '12:00');
  });
  document.getElementById('btnCancel').addEventListener('click', function() {
    document.getElementById('medModal').close();
  });
  document.getElementById('medForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    var name = document.getElementById('medName').value.trim();
    var dosage = document.getElementById('medDosage').value.trim();
    var timeInputs = document.getElementById('timeInputs').querySelectorAll('input[type="time"]');
    var times = Array.from(timeInputs).map(function(i) { return i.value; }).filter(Boolean);
    if (!times.length) {
      alert('请至少添加一个服药时间');
      return;
    }
    if (editingIds && editingIds.length) await deleteSchedules(editingIds);
    await postSchedules(name, dosage, times);
    document.getElementById('medModal').close();
    load();
  });

  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    document.getElementById('btnNotify').hidden = false;
    document.getElementById('btnNotify').onclick = async function() {
      var result = await Notification.requestPermission();
      document.getElementById('btnNotify').hidden = true;
      if (result === 'granted') {
        showNotifyStatus('已开启提醒通知，到点会收到推送', true);
      } else {
        showNotifyStatus('您已拒绝通知，到点将无法收到系统提醒', false);
        document.getElementById('btnNotify').hidden = false;
      }
    };
  } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    document.getElementById('btnNotify').hidden = true;
  }

  initSync();
})();
