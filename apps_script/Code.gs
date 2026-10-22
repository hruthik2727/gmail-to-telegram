/**
 * Gmail -> Telegram forwarder
 * Runs free on Google's servers (Google Apps Script), even when your laptop is off.
 *
 * SETUP:
 *  1. Project Settings > Script properties: add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID
 *  2. Pick the function "install" in the toolbar and click Run (once)
 *
 * How it avoids duplicates / missed mail: every message ID already forwarded is remembered,
 * and each run looks at all inbox mail from the last WINDOW_HOURS hours.
 */

const SETTINGS = {
  SNIPPET_CHARS: 500,      // characters of the email body to include. 0 = sender + subject only
  BLOCKED_SENDERS: [],     // e.g. ['newsletter.com', 'promo@shop.com'] (never forwarded)
  PRIMARY_ONLY: false,     // true = skip Promotions / Social / Updates tabs
  MAX_PER_RUN: 15,         // safety cap per run
  WINDOW_HOURS: 3          // only look at mail newer than this
};

const KW = '(?:otp|one[- ]time|passcode|password|verification|security|login|sign[- ]in|authentication|code)';
const RE_AFTER = new RegExp(KW + '[^0-9]{0,40}?\\b(\\d{4,8})\\b', 'i');
const RE_BEFORE = new RegExp('\\b(\\d{4,8})\\b[^0-9]{0,20}?(?:is your|as your|is the)[^.]{0,30}' + KW, 'i');
const MAX_SEEN = 300;

/** Run this ONCE (again after editing settings is not needed). Starts the timer. */
function install() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TELEGRAM_BOT_TOKEN') || !props.getProperty('TELEGRAM_CHAT_ID')) {
    throw new Error('First add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID under Project Settings > Script properties.');
  }
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'forwardEmails'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });

  // Mark everything already in the inbox as "seen" so old mail is not forwarded.
  const ids = recentMessages_().map(function (m) { return m.getId(); });
  saveSeen_(ids);

  ScriptApp.newTrigger('forwardEmails').timeBased().everyMinutes(1).create();

  if (!sendTelegram_('\u2705 Gmail forwarder is on for ' + me_())) {
    throw new Error('Telegram rejected the test message. Check the token and chat id in Script properties.');
  }
}

/** Run this to stop forwarding for this account. */
function uninstall() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

/** Called every minute by the trigger. */
function forwardEmails() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return; // never run twice at once
  try {
    const me = me_().toLowerCase();
    const seen = loadSeen_();
    const fresh = recentMessages_()
      .filter(function (m) { return seen.indexOf(m.getId()) === -1; })
      .slice(0, SETTINGS.MAX_PER_RUN);

    for (let i = 0; i < fresh.length; i++) {
      const m = fresh[i];
      const from = m.getFrom();
      const addr = ((from.match(/<([^>]+)>/) || [null, from])[1] || '').toLowerCase().trim();

      const skip = addr === me || SETTINGS.BLOCKED_SENDERS.some(function (b) {
        return addr.indexOf(b.toLowerCase()) !== -1;
      });
      if (!skip) {
        if (!sendTelegram_(buildMessage_(from, m))) break; // not marked seen -> retried next run
        Utilities.sleep(1100);                              // stay under Telegram rate limit
      }
      seen.push(m.getId());
    }
    saveSeen_(seen);
  } finally {
    lock.releaseLock();
  }
}

/** Inbox messages from the last WINDOW_HOURS hours, oldest first. */
function recentMessages_() {
  let query = 'in:inbox newer_than:' + SETTINGS.WINDOW_HOURS + 'h';
  if (SETTINGS.PRIMARY_ONLY) query += ' category:primary';
  const cutoff = Date.now() - SETTINGS.WINDOW_HOURS * 3600 * 1000;
  const msgs = [];
  GmailApp.search(query, 0, 50).forEach(function (thread) {
    thread.getMessages().forEach(function (m) {
      if (m.getDate().getTime() > cutoff) msgs.push(m);
    });
  });
  msgs.sort(function (a, b) { return a.getDate().getTime() - b.getDate().getTime(); });
  return msgs;
}

function loadSeen_() {
  try {
    return JSON.parse(PropertiesService.getScriptProperties().getProperty('SEEN_IDS') || '[]');
  } catch (e) {
    return [];
  }
}

function saveSeen_(ids) {
  PropertiesService.getScriptProperties().setProperty('SEEN_IDS', JSON.stringify(ids.slice(-MAX_SEEN)));
}

function buildMessage_(from, m) {
  const subject = m.getSubject() || '(no subject)';
  const body = (m.getPlainBody() || '').slice(0, 6000);
  const otp = extractOtp_(subject + '\n' + body);

  const lines = ['\uD83D\uDCE7 From: ' + from, 'Subject: ' + subject, '\uD83D\uDCE5 To: ' + me_()];
  if (otp) lines.push('\uD83D\uDD11 Code: ' + otp);
  if (SETTINGS.SNIPPET_CHARS > 0) {
    const snippet = body.replace(/\s+/g, ' ').trim().slice(0, SETTINGS.SNIPPET_CHARS);
    if (snippet) { lines.push(''); lines.push(snippet); }
  }
  return lines.join('\n');
}

function extractOtp_(text) {
  const m = RE_AFTER.exec(text) || RE_BEFORE.exec(text);
  return m ? m[1] : null;
}

function me_() {
  return Session.getEffectiveUser().getEmail();
}

function sendTelegram_(text) {
  const p = PropertiesService.getScriptProperties();
  const res = UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + p.getProperty('TELEGRAM_BOT_TOKEN') + '/sendMessage',
    {
      method: 'post',
      payload: { chat_id: p.getProperty('TELEGRAM_CHAT_ID'), text: text.slice(0, 4000) },
      muteHttpExceptions: true
    }
  );
  if (res.getResponseCode() !== 200) {
    console.error('Telegram error ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
    return false;
  }
  return true;
}
