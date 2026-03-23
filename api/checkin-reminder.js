import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'Akeema <noreply@akeemaai.com>';

const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const now = new Date();
    const currentDay = DAYS[now.getUTCDay()];
    const currentHour = String(now.getUTCHours()).padStart(2, '0') + ':00';

    // Find all clients with reminders enabled for this day and time
    const { data: clients, error } = await supabase
      .from('clients')
      .select('*, coach_email')
      .eq('reminders_enabled', true)
      .eq('reminder_day', currentDay)
      .eq('reminder_time', currentHour)
      .not('email', 'is', null);

    if (error) throw error;
    if (!clients || clients.length === 0) {
      return res.status(200).json({ message: 'No reminders due', day: currentDay, hour: currentHour });
    }

    let sent = 0;
    for (const client of clients) {
      await resend.emails.send({
        from: FROM,
        to: client.email,
        subject: `⚡ Time for your weekly check-in!`,
        html: `
          <div style="font-family:'DM Sans',sans-serif;background:#0d0d0d;padding:40px;max-width:600px;margin:0 auto;border-radius:16px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:32px;">
              <div style="width:36px;height:36px;background:#f5a623;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;">⚡</div>
              <span style="font-size:20px;font-weight:700;color:#fff;">Akeema</span>
            </div>
            <h1 style="color:#fff;font-size:24px;margin:0 0 8px;">Time for your weekly check-in! 💪</h1>
            <p style="color:#888;font-size:15px;margin:0 0 28px;">Hey ${client.name.split(' ')[0]}! Your coach is waiting for your update. It only takes a couple of minutes.</p>
            <div style="background:#161616;border:1px solid #2a2a2a;border-radius:12px;padding:24px;margin-bottom:28px;">
              <p style="color:#f5a623;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">This week, tell your coach:</p>
              <ul style="color:#aaa;font-size:14px;line-height:1.8;margin:0;padding-left:20px;">
                <li>How your training went</li>
                <li>Your current weight</li>
                <li>Sleep, stress and energy levels</li>
                <li>Your biggest challenge this week</li>
              </ul>
            </div>
            <a href="https://akeemaai.com?checkin=true" style="display:inline-block;background:#f5a623;color:#000;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:15px;">Submit My Check-in →</a>
            <p style="color:#444;font-size:12px;margin-top:32px;">Sent by your coach via Akeema · <a href="mailto:${client.coach_email}" style="color:#f5a623;">Contact your coach</a></p>
          </div>
        `
      });
      sent++;
    }

    res.status(200).json({ success: true, sent, day: currentDay, hour: currentHour });
  } catch (error) {
    console.error('Reminder error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
