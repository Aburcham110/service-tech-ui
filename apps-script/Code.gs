// Service Tech UI - missing model intake. Appends brand/model only; no photos or customer data.
var SHEET_ID = '1IjOy00rj8roof5pnR7OJ0v964KjiLT9VCJGcPHDNG9o';
function clean(v, n) { return String(v || '').replace(/[^A-Za-z0-9 \-\/\.()]/g, '').slice(0, n); }
function doPost(e) {
  var p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) { p = e.parameter || {}; }
  if (p.type === 'feedback') return feedback(p);
  var brand = clean(p.brand, 60), model = clean(p.model, 40);
  if (!model) return ContentService.createTextOutput('{"ok":false}');
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Submissions');
  if (sh.getLastRow() > 5000) return ContentService.createTextOutput('{"ok":false,"full":true}');
  sh.appendRow([new Date(), brand, model, clean(p.match, 20), clean(p.app, 10), 'new', '']);
  return ContentService.createTextOutput('{"ok":true}').setMimeType(ContentService.MimeType.JSON);
}
// Feedback: typed text + app version only. Leading = + - @ get a quote so Sheets never runs them as formulas.
function feedback(p) {
  var msg = String(p.message || '').trim().slice(0, 1000).replace(/^([=+\-@])/, "'$1");
  if (!msg.trim()) return ContentService.createTextOutput('{"ok":false}');
  var ss = SpreadsheetApp.openById(SHEET_ID), sh = ss.getSheetByName('Feedback');
  if (!sh) { sh = ss.insertSheet('Feedback'); sh.appendRow(['Timestamp', 'Message', 'App version', 'Status']); }
  if (sh.getLastRow() > 5000) return ContentService.createTextOutput('{"ok":false,"full":true}');
  sh.appendRow([new Date(), msg, clean(p.version, 10), 'New']);
  return ContentService.createTextOutput('{"ok":true}').setMimeType(ContentService.MimeType.JSON);
}
