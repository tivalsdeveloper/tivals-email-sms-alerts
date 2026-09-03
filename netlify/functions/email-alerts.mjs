import { google } from "googleapis";
import twilio from "twilio";
import pg from "pg";

const { Pool } = pg;

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function header(headers, name) {
  return headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function classify(text, rules) {
  const haystack = text.toLowerCase();
  for (const rule of rules) {
    const terms = Array.isArray(rule.keywords) ? rule.keywords : [];
    if (terms.some(term => haystack.includes(String(term).toLowerCase()))) {
      return { important: true, category: rule.category || rule.name || "important" };
    }
  }
  return { important: false, category: "other" };
}

export default async () => {
  const db = new Pool({
    connectionString: required("WOWSQL_DATABASE_URL"),
    max: 1,
    ssl: process.env.WOWSQL_SSL === "false" ? false : { rejectUnauthorized: false }
  });

  try {
    const oauth2 = new google.auth.OAuth2(required("GMAIL_CLIENT_ID"), required("GMAIL_CLIENT_SECRET"));
    oauth2.setCredentials({ refresh_token: required("GMAIL_REFRESH_TOKEN") });
    const gmail = google.gmail({ version: "v1", auth: oauth2 });
    const sms = twilio(required("TWILIO_ACCOUNT_SID"), required("TWILIO_AUTH_TOKEN"));

    const ruleResult = await db.query("SELECT * FROM alert_rules WHERE enabled = TRUE ORDER BY id");
    const rules = ruleResult.rows;

    const list = await gmail.users.messages.list({ userId: "me", q: "newer_than:1d", maxResults: 25 });
    const messages = list.data.messages || [];
    let sent = 0;

    for (const item of messages) {
      const duplicate = await db.query("SELECT 1 FROM email_events WHERE gmail_message_id = $1 LIMIT 1", [item.id]);
      if (duplicate.rowCount) continue;

      const msg = await gmail.users.messages.get({
        userId: "me",
        id: item.id,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"]
      });

      const headers = msg.data.payload?.headers || [];
      const subject = header(headers, "Subject") || "(no subject)";
      const sender = header(headers, "From") || "Unknown sender";
      const snippet = msg.data.snippet || "";
      const received = header(headers, "Date");
      const result = classify(`${sender} ${subject} ${snippet}`, rules);

      const inserted = await db.query(
        `INSERT INTO email_events
          (gmail_message_id, sender, subject, snippet, category, received_at, is_important)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (gmail_message_id) DO NOTHING
         RETURNING id`,
        [item.id, sender, subject, snippet, result.category, received ? new Date(received) : null, result.important]
      );

      if (!inserted.rowCount || !result.important) continue;
      const eventId = inserted.rows[0].id;
      const body = `Tivals email alert\nFrom: ${sender.slice(0, 70)}\nSubject: ${subject.slice(0, 100)}`;

      let notificationId;
      try {
        const pending = await db.query(
          `INSERT INTO sms_notifications (email_event_id, phone_number, message, status)
           VALUES ($1,$2,$3,'pending') RETURNING id`,
          [eventId, required("SMS_TO_NUMBER"), body]
        );
        notificationId = pending.rows[0].id;

        const delivered = await sms.messages.create({
          from: required("TWILIO_FROM_NUMBER"),
          to: required("SMS_TO_NUMBER"),
          body
        });

        await db.query(
          `UPDATE sms_notifications SET status='sent', provider_message_id=$1, sent_at=NOW() WHERE id=$2`,
          [delivered.sid, notificationId]
        );
        sent++;
      } catch (smsError) {
        if (notificationId) {
          await db.query(
            `UPDATE sms_notifications SET status='failed', error_message=$1 WHERE id=$2`,
            [String(smsError.message || smsError).slice(0, 1000), notificationId]
          );
        }
        console.error("SMS delivery failed", smsError);
      }
    }

    return new Response(`Processed ${messages.length}; sent ${sent} SMS alert(s)`, { status: 200 });
  } catch (error) {
    console.error("email-alerts failed", error);
    return new Response("Email alert function failed", { status: 500 });
  } finally {
    await db.end().catch(() => {});
  }
};
