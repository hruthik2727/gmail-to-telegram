# Gmail to Telegram

Forward your own emails (or just one-time passcodes) to a Telegram chat, so they show up on your phone within seconds.

Two ways to run it. Pick one per Gmail account, not both (you would get duplicates).

| | PC agent (`pc_agent/`) | Google Apps Script (`apps_script/`) |
|---|---|---|
| Runs on | Your Windows PC (must be on) | Google's servers (free, laptop can be off) |
| Speed | About 10 seconds | Roughly 1 to a few minutes |
| Setup | Python + Gmail app password | Paste one script, no password needed |
| Works with | Any IMAP mailbox | Gmail / Google Workspace only |

## Features
- Forward every new email (sender, subject, short preview) or only OTP emails from allow-listed senders
- Detects one-time codes and shows them on top
- Multiple mailboxes (PC agent)
- Blocked-senders list, preview length control, rate limiting, no repeated messages

## 1. Create the Telegram bot (both versions)
1. In Telegram, message **@BotFather** and send `/newbot`. Copy the bot token.
2. Open your new bot, press Start, and send `hi`.
3. Find your chat id: with the PC agent run `python otp_agent.py --chat-id`; otherwise open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and read `chat.id`.

## 2a. PC agent
```
cd pc_agent
pip install -r requirements.txt
copy .env.example .env      # then fill in your values
python otp_agent.py
```
Gmail needs 2-Step Verification and an **App Password** (Google Account > Security > App passwords).
Set `FORWARD_ALL=true` to forward everything. Use `start_agent.bat` (plus a shortcut in `shell:startup`) to launch at login.

## 2b. Google Apps Script
1. Go to script.google.com > New project, paste `apps_script/Code.gs`.
2. Project Settings > Script properties: add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
3. Run the `install` function once and approve the permissions.
Run `uninstall` to stop. Repeat per Gmail account.

## Security notes
- Never commit `.env`, tokens or app passwords (`.gitignore` already excludes `.env`). If one leaks, revoke it: delete the Google app password, and send `/revoke` to @BotFather.
- Telegram bot messages are not end-to-end encrypted. Set `SNIPPET_CHARS=0` to send only sender and subject.
- Use only on mailboxes you own. Check your school or employer's policy before forwarding work mail.
- The Apps Script version asks for access to your Gmail because it reads your inbox; read the code first, it is short.
