import { google } from "googleapis";
import twilio from "twilio";

const IMPORTANT_TERMS = [
  "university", "admission", "application", "bursary", "nsfas", "offer",
  "accepted", "acceptance", "registration", "student", "residence",
  "deadline", "appointment", "official document", "security alert",
  "password", "payment", "invoice", "failed payment", "account"
];

function header(headers, name) {
  return headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function important(subject, from, snippet) {
  const text = `${subject} ${from} ${snippet}`.toLowerCase();
  return IMPORTANT_TERMS.some(term => text.includes(term));
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export default async () => {
  try {
    const oauth2 = new google.auth.OAuth2(
      required("GMAIL_CLIENT_ID"),
      required("GMAIL_CLIENT_SECRET")
    );
    oauth2.setCredentials({ refresh_token: required("GMAIL_REFRESH_TOKEN") });

    const gmail = google.gmail({ version: "v1", auth: oauth2 });
    const sms = twilio(required("TWILIO_ACCOUNT_SID"), required("TWILIO_AUTH_TOKEN"));

    // Keep the search window deliberately short so a scheduled invocation does
    // not repeatedly scan the full mailbox. Gmail labels alerted messages below.
    const list = await gmail.users.messages.list({
      userId: "me",
      q: "newer_than:1d -label:TivalsSMSAlerted",
      maxResults: 25
    });

    const messages = list.data.messages || [];
    if (!messages.length) return new Response("No new messages", { status: 200 });

    let labelId;
    const labels = await gmail.users.labels.list({ userId: "me" });
    const existing = labels.data.labels?.find(l => l.name === "TivalsSMSAlerted");
    if (existing) {
      labelId = existing.id;
    } else {
      const created = await gmail.users.labels.create({
        userId: "me",
        requestBody: { name: "TivalsSMSAlerted", labelListVisibility: "labelHide", messageListVisibility: "hide" }
      });
      labelId = created.data.id;
    }

    let sent = 0;
    for (const item of messages) {
      const msg = await gmail.users.messages.get({
        userId: "me",
        id: item.id,
        format: "metadata",
        metadataHeaders: ["From", "Subject"]
      });

      const headers = msg.data.payload?.headers || [];
      const subject = header(headers, "Subject") || "(no subject)";
      const from = header(headers, "From") || "Unknown sender";
      const snippet = msg.data.snippet || "";

      if (!important(subject, from, snippet)) continue;

      const body = `Tivals email alert\nFrom: ${from.slice(0, 70)}\nSubject: ${subject.slice(0, 100)}`;
      await sms.messages.create({
        from: required("TWILIO_FROM_NUMBER"),
        to: required("SMS_TO_NUMBER"),
        body
      });

      await gmail.users.messages.modify({
        userId: "me",
        id: item.id,
        requestBody: { addLabelIds: [labelId] }
      });
      sent++;
    }

    return new Response(`Processed ${messages.length}; sent ${sent} SMS alert(s)`, { status: 200 });
  } catch (error) {
    console.error("email-alerts failed", error);
    return new Response("Email alert function failed", { status: 500 });
  }
};
