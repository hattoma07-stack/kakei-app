/**
 * ふたりの家計簿 — スプレッドシート同期用 Apps Script（受付係）
 *
 * 【設計方針（セキュリティ）】
 *  ・合言葉(TOKEN)はコードに書かない。スクリプトプロパティにだけ置く。
 *  ・アプリは合言葉を生で送らず、HMAC署名だけを送る（URL・本文に合言葉は出ない）。
 *      sig = HMAC-SHA256(合言葉, "アクション:時刻")  （base64url, パディング無し）
 *  ・GASは同じ計算で照合し、時刻の鮮度(±5分)も確認する。
 *
 * 【最初の設定（1回だけ）】
 * 1. 共有したい Google スプレッドシートを開く
 * 2. 「拡張機能」→「Apps Script」を開き、元のコードを消してこれを全部貼り付ける
 * 3. 左メニュー ⚙️「プロジェクトの設定」→「スクリプト プロパティ」→「プロパティを追加」
 *      プロパティ:  TOKEN
 *      値:          あなたの合言葉（アプリの設定に入れるものと“同じ文字列”）
 *    ※コードには書かない。ここに入れるだけ。合言葉を変えたい時もここを書き換えるだけ。
 * 4. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *      - 次のユーザーとして実行：自分
 *      - アクセスできるユーザー：全員
 *    → デプロイ → 「ウェブアプリの URL(/exec)」をコピー
 * 5. アプリの「設定」画面に、その URL と 合言葉 を入力
 *
 * ※「取引ログ」「定期」「費目マスタ」の3シートは自動で作られます。
 * ※ 既存の分析シートには一切触れません（安全）。
 */

// 時刻の許容ズレ（±5分）
var AUTH_WINDOW_MS = 5 * 60 * 1000;

// シート名と列の定義（key=アプリ内部名 / label=シートの見出し）
var SHEETS = {
  tx: {
    name: '取引ログ',
    cols: [
      ['id', 'ID'], ['date', '日付'], ['itemId', '費目ID'], ['catEmoji', '絵文字'],
      ['catName', '費目'], ['itemName', '詳細'], ['bucket', '分類'], ['amount', '金額'],
      ['author', '入力者'], ['memo', 'メモ'], ['createdAt', '登録日時'],
    ],
  },
  recurring: {
    name: '定期',
    cols: [
      ['id', 'ID'], ['itemId', '費目ID'], ['catEmoji', '絵文字'], ['catName', '費目'],
      ['itemName', '詳細'], ['bucket', '分類'], ['amount', '金額'], ['day', '毎月(日)'],
      ['author', '入力者'], ['startYm', '開始月'], ['endYm', '終了月'], ['active', '有効'],
      ['skips', 'スキップ'], ['memo', 'メモ'],
    ],
  },
  item: {
    name: '費目マスタ',
    cols: [
      ['id', 'ID'], ['categoryId', '費目ID'], ['catEmoji', '絵文字'], ['catName', '費目'],
      ['name', '詳細'], ['bucket', '分類'], ['kind', '種別'], ['archived', '無効'],
    ],
  },
};

// ── 認証（合言葉はスクリプトプロパティからのみ取得。コードには書かない） ──

function getToken_() {
  return PropertiesService.getScriptProperties().getProperty('TOKEN');
}

function base64url_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

/** 署名を検証。action='pull'|'flush', ts=時刻(ms文字列), sig=base64url */
function verifySig_(action, ts, sig) {
  if (!ts || !sig) return false;
  var t = Number(ts);
  if (!t || Math.abs(Date.now() - t) > AUTH_WINDOW_MS) return false; // 時刻が古い/未来すぎる
  var token = getToken_();
  if (!token) return false;
  var raw = Utilities.computeHmacSha256Signature(action + ':' + ts, token); // UTF-8
  var expected = base64url_(raw);
  if (expected.length !== String(sig).length) return false;
  return expected === String(sig);
}

// ── シート読み書き ────────────────────────────────────────────

function getSheet_(def) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(def.name);
  if (!sh) {
    sh = ss.insertSheet(def.name);
    sh.appendRow(def.cols.map(function (c) { return c[1]; }));
    sh.setFrozenRows(1);
  }
  return sh;
}

function rowsAsObjects_(def) {
  var sh = getSheet_(def);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, def.cols.length).getValues();
  return values
    .filter(function (r) { return r[0] !== '' && r[0] !== null; })
    .map(function (r) {
      var o = {};
      def.cols.forEach(function (c, i) { o[c[0]] = r[i]; });
      return o;
    });
}

function findRowById_(sh, id) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2; // 実際の行番号
  }
  return -1;
}

function buildRow_(def, obj) {
  return def.cols.map(function (c) {
    var v = obj[c[0]];
    return v === undefined || v === null ? '' : v;
  });
}

function applyOp_(op) {
  var def = SHEETS[op.kind];
  if (!def) return false;
  var sh = getSheet_(def);
  var id = op.row && op.row.id;
  if (!id) return false;
  var rowNum = findRowById_(sh, id);
  if (op.action === 'delete') {
    if (rowNum > 0) sh.deleteRow(rowNum);
    return true;
  }
  var values = buildRow_(def, op.row);
  if (rowNum > 0) {
    sh.getRange(rowNum, 1, 1, def.cols.length).setValues([values]);
  } else {
    sh.appendRow(values);
  }
  return true;
}

// JSONP（callback指定あり）なら JavaScript、なければ JSON で返す
function reply_(obj, callback) {
  var text = JSON.stringify(obj);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + text + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ── エンドポイント ────────────────────────────────────────────

function doGet(e) {
  var params = (e && e.parameter) || {};
  var cb = params.callback;
  try {
    if (params.action === 'pull') {
      if (!verifySig_('pull', params.ts, params.sig)) return reply_({ error: '認証に失敗しました' }, cb);
      return reply_({
        tx: rowsAsObjects_(SHEETS.tx),
        recurring: rowsAsObjects_(SHEETS.recurring),
        items: rowsAsObjects_(SHEETS.item),
      }, cb);
    }
    // アクション未指定は稼働確認のみ（データは返さない）
    return reply_({ ok: true, message: 'ふたりの家計簿 同期サーバーは動作しています' }, cb);
  } catch (err) {
    return reply_({ error: String(err) }, cb);
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!verifySig_('flush', body.ts, body.sig)) return json_({ error: '認証に失敗しました' });
    var ops = body.ops || [];
    var done = [];
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      if (applyOp_(op)) done.push(op.opId);
    }
    return json_({ ok: true, done: done });
  } catch (err) {
    return json_({ error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}
