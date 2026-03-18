import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'Akeema <noreply@akeemaai.com>';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { type, data } = req.body;
    console.log('Email type:', type);
    console.log('To:', type === 'new-checkin' ? data.coachEmail : data.clientEmail);

    if (type === 'new-checkin') {
      const result = await resend.emails.send({
        from: FROM,
        to: data.coachEmail,
        subject: `📋 New check-in from ${data.clientName}`,
        html: `<div style="font-family:sans-serif;background:#0d0d0d;padding:40px;max-width:600px;margin:0 auto;border-radius:16px;">
          <h2 style="color:#f5a623;">New Check-In from ${data.clientName}</h2>
          <p style="color:#aaa;">Weight: ${data.weight} lbs · Adherence: ${data.adherence}% · Sleep: ${data.sleep}/10 · Energy: ${data.energy}/10</p>
          ${data.notes ? `<p style="color:#ccc;">"${data.notes}"</p>` : ''}
          <a href="${data.appUrl}" style="display:inline-block;background:#f5a623;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none;margin-top:16px;">Review Check-In →</a>
          <p style="color:#444;font-size:12px;margin-top:24px;">Akeema · <a href="${data.appUrl}/settings" style="color:#f5a623;">Manage notifications</a></p>
        </div>`
      });
      console.log('Resend result:', JSON.stringify(result));
      res.status(200).json({ success: true, result });

    } else if (type === 'feedback-sent') {
      const result = await resend.emails.send({
        from: FROM,
        to: data.clientEmail,
        subject: `💪 ${data.coachName} sent you feedback on your check-in`,
        html: `<div style="font-family:sans-serif;background:#0d0d0d;padding:40px;max-width:600px;margin:0 auto;border-radius:16px;">
          <h2 style="color:#f5a623;">Feedback from ${data.coachName}</h2>
          <p style="color:#aaa;">Great work this week! ${data.coachName} reviewed your check-in.</p>
          ${data.coachNote ? `<div style="background:#161616;border:1px solid #2a2a2a;border-radius:12px;padding:20px;margin:20px 0;"><p style="color:#ccc;margin:0;">${data.coachNote}</p></div>` : ''}
          <p style="color:#444;font-size:12px;margin-top:24px;">Sent by ${data.coachName} via Akeema · <a href="mailto:${data.coachEmail}" style="color:#f5a623;">Reply to your coach</a></p>
        </div>`
      });
      console.log('Resend result:', JSON.stringify(result));
      res.status(200).json({ success: true, result });

    } else if (type === 'welcome-client') {
      const result = await resend.emails.send({
        from: FROM,
        to: data.clientEmail,
        subject: `👋 ${data.coachName} has added you to Akeema`,
        html: `<div style="font-family:sans-serif;background:#0d0d0d;padding:40px;max-width:600px;margin:0 auto;border-radius:16px;">
          <h2 style="color:#f5a623;">Welcome to Akeema! 🎉</h2>
          <p style="color:#aaa;">Your coach <strong style="color:#fff;">${data.coachName}</strong> has set you up on Akeema for your weekly check-ins.</p>
          <a href="${data.checkinUrl}" style="display:inline-block;background:#f5a623;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none;margin-top:16px;">Submit Your First Check-In →</a>
          <p style="color:#444;font-size:12px;margin-top:24px;">Added by ${data.coachName} · <a href="mailto:${data.coachEmail}" style="color:#f5a623;">Contact your coach</a></p>
        </div>`
      });
      console.log('Resend result:', JSON.stringify(result));
      res.status(200).json({ success: true, result });

    } else {
      res.status(400).json({ error: 'Unknown email type' });
    }

  } catch (error) {
    console.error('Email error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
