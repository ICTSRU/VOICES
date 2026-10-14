/**
 * ============================================================================
 *  SRU Voice – منصة صوت الطالب
 *  Backend: Google Apps Script bound to a Google Sheet
 *  Version: 1.3
 *  Owner:   ICTD – IT Operations Center (ITOC), Sulaiman Al Rajhi University
 * ============================================================================
 *  How it works
 *  - The GitHub-hosted index.html signs the student in with Google Identity
 *    Services and sends the Google ID token with every request.
 *  - This script verifies the token (audience, verified e-mail, allowed
 *    domain), then reads/writes the sheets below.
 *  - All requests are POST with a JSON body (Content-Type: text/plain to
 *    avoid a CORS pre-flight).
 *
 *  First-time setup: fill CFG, run setup() once, run installTriggers() once,
 *  then Deploy ▸ New deployment ▸ Web app (Execute as: Me, Access: Anyone).
 * ============================================================================
 */

const CFG = {
  VERSION: '1.3',
  // OAuth 2.0 Web Client ID (Google Cloud Console ▸ APIs & Services ▸ Credentials)
  CLIENT_ID: 'PASTE_YOUR_CLIENT_ID.apps.googleusercontent.com',
  // Accounts allowed to sign in (students + staff)
  ALLOWED_DOMAINS: ['sr.edu.sa', 'srcolleges.org'],
  // Optional hard-coded admins; the "Admins" sheet is also read
  ADMIN_EMAILS: [],
  TIMEZONE: 'Asia/Riyadh',
  ID_PREFIX: 'SV',
  MAX_SUBMISSIONS_PER_DAY: 5,
  MAX_TITLE: 120,
  MAX_DESCRIPTION: 2000,
  SEND_ACK_EMAIL: true,            // confirmation e-mail to the student
  NOTIFY_ADMINS_ON_NEW: true,      // alert admins on every new submission
  NOTIFY_STUDENT_ON_STATUS: true,  // e-mail the student when the stage changes
  SLA_DAYS: 5,                     // daily reminder for items untouched longer than this
  PLATFORM_URL: 'https://ictsru.github.io/sru-voice/'
};

const SHEETS = {
  Submissions: ['id', 'created_at', 'type', 'category', 'title', 'description', 'location',
    'is_public', 'anonymous', 'student_email', 'student_name', 'status', 'approved_public',
    'votes', 'assigned_to', 'admin_response', 'internal_note', 'improvement_summary',
    'updated_at', 'closed_at'],
  Votes: ['id', 'email', 'voted_at'],
  StatusLog: ['id', 'at', 'by', 'from_status', 'to_status', 'note', 'visible_to_student'],
  SignInLog: ['email', 'name', 'date', 'time', 'user_agent'],
  Admins: ['email', 'name', 'added_at']
};

const CATEGORIES = {
  academic: 'الشؤون الأكاديمية والمقررات',
  student_services: 'الخدمات الطلابية',
  it: 'الخدمات التقنية والأنظمة',
  facilities: 'المرافق والقاعات',
  library: 'المكتبة ومصادر التعلم',
  activities: 'الأنشطة الطلابية',
  transport_housing: 'السكن والنقل',
  dining: 'الإعاشة والمقاهي',
  other: 'أخرى'
};

const STATUSES = {
  new: 'جديد',
  review: 'قيد المراجعة',
  study: 'قيد الدراسة',
  approved: 'معتمد للتنفيذ',
  in_progress: 'قيد التنفيذ',
  done: 'تم التنفيذ',
  rejected: 'غير معتمد'
};

const TYPES = { suggestion: 'مقترح', complaint: 'شكوى' };

/* ============================== Setup ===================================== */

function setup() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(CFG.TIMEZONE);
  Object.keys(SHEETS).forEach(function (name) {
    let s = ss.getSheetByName(name);
    if (!s) s = ss.insertSheet(name);
    const h = SHEETS[name];
    s.getRange(1, 1, 1, h.length).setValues([h])
      .setFontWeight('bold').setFontColor('#ffffff').setBackground('#501e8c');
    s.setFrozenRows(1);
    s.setRightToLeft(true);
  });
  const def = ss.getSheetByName('Sheet1') || ss.getSheetByName('ورقة1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  SpreadsheetApp.getUi && Logger.log('SRU Voice sheets ready.');
}

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'slaReminder') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('slaReminder').timeBased().everyDays(1).atHour(8)
    .inTimezone(CFG.TIMEZONE).create();
}

/* ============================== HTTP ====================================== */

function doGet() {
  return json_({ ok: true, data: { app: 'SRU Voice', version: CFG.VERSION } });
}

function doPost(e) {
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    out = { ok: true, data: route_(req) };
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return json_(out);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

function route_(req) {
  if (req.action === 'ping') return { version: CFG.VERSION };
  const user = verifyToken_(req.token);
  user.isAdmin = isAdmin_(user.email);

  switch (req.action) {
    case 'login': logSignIn_(user, req.ua); return user;
    case 'stats': return stats_();
    case 'submit': return submit_(user, req.data || {});
    case 'mine': return mine_(user);
    case 'ideas': return ideas_(user);
    case 'vote': return vote_(user, req.id);
    case 'improvements': return improvements_();
    case 'admin_list': requireAdmin_(user); return adminList_();
    case 'admin_update': requireAdmin_(user); return adminUpdate_(user, req.data || {});
    default: throw new Error('UNKNOWN_ACTION');
  }
}

/* ============================== Auth ====================================== */

function verifyToken_(idToken) {
  if (!idToken) throw new Error('AUTH_REQUIRED');
  const cache = CacheService.getScriptCache();
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken);
  const key = 'tk_' + Utilities.base64EncodeWebSafe(digest).slice(0, 43);
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' +
    encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('AUTH_INVALID');
  const p = JSON.parse(res.getContentText());

  if (p.aud !== CFG.CLIENT_ID) throw new Error('AUTH_INVALID');
  if (String(p.email_verified) !== 'true') throw new Error('AUTH_INVALID');
  const email = String(p.email || '').toLowerCase();
  const domain = email.split('@')[1] || '';
  if (CFG.ALLOWED_DOMAINS.indexOf(domain) === -1) throw new Error('AUTH_DOMAIN');

  const user = { email: email, name: p.name || email.split('@')[0], picture: p.picture || '' };
  const ttl = Math.max(60, Math.min(21600, Number(p.exp) - Math.floor(Date.now() / 1000)));
  cache.put(key, JSON.stringify(user), ttl);
  return user;
}

function isAdmin_(email) {
  const list = CFG.ADMIN_EMAILS.map(function (x) { return String(x).toLowerCase(); });
  rows_('Admins').forEach(function (r) { list.push(String(r.email).toLowerCase().trim()); });
  return list.indexOf(email) !== -1;
}

function requireAdmin_(user) { if (!user.isAdmin) throw new Error('FORBIDDEN'); }

function logSignIn_(user, ua) {
  const now = new Date();
  append_('SignInLog', {
    email: user.email, name: user.name,
    date: Utilities.formatDate(now, CFG.TIMEZONE, 'yyyy-MM-dd'),
    time: Utilities.formatDate(now, CFG.TIMEZONE, 'HH:mm:ss'),
    user_agent: String(ua || '').slice(0, 250)
  });
}

/* ============================== Actions =================================== */

function submit_(user, d) {
  const type = TYPES[d.type] ? d.type : null;
  const category = CATEGORIES[d.category] ? d.category : null;
  const title = clean_(d.title, CFG.MAX_TITLE);
  const description = clean_(d.description, CFG.MAX_DESCRIPTION);
  if (!type || !category || title.length < 5 || description.length < 15) throw new Error('INVALID_INPUT');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const all = rows_('Submissions');
    const today = now_().slice(0, 10);
    const todayCount = all.filter(function (r) {
      return r.student_email === user.email && String(r.created_at).slice(0, 10) === today;
    }).length;
    if (todayCount >= CFG.MAX_SUBMISSIONS_PER_DAY) throw new Error('RATE_LIMIT');

    const id = nextId_(all);
    const stamp = now_();
    const rec = {
      id: id, created_at: stamp, type: type, category: category, title: title,
      description: description, location: clean_(d.location, 120),
      is_public: type === 'suggestion' && !!d.is_public, anonymous: !!d.anonymous,
      student_email: user.email, student_name: user.name, status: 'new',
      approved_public: false, votes: 0, assigned_to: '', admin_response: '',
      internal_note: '', improvement_summary: '', updated_at: stamp, closed_at: ''
    };
    append_('Submissions', rec);
    append_('StatusLog', { id: id, at: stamp, by: 'system', from_status: '', to_status: 'new',
      note: 'تم استلام الطلب', visible_to_student: true });
    try { notifyNew_(rec); } catch (e) { Logger.log(e); }
    return { id: id };
  } finally { lock.releaseLock(); }
}

function mine_(user) {
  const logs = rows_('StatusLog');
  return rows_('Submissions')
    .filter(function (r) { return r.student_email === user.email; })
    .sort(byDateDesc_)
    .map(function (r) {
      return {
        id: r.id, created_at: r.created_at, type: r.type, category: r.category, title: r.title,
        description: r.description, location: r.location, status: r.status,
        is_public: bool_(r.is_public), approved_public: bool_(r.approved_public),
        anonymous: bool_(r.anonymous), votes: Number(r.votes) || 0,
        admin_response: r.admin_response, improvement_summary: r.improvement_summary,
        updated_at: r.updated_at,
        logs: logs.filter(function (l) { return l.id === r.id && bool_(l.visible_to_student); })
          .map(function (l) { return { at: l.at, to_status: l.to_status, note: l.note }; })
      };
    });
}

function ideas_(user) {
  const votes = rows_('Votes');
  return rows_('Submissions')
    .filter(isPublicIdea_)
    .map(function (r) {
      const vs = votes.filter(function (v) { return v.id === r.id; });
      return {
        id: r.id, created_at: r.created_at, category: r.category, title: r.title,
        description: r.description, status: r.status, votes: vs.length,
        voted: vs.some(function (v) { return v.email === user.email; }),
        mine: r.student_email === user.email,
        author: bool_(r.anonymous) ? '' : r.student_name,
        improvement_summary: r.status === 'done' ? r.improvement_summary : ''
      };
    });
}

function vote_(user, id) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sub = rows_('Submissions').filter(function (r) { return r.id === id; })[0];
    if (!sub || !isPublicIdea_(sub)) throw new Error('NOT_FOUND');
    if (sub.student_email === user.email) throw new Error('OWN_IDEA');
    if (sub.status === 'done' || sub.status === 'rejected') throw new Error('VOTING_CLOSED');

    const s = sh_('Votes');
    const votes = rows_('Votes');
    const existing = votes.filter(function (v) { return v.id === id && v.email === user.email; })[0];
    if (existing) s.deleteRow(existing._row);
    else append_('Votes', { id: id, email: user.email, voted_at: now_() });

    const count = votes.filter(function (v) { return v.id === id; }).length + (existing ? -1 : 1);
    update_('Submissions', sub._row, { votes: count });
    return { id: id, votes: count, voted: !existing };
  } finally { lock.releaseLock(); }
}

function improvements_() {
  return rows_('Submissions')
    .filter(function (r) { return r.status === 'done' && String(r.improvement_summary).trim(); })
    .sort(function (a, b) { return String(b.closed_at).localeCompare(String(a.closed_at)); })
    .map(function (r) {
      const pub = isPublicIdea_(r);
      return {
        id: r.id, category: r.category, type: r.type,
        title: pub ? r.title : '',               // complaints stay private
        improvement_summary: r.improvement_summary,
        votes: Number(r.votes) || 0, closed_at: r.closed_at, created_at: r.created_at
      };
    });
}

function stats_() {
  const all = rows_('Submissions');
  const count = function (f) { return all.filter(f).length; };
  const done = all.filter(function (r) { return r.status === 'done'; });
  const days = done.map(function (r) { return daysBetween_(r.created_at, r.closed_at); })
    .filter(function (n) { return n >= 0; });
  const decided = all.length - count(function (r) { return r.status === 'rejected'; });
  return {
    total: all.length,
    suggestions: count(function (r) { return r.type === 'suggestion'; }),
    complaints: count(function (r) { return r.type === 'complaint'; }),
    public_ideas: count(isPublicIdea_),
    in_progress: count(function (r) { return ['study', 'approved', 'in_progress'].indexOf(r.status) !== -1; }),
    done: done.length,
    completion_rate: decided ? Math.round(done.length * 100 / decided) : 0,
    avg_days_to_close: days.length ? Math.round(days.reduce(function (a, b) { return a + b; }, 0) / days.length) : 0,
    votes: rows_('Votes').length
  };
}

function adminList_() {
  const logs = rows_('StatusLog');
  return rows_('Submissions').sort(byDateDesc_).map(function (r) {
    const o = {};
    SHEETS.Submissions.forEach(function (k) { o[k] = r[k]; });
    ['is_public', 'anonymous', 'approved_public'].forEach(function (k) { o[k] = bool_(o[k]); });
    o.votes = Number(o.votes) || 0;
    o.logs = logs.filter(function (l) { return l.id === r.id; }).map(function (l) {
      return { at: l.at, by: l.by, from_status: l.from_status, to_status: l.to_status,
        note: l.note, visible_to_student: bool_(l.visible_to_student) };
    });
    return o;
  });
}

function adminUpdate_(user, d) {
  if (d.status && !STATUSES[d.status]) throw new Error('INVALID_INPUT');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sub = rows_('Submissions').filter(function (r) { return r.id === d.id; })[0];
    if (!sub) throw new Error('NOT_FOUND');
    const stamp = now_();
    const patch = { updated_at: stamp };
    ['assigned_to', 'admin_response', 'internal_note', 'improvement_summary'].forEach(function (k) {
      if (k in d) patch[k] = clean_(d[k], 2000);
    });
    if ('approved_public' in d) patch.approved_public = !!d.approved_public;
    const changed = d.status && d.status !== sub.status;
    if (changed) {
      patch.status = d.status;
      patch.closed_at = (d.status === 'done' || d.status === 'rejected') ? stamp : '';
    }
    update_('Submissions', sub._row, patch);

    const note = clean_(d.log_note, 500);
    if (changed || note) {
      append_('StatusLog', {
        id: sub.id, at: stamp, by: user.email, from_status: sub.status,
        to_status: changed ? d.status : sub.status,
        note: note || (changed ? 'تحديث المرحلة إلى: ' + STATUSES[d.status] : ''),
        visible_to_student: d.log_visible !== false
      });
    }
    if (changed) { try { notifyStatus_(sub, d.status, patch.admin_response || sub.admin_response); } catch (e) { Logger.log(e); } }
    return { id: sub.id };
  } finally { lock.releaseLock(); }
}

/* ============================== Automation ================================ */

function notifyNew_(rec) {
  const body = function (intro) {
    return mailShell_(intro +
      '<table style="border-collapse:collapse;margin-top:12px">' +
      row_('رقم الطلب', rec.id) + row_('النوع', TYPES[rec.type]) +
      row_('التصنيف', CATEGORIES[rec.category]) + row_('العنوان', esc_(rec.title)) +
      '</table>');
  };
  if (CFG.SEND_ACK_EMAIL) {
    MailApp.sendEmail({
      to: rec.student_email, name: 'SRU Voice – صوت الطالب',
      subject: 'تم استلام طلبك ' + rec.id + ' | SRU Voice',
      htmlBody: body('<p>شكرًا لمشاركتك. تم استلام طلبك وسيُراجع خلال أيام العمل القادمة، ويمكنك متابعة مراحله من صفحة «طلباتي».</p>')
    });
  }
  const admins = adminEmails_();
  if (CFG.NOTIFY_ADMINS_ON_NEW && admins.length) {
    MailApp.sendEmail({
      to: admins.join(','), name: 'SRU Voice – صوت الطالب',
      subject: 'طلب جديد ' + rec.id + ' – ' + TYPES[rec.type],
      htmlBody: body('<p>ورد طلب جديد عبر منصة صوت الطالب.</p>')
    });
  }
}

function notifyStatus_(sub, status, response) {
  if (!CFG.NOTIFY_STUDENT_ON_STATUS) return;
  MailApp.sendEmail({
    to: sub.student_email, name: 'SRU Voice – صوت الطالب',
    subject: 'تحديث على طلبك ' + sub.id + ': ' + STATUSES[status],
    htmlBody: mailShell_('<p>انتقل طلبك «' + esc_(sub.title) + '» إلى مرحلة: <b>' + STATUSES[status] + '</b>.</p>' +
      (response ? '<p><b>رد الجهة المختصة:</b><br>' + esc_(response) + '</p>' : ''))
  });
}

/** Daily: remind admins of items still "new"/"review" after SLA_DAYS. */
function slaReminder() {
  const admins = adminEmails_();
  if (!admins.length) return;
  const late = rows_('Submissions').filter(function (r) {
    return (r.status === 'new' || r.status === 'review') && daysBetween_(r.updated_at, now_()) >= CFG.SLA_DAYS;
  });
  if (!late.length) return;
  MailApp.sendEmail({
    to: admins.join(','), name: 'SRU Voice – صوت الطالب',
    subject: 'تذكير: ' + late.length + ' طلبات تجاوزت ' + CFG.SLA_DAYS + ' أيام دون تحديث',
    htmlBody: mailShell_('<p>الطلبات التالية لم تُحدّث منذ ' + CFG.SLA_DAYS + ' أيام أو أكثر:</p><table style="border-collapse:collapse">' +
      late.map(function (r) { return row_(r.id, esc_(r.title) + ' — ' + STATUSES[r.status]); }).join('') + '</table>')
  });
}

function adminEmails_() {
  const list = CFG.ADMIN_EMAILS.slice();
  rows_('Admins').forEach(function (r) { if (r.email) list.push(String(r.email).trim()); });
  return list.filter(function (x, i, a) { return x && a.indexOf(x) === i; });
}

function mailShell_(inner) {
  return '<div dir="rtl" style="font-family:Tahoma,Arial;color:#241436;max-width:600px">' +
    '<div style="background:#501e8c;color:#fff;padding:14px 18px;font-size:18px;font-weight:bold">صوت الطالب | SRU Voice</div>' +
    '<div style="padding:18px;border:1px solid #e6dff0;border-top:0">' + inner +
    '<p style="margin-top:18px"><a href="' + CFG.PLATFORM_URL + '" style="background:#501e8c;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none">فتح المنصة</a></p>' +
    '</div><div style="font-size:12px;color:#6b5a80;padding:8px 0">الإدارة التنفيذية للاتصالات وتقنية المعلومات – جامعة سليمان الراجحي</div></div>';
}
function row_(k, v) {
  return '<tr><td style="padding:6px 10px;background:#f0ebf8;font-weight:bold">' + k +
    '</td><td style="padding:6px 10px;border-bottom:1px solid #eee">' + v + '</td></tr>';
}

/* ============================== Helpers =================================== */

function sh_(name) {
  const ss = SpreadsheetApp.getActive();
  let s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]);
  }
  return s;
}

function rows_(name) {
  const s = sh_(name);
  if (s.getLastRow() < 2) return [];
  const h = SHEETS[name];
  const v = s.getRange(2, 1, s.getLastRow() - 1, h.length).getValues();
  const out = [];
  v.forEach(function (r, i) {
    if (r[0] === '' || r[0] === null) return;
    const o = { _row: i + 2 };
    h.forEach(function (k, j) {
      const x = r[j];
      o[k] = x instanceof Date ? Utilities.formatDate(x, CFG.TIMEZONE, 'yyyy-MM-dd HH:mm') : x;
    });
    out.push(o);
  });
  return out;
}

function append_(name, obj) {
  sh_(name).appendRow(SHEETS[name].map(function (k) { return safe_(obj[k]); }));
}

function update_(name, rowNum, obj) {
  const s = sh_(name), h = SHEETS[name];
  const rng = s.getRange(rowNum, 1, 1, h.length);
  const cur = rng.getValues()[0];
  h.forEach(function (k, j) { if (k in obj) cur[j] = safe_(obj[k]); });
  rng.setValues([cur]);
}

/** Neutralise spreadsheet formula injection. */
function safe_(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

function clean_(v, max) { return String(v == null ? '' : v).replace(/\s+$/, '').trim().slice(0, max); }
function bool_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
function now_() { return Utilities.formatDate(new Date(), CFG.TIMEZONE, 'yyyy-MM-dd HH:mm'); }
function esc_(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function byDateDesc_(a, b) { return String(b.created_at).localeCompare(String(a.created_at)); }
function isPublicIdea_(r) {
  return r.type === 'suggestion' && bool_(r.is_public) && bool_(r.approved_public) && r.status !== 'rejected';
}
function daysBetween_(a, b) {
  const pa = parseDT_(a), pb = parseDT_(b);
  if (!pa || !pb) return -1;
  return Math.floor((pb - pa) / 86400000);
}
function parseDT_(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null;
}
function nextId_(all) {
  const year = now_().slice(0, 4);
  const prefix = CFG.ID_PREFIX + '-' + year + '-';
  let max = 0;
  all.forEach(function (r) {
    if (String(r.id).indexOf(prefix) === 0) max = Math.max(max, parseInt(String(r.id).slice(prefix.length), 10) || 0);
  });
  return prefix + ('000' + (max + 1)).slice(-4);
}
