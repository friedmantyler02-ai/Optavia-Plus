import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export async function sendEmail({ from, replyTo, to, subject, html, text }) {
  if (!resend) {
    console.warn("[resend] RESEND_API_KEY not set — returning mock response");
    return { data: { id: "dev-mock-" + Date.now() }, error: null };
  }

  return resend.emails.send({ from, replyTo, to, subject, html, text });
}
