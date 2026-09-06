/**
 * ScheduleApp — Sheet API  (P1)
 *
 * The JSON API the PWA talks to. Google Sheets is the system of record (ADR-0001);
 * this script is the only thing that touches it.
 *
 * Two endpoints:
 *   GET  ?action=schedule   -> the whole schedule + a content hash
 *   POST {action:'save'}    -> replace the whole schedule, guarded by that hash
 *
 * Design rules this file exists to enforce (CLAUDE.md, ADR-0003):
 *   - Whole-sheet reads and writes. Never per-row surgery, never a cached row index.
 *   - Every write holds LockService and flushes before releasing.
 *   - Every write is guarded by a content hash, which is what catches the owner
 *     hand-editing the Sheet — a conflict no version counter would ever notice.
 *   - Every cell is text on the way in and out. Sheets coerces "11:00" to a time and
 *     "60" to a number given the chance, so the data range is formatted as plain text.
 *   - duration_min is canonical; end time is always derived, never stored.
 *
 * CORS notes, learned the hard way in P0:
 *   - A GET answers through a 302 to script.googleusercontent.com. fetch() follows it
 *     and the final response carries permissive CORS headers, so GETs work.
 *   - POST must be sent as Content-Type: text/plain. It is CORS-safelisted, so no
 *     preflight — and Apps Script cannot answer a preflight OPTIONS at all. The body
 *     is still JSON; we parse it ourselves.
 *   - There is no way to set a meaningful HTTP status. Every response is 200 and
 *     failures are reported in the body as {ok:false, code:'...'}. Clients must check
 *     the body, not the status.
 *
 * Measured latency (ADR-0005): ~1.5s fixed overhead per call, ~2.6s a full read,
 * ~4s a full write. All of it is meant to sit off the critical path.
 */

var SHARED_SECRET = 'CHANGE_ME_BEFORE_DEPLOY';

var SCHEMA_VERSION = '3';   // 2 adds events.icon; 3 adds the categories tab

var TAB = { events: 'events', templates: 'templates', categories: 'categories',
            settings: 'settings', meta: 'meta' };

var COLS = {
  events:    ['id', 'day', 'start', 'duration_min', 'title', 'colour', 'icon', 'category', 'note'],
  templates: ['id', 'title', 'colour', 'icon', 'duration_min', 'category'],
  categories: ['id', 'name'],
  settings:  ['key', 'value'],
  meta:      ['key', 'value']
};

// Colour is a palette token, never a free hex value (ADR-0002). Anything outside this
// list is rejected, so a typo can't quietly produce an uncoloured event.
var PALETTE = ['slate', 'blue', 'red', 'amber', 'green', 'violet', 'teal', 'rose'];

var LIMITS = { title: 100, note: 500, icon: 12, category: 40, name: 60,
               events: 500, templates: 50, categories: 20 };

/* =============================================================== endpoints ==== */

function doGet(e) {
  var t0 = Date.now();
  var p = (e && e.parameter) || {};
  try {
    if (p.secret !== SHARED_SECRET) return out_({ ok: false, code: 'unauthorized' }, t0);

    switch (p.action || 'schedule') {
      case 'ping':
        return out_({ ok: true, schema_version: SCHEMA_VERSION }, t0);

      case 'schedule':
        return out_(readSchedule_(), t0);

      // Read-only: lets a client see whether the sheet needs migrating. The
      // migration itself lives in Migrations.gs and is run by hand from the editor.
      case 'status':
        return out_({
          ok: true,
          schema_version: SCHEMA_VERSION,
          sheet_version: sheetVersion_(),
          migration_needed: pendingMigrations_(sheetVersion_()).length > 0
        }, t0);

      default:
        return out_({ ok: false, code: 'bad_request',
                      message: 'unknown action: ' + p.action }, t0);
    }
  } catch (err) {
    return out_({ ok: false, code: 'internal', message: String(err) }, t0);
  }
}

function doPost(e) {
  var t0 = Date.now();
  try {
    var raw = (e && e.postData && e.postData.contents) || '';
    var body;
    try {
      body = JSON.parse(raw);
    } catch (parseErr) {
      return out_({ ok: false, code: 'bad_request', message: 'body is not valid JSON' }, t0);
    }

    if (body.secret !== SHARED_SECRET) return out_({ ok: false, code: 'unauthorized' }, t0);

    switch (body.action || 'save') {
      case 'save':
        return out_(saveSchedule_(body), t0);

      default:
        return out_({ ok: false, code: 'bad_request',
                      message: 'unknown action: ' + body.action }, t0);
    }
  } catch (err) {
    return out_({ ok: false, code: 'internal', message: String(err) }, t0);
  }
}

/* ==================================================================== read ==== */

function readSchedule_() {
  var events = readTab_(TAB.events, COLS.events);
  var templates = readTab_(TAB.templates, COLS.templates);
  var settings = readTab_(TAB.settings, COLS.settings);

  return {
    ok: true,
    events: events,
    templates: templates,
    // Read-only for the client: the owner maintains this tab by hand, so the app never
    // writes it and a save can never clobber it.
    categories: readTab_(TAB.categories, COLS.categories),
    settings: kv_(settings),
    meta: kv_(readTab_(TAB.meta, COLS.meta)),
    hash: hash_(events, templates, settings),
    schema_version: SCHEMA_VERSION
  };
}

/**
 * Reads a tab, mapping columns **by header name**, never by position.
 *
 * This matters as much as the row rule in CLAUDE.md, and for the same reason. Inserting
 * `icon` into the middle of COLS.events once shifted every later column: a sheet still
 * carrying the old header had its `note` read as `icon`, and template `duration_min`
 * read as `icon` with the duration lost entirely. Positional reads make a schema change
 * silently corrupt data.
 *
 * Mapping by name also makes migration free: a column the sheet does not have yet reads
 * as empty, and the new header lands on the next save.
 */
function readTab_(name, cols) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) return [];

  var last = sh.getLastRow();
  if (last < 2) return [];

  var width = Math.min(sh.getLastColumn(), sh.getMaxColumns());
  if (width < 1) return [];

  var all = sh.getRange(1, 1, last, width).getValues();
  var header = all[0].map(function (h) { return String(h === null ? '' : h).trim(); });

  // Where each schema column actually lives, or -1 when the sheet lacks it.
  var indexOf = {};
  for (var c = 0; c < cols.length; c++) indexOf[cols[c]] = header.indexOf(cols[c]);

  // A sheet with no recognisable header would otherwise read as entirely empty, which
  // would look like data loss. Fall back to position and say so in the log.
  if (indexOf[cols[0]] === -1) {
    Logger.log('WARNING: %s has no "%s" header; falling back to positional columns', name, cols[0]);
    for (var f = 0; f < cols.length; f++) indexOf[cols[f]] = f < width ? f : -1;
  }

  var rows = [];
  for (var r = 1; r < all.length; r++) {
    var o = {};
    var empty = true;
    for (var k = 0; k < cols.length; k++) {
      var at = indexOf[cols[k]];
      var v = at >= 0 && at < width ? all[r][at] : '';
      o[cols[k]] = (v === null || v === undefined) ? '' : String(v).trim();
      if (o[cols[k]] !== '') empty = false;
    }
    if (!empty) rows.push(o);   // skip blank rows left behind by manual editing
  }
  return rows;
}

function kv_(rows) {
  var o = {};
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].key) o[rows[i].key] = rows[i].value;
  }
  return o;
}

/* =================================================================== write ==== */

/**
 * Replaces events, templates and settings in one go. Either the whole payload is
 * valid and written, or nothing changes.
 */
function saveSchedule_(body) {
  // Validate before taking the lock — no point holding a mutex to reject a payload.
  var events = normaliseEvents_(body.events);
  var templates = normaliseTemplates_(body.templates);
  var settings = normaliseSettings_(body.settings);

  var errors = events.errors.concat(templates.errors, settings.errors);
  if (errors.length) {
    return { ok: false, code: 'invalid', errors: errors.slice(0, 20),
             error_count: errors.length };
  }

  var lock = LockService.getScriptLock();
  var lockStart = Date.now();
  if (!lock.tryLock(15000)) {
    return { ok: false, code: 'locked', lock_wait_ms: Date.now() - lockStart };
  }
  var lockWaitMs = Date.now() - lockStart;

  try {
    // The guard. Compare against what is on the Sheet right now.
    var currentHash = hash_(
      readTab_(TAB.events, COLS.events),
      readTab_(TAB.templates, COLS.templates),
      readTab_(TAB.settings, COLS.settings));

    if (body.hash !== currentHash) {
      return { ok: false, code: 'stale', hash: currentHash,
               message: 'the Sheet changed since you last read it; re-read and reapply' };
    }

    writeTab_(TAB.events, COLS.events, events.rows);
    writeTab_(TAB.templates, COLS.templates, templates.rows);
    writeTab_(TAB.settings, COLS.settings, settings.rows);
    writeTab_(TAB.meta, COLS.meta, [
      { key: 'schema_version', value: SCHEMA_VERSION },
      { key: 'updated_at', value: new Date().toISOString() }
    ]);

    // Flush before releasing, or the mutex protects nothing.
    SpreadsheetApp.flush();

    return {
      ok: true,
      written: { events: events.rows.length, templates: templates.rows.length,
                 settings: settings.rows.length },
      // Computed from what we just wrote, not by re-reading. The spike re-read and
      // paid ~500ms for it (ADR-0005).
      hash: hash_(events.rows, templates.rows, settings.rows),
      lock_wait_ms: lockWaitMs
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Clears the old data range and writes the new one in a single setValues.
 * The range is forced to plain-text format first so Sheets cannot reinterpret
 * "11:00" as a time or "60" as a number.
 */
function writeTab_(name, cols, rows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);

  sh.getRange(1, 1, 1, cols.length).setValues([cols]);

  // Clear the full previous extent, not just the new width: a schema that gained a
  // column would otherwise leave the old rightmost values stranded beside the new ones.
  var last = sh.getLastRow();
  var previousWidth = Math.max(cols.length, Math.min(sh.getLastColumn(), sh.getMaxColumns()));
  if (last > 1) sh.getRange(2, 1, last - 1, previousWidth).clearContent();

  if (!rows.length) return;

  var values = rows.map(function (r) {
    return cols.map(function (c) { return r[c] != null ? String(r[c]) : ''; });
  });

  var target = sh.getRange(2, 1, values.length, cols.length);
  target.setNumberFormat('@');
  target.setValues(values);
}

/* ============================================================== validation ==== */

function normaliseEvents_(input) {
  var rows = [], errors = [];

  if (!Array.isArray(input)) return { rows: rows, errors: ['events must be an array'] };
  if (input.length > LIMITS.events) {
    return { rows: rows, errors: ['too many events: ' + input.length] };
  }

  var seen = {};

  for (var i = 0; i < input.length; i++) {
    var e = input[i] || {};
    var where = 'events[' + i + ']';

    var id = str_(e.id);
    if (!id) { errors.push(where + ': missing id'); continue; }
    if (seen[id]) { errors.push(where + ': duplicate id ' + id); continue; }
    seen[id] = true;

    var day = int_(e.day);
    if (day === null || day < 1 || day > 7) {
      errors.push(where + ': day must be 1-7 (Monday=1), got ' + e.day);
    }

    var start = str_(e.start);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)) {
      errors.push(where + ': start must be HH:MM 24-hour, got "' + e.start + '"');
    }

    var dur = int_(e.duration_min);
    if (dur === null || dur < 1) {
      errors.push(where + ': duration_min must be a positive integer, got ' + e.duration_min);
    } else if (start && /^([01]\d|2[0-3]):[0-5]\d$/.test(start) &&
               minutes_(start) + dur > 24 * 60) {
      // The model has no dates, so an event cannot run past midnight.
      errors.push(where + ': ' + start + ' + ' + dur + 'min runs past midnight');
    }

    var title = str_(e.title);
    if (!title) errors.push(where + ': title is required');
    else if (title.length > LIMITS.title) errors.push(where + ': title too long');

    var colour = str_(e.colour) || 'slate';
    if (PALETTE.indexOf(colour) === -1) {
      errors.push(where + ': colour must be one of ' + PALETTE.join('/') + ', got "' + colour + '"');
    }

    var note = str_(e.note);
    if (note.length > LIMITS.note) errors.push(where + ': note too long');

    // Not checked against the categories tab. A row deleted there must not make every
    // event referencing it unsaveable — the client treats an unknown id as uncategorised.
    var category = str_(e.category);
    if (category.length > LIMITS.category) errors.push(where + ': category too long');

    // Deliberately not validated as "is an emoji" — that is unknowable here, and the
    // owner may well want a plain symbol. Only the length is enforced.
    var icon = str_(e.icon);
    if (icon.length > LIMITS.icon) errors.push(where + ': icon too long');

    rows.push({ id: id, day: day, start: start, duration_min: dur,
                title: title, colour: colour, icon: icon, category: category, note: note });
  }

  // Stable order: by day, then start, then title. Keeps the Sheet readable for the
  // owner, and makes the content hash independent of client-side ordering.
  rows.sort(function (a, b) {
    return (a.day - b.day) || (minutes_(a.start) - minutes_(b.start)) ||
           (a.title < b.title ? -1 : a.title > b.title ? 1 : 0);
  });

  return { rows: rows, errors: errors };
}

function normaliseTemplates_(input) {
  var rows = [], errors = [];
  if (input === undefined || input === null) return { rows: rows, errors: errors };
  if (!Array.isArray(input)) return { rows: rows, errors: ['templates must be an array'] };
  if (input.length > LIMITS.templates) {
    return { rows: rows, errors: ['too many templates: ' + input.length] };
  }

  for (var i = 0; i < input.length; i++) {
    var t = input[i] || {};
    var where = 'templates[' + i + ']';

    var id = str_(t.id);
    if (!id) { errors.push(where + ': missing id'); continue; }

    var title = str_(t.title);
    if (!title) errors.push(where + ': title is required');

    var colour = str_(t.colour) || 'slate';
    if (PALETTE.indexOf(colour) === -1) errors.push(where + ': invalid colour "' + colour + '"');

    var dur = int_(t.duration_min);
    if (dur === null || dur < 1) errors.push(where + ': duration_min must be positive');

    var icon = str_(t.icon);
    if (icon.length > LIMITS.icon) errors.push(where + ': icon too long');

    var category = str_(t.category);
    if (category.length > LIMITS.category) errors.push(where + ': category too long');

    rows.push({ id: id, title: title, colour: colour, icon: icon,
                duration_min: dur, category: category });
  }

  rows.sort(function (a, b) { return a.title < b.title ? -1 : a.title > b.title ? 1 : 0; });
  return { rows: rows, errors: errors };
}

function normaliseSettings_(input) {
  var rows = [], errors = [];
  if (input === undefined || input === null) return { rows: rows, errors: errors };
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { rows: rows, errors: ['settings must be an object'] };
  }

  var keys = Object.keys(input).sort();
  for (var i = 0; i < keys.length; i++) {
    rows.push({ key: keys[i], value: str_(input[keys[i]]) });
  }

  if (input.default_duration_min !== undefined) {
    var d = int_(input.default_duration_min);
    if (d === null || d < 1) errors.push('settings.default_duration_min must be positive');
  }

  return { rows: rows, errors: errors };
}

function str_(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }

function int_(v) {
  var s = str_(v);
  if (!/^-?\d+$/.test(s)) return null;
  return parseInt(s, 10);
}

function minutes_(hhmm) {
  var p = String(hhmm).split(':');
  return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
}

/* ==================================================================== hash ==== */

/**
 * Content hash over everything the client can write. Covers templates and settings
 * as well as events, so a save cannot silently clobber those either.
 *
 * Rows must already be in canonical order — see the sorts in normalise*_() — or the
 * same content would hash differently depending on who sent it.
 */
function hash_(events, templates, settings) {
  var parts = [
    'e', canon_(events, COLS.events),
    't', canon_(templates, COLS.templates),
    's', canon_(settings, COLS.settings)
  ].join('');

  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5, parts, Utilities.Charset.UTF_8);

  return bytes.map(function (b) {
    return ((b < 0 ? b + 256 : b) + 0x100).toString(16).slice(1);
  }).join('');
}

function canon_(rows, cols) {
  if (!rows || !rows.length) return '';
  return rows.map(function (r) {
    return cols.map(function (c) {
      return (r[c] === null || r[c] === undefined) ? '' : String(r[c]);
    }).join('');
  }).join('');
}

/* =================================================================== output ==== */

function out_(payload, t0) {
  payload.server_ms = Date.now() - t0;
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
