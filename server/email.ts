import nodemailer, { type Transporter } from "nodemailer";

const FELT = "#0f3d2e", FELT_DARK = "#0a2a20", GOLD = "#d4af37", CREAM = "#f6f1e3", MUTED = "#a9c3b6";

export function codeEmailHtml(code: string, appUrl: string) {
  const spaced = code.split("").join("&nbsp;");
  const teaser = (suit: string, suitColor: string, title: string, line: string) => `
    <tr><td style="padding:0 0 12px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${FELT_DARK}" style="background:${FELT_DARK};border:1px solid #1d5a45;border-radius:10px;">
        <tr>
          <td width="56" align="center" valign="middle" style="padding:14px 0 14px 12px;font-family:Georgia,serif;font-size:30px;line-height:30px;color:${suitColor};">${suit}</td>
          <td valign="middle" style="padding:14px 12px;font-family:Arial,Helvetica,sans-serif;">
            <div style="font-size:16px;font-weight:bold;color:${CREAM};">${title}</div>
            <div style="font-size:14px;color:${MUTED};padding-top:3px;">${line}</div>
          </td>
          <td width="84" align="right" valign="middle" style="padding:14px 14px 14px 0;">
            <span style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:1px;color:${GOLD};border:1px solid ${GOLD};border-radius:4px;padding:3px 6px;">LOCKED</span>
          </td>
        </tr>
      </table>
    </td></tr>`;

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light">
<title>Your code: ${code}</title>
</head>
<body style="margin:0;padding:0;background:${FELT_DARK};" bgcolor="${FELT_DARK}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${FELT_DARK};">Your seat at the table is ready. Plus a peek at what's coming Friday.&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${FELT_DARK}" style="background:${FELT_DARK};">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;" bgcolor="${FELT}">
    <!-- Header -->
    <tr><td align="center" bgcolor="${FELT}" style="background:${FELT};padding:32px 24px 8px 24px;border-top:4px solid ${GOLD};">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:13px;letter-spacing:4px;color:${MUTED};">OPTIMUS DAY &middot; FRI NOV 27</div>
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:34px;font-weight:bold;letter-spacing:3px;color:${GOLD};padding-top:8px;">POKER AT THIV'S</div>
      <div style="font-family:Georgia,serif;font-size:22px;letter-spacing:10px;padding-top:6px;">
        <span style="color:${CREAM};">&spades;</span><span style="color:#e05a4f;">&hearts;</span><span style="color:#5aa0e0;">&diams;</span><span style="color:#6fcf8a;">&clubs;</span>
      </div>
    </td></tr>
    <!-- Code -->
    <tr><td align="center" bgcolor="${FELT}" style="background:${FELT};padding:24px 24px 8px 24px;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:18px;color:${CREAM};">Here's your code</div>
    </td></tr>
    <tr><td align="center" bgcolor="${FELT}" style="background:${FELT};padding:8px 24px 0 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="${FELT_DARK}" style="background:${FELT_DARK};border:3px solid ${GOLD};border-radius:14px;">
        <tr><td align="center" style="padding:18px 28px;font-family:'Courier New',Courier,monospace;font-size:42px;font-weight:bold;color:${GOLD};letter-spacing:4px;">${spaced}</td></tr>
      </table>
    </td></tr>
    <tr><td align="center" bgcolor="${FELT}" style="background:${FELT};padding:12px 24px 28px 24px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${MUTED};">
      Expires in 10 minutes. Enter it in the app to take your seat.
    </td></tr>
    <!-- Live now -->
    <tr><td bgcolor="${FELT}" style="background:${FELT};padding:0 24px;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;letter-spacing:2px;color:${GOLD};padding-bottom:10px;">LIVE NOW</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${FELT_DARK}" style="background:${FELT_DARK};border:1px solid ${GOLD};border-radius:10px;">
        <tr>
          <td width="56" align="center" valign="middle" style="padding:14px 0 14px 12px;font-family:Georgia,serif;font-size:30px;color:#6fcf8a;">&clubs;</td>
          <td valign="middle" style="padding:14px 12px;font-family:Arial,Helvetica,sans-serif;">
            <div style="font-size:16px;font-weight:bold;color:${CREAM};">Odds Calculator</div>
            <div style="font-size:14px;color:${MUTED};padding-top:3px;">Tap your cards and see your odds, your outs and what every next card does to your hand.</div>
          </td>
        </tr>
      </table>
    </td></tr>
    <!-- Coming Friday -->
    <tr><td bgcolor="${FELT}" style="background:${FELT};padding:24px 24px 0 24px;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;letter-spacing:2px;color:${GOLD};padding-bottom:10px;">COMING FRIDAY</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${teaser("&spades;", CREAM, "Live Leaderboard", "Who's up, who's down, all night.")}
        ${teaser("&hearts;", "#e05a4f", "The Coach", "Tells you when to fold, call or shove.")}
        ${teaser("&diams;", "#5aa0e0", "Practice Table", "Warm up before you sit down.")}
      </table>
    </td></tr>
    <!-- CTA -->
    <tr><td align="center" bgcolor="${FELT}" style="background:${FELT};padding:16px 24px 28px 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td align="center" bgcolor="${GOLD}" style="background:${GOLD};border-radius:8px;">
          <a href="${appUrl}" style="display:inline-block;padding:13px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:${FELT_DARK};text-decoration:none;">Open the app &rarr;</a>
        </td>
      </tr></table>
    </td></tr>
    <!-- Footer -->
    <tr><td align="center" bgcolor="${FELT_DARK}" style="background:${FELT_DARK};padding:18px 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:${MUTED};border-bottom:4px solid ${GOLD};">
      Fri Nov 27 &middot; No-Limit Hold'em &middot; 8 seats<br>
      Hosted by Thiv &amp; Nas<br>
      <span style="color:#6f8f80;">Didn't request this? You can ignore this email.</span>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
}

export function codeEmailText(code: string, appUrl: string) {
  return `POKER AT THIV'S - Fri Nov 27

Your code: ${code}
(expires in 10 minutes)

LIVE NOW
- Odds Calculator: tap your cards and see your odds, outs and what every next card does.

COMING FRIDAY (locked)
- Live Leaderboard: who's up, who's down, all night.
- The Coach: tells you when to fold, call or shove.
- Practice Table: warm up before you sit down.

Open the app: ${appUrl}

Fri Nov 27 - No-Limit Hold'em - 8 seats - Hosted by Thiv & Nas
Didn't request this? You can ignore this email.`;
}

let transporter: Transporter | null = null;
function getTransport() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  transporter ??= nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

export async function sendCodeEmail(to: string, code: string, appUrl: string) {
  const t = getTransport();
  if (!t) {
    if (process.env.NODE_ENV === "production") throw new Error("SMTP is not configured");
    console.log(`[dev] Login code for ${to}: ${code}`);
    return;
  }
  await t.sendMail({
    from: `"${process.env.SMTP_FROM_NAME ?? "Thiv's Table"}" <${process.env.SMTP_USER}>`,
    to,
    subject: `Your code: ${code} · Poker at Thiv's`,
    text: codeEmailText(code, appUrl),
    html: codeEmailHtml(code, appUrl),
  });
}
