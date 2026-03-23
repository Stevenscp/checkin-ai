import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'Akeema <noreply@akeemaai.com>';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get all coaches (unique coach_ids from clients table)
    const { data: coaches } = await supabase
      .from('clients')
      .select('coach_id, coach_email')
      .not('coach_email', 'is', null);

    if (!coaches || coaches.length === 0) {
      return res.status(200).json({ message: 'No coaches found' });
    }

    // Deduplicate coaches
    const uniqueCoaches = [...new Map(coaches.map(c => [c.coach_id, c])).values()];
    let sent = 0;

    for (const coach of uniqueCoaches) {
      if (!coach.coach_email) continue;

      // Get this week's stats
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const { data: allClients } = await supabase
        .from('clients')
        .select('id, name')
        .eq('coach_id', coach.coach_id);

      const { data: weekCheckins } = await supabase
        .from('checkins')
        .select('*')
        .eq('coach_id', coach.coach_id)
        .gte('created_at', weekAgo.toISOString());

      const { data: pendingCheckins } = await supabase
        .from('checkins')
        .select('id')
        .eq('coach_id', coach.coach_id)
        .eq('status', 'pending');

      const totalClients = allClients?.length || 0;
      const totalCheckins = weekCheckins?.length || 0;
      const approvedCheckins = weekCheckins?.filter(c => c.status === 'approved').length || 0;
      const pendingCount = pendingCheckins?.length || 0;

      await resend.emails.send({
        from: FROM,
        to: coach.coach_email,
        subject: `📊 Your weekly Akeema summary`,
        html: `
          <div style="font-family:'DM Sans',sans-serif;background:#0d0d0d;padding:40px;max-width:600px;margin:0 auto;border-radius:16px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:32px;">
              <div style="width:36px;height:36px;background:#f5a623;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;">⚡</div>
              <span style="font-size:20px;font-weight:700;color:#fff;">Akeema</span>
            </div>
            <h1 style="color:#fff;font-size:24px;margin:0 0 8px;">Weekly Summary</h1>
            <p style="color:#888;font-size:15px;margin:0 0 28px;">Here's how your coaching practice performed this week.</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px;">
              <div style="background:#161616;border:1px solid #2a2a2a;border-radius:12px;padding:20px;text-align:center;">
                <div style="color:#f5a623;font-size:28px;font-weight:700;">${totalCheckins}</div>
                <div style="color:#555;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-top:4px;">Check-ins Received</div>
              </div>
              <div style="background:#161616;border:1px solid #2a2a2a;border-radius:12px;padding:20px;text-align:center;">
                <div style="color:#4ade80;font-size:28px;font-weight:700;">${approvedCheckins}</div>
                <div style="color:#555;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-top:4px;">Reviewed & Sent</div>
              </div>
              <div style="background:#161616;border:1px solid #2a2a2a;border-radius:12px;padding:20px;text-align:center;">
                <div style="color:#fff;font-size:28px;font-weight:700;">${totalClients}</div>
                <div style="color:#555;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-top:4px;">Active Clients</div>
              </div>
              <div style="background:${pendingCount > 0 ? '#1a1200' : '#161616'};border:1px solid ${pendingCount > 0 ? '#3a2800' : '#2a2a2a'};border-radius:12px;padding:20px;text-align:center;">
                <div style="color:${pendingCount > 0 ? '#f5a623' : '#fff'};font-size:28px;font-weight:700;">${pendingCount}</div>
                <div style="color:#555;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-top:4px;">Pending Review</div>
              </div>
            </div>
            ${pendingCount > 0 ? `<div style="background:#1a1200;border:1px solid #3a2800;border-radius:12px;padding:16px 20px;margin-bottom:24px;"><p style="color:#f5a623;margin:0;font-size:14px;">⚠️ You have ${pendingCount} check-in${pendingCount > 1 ? 's' : ''} waiting for review. Your clients are waiting for feedback!</p></div>` : '<div style="background:#0d1f0d;border:1px solid #1a3a1a;border-radius:12px;padding:16px 20px;margin-bottom:24px;"><p style="color:#4ade80;margin:0;font-size:14px;">✅ All caught up! No pending check-ins.</p></div>'}
            <a href="https://akeemaai.com" style="display:inline-block;background:#f5a623;color:#000;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:15px;">Go to Dashboard →</a>
            <p style="color:#444;font-size:12px;margin-top:32px;">Weekly summaries are sent every Monday. <a href="https://akeemaai.com/settings" style="color:#f5a623;">Manage notifications</a></p>
          </div>
        `
      });
      sent++;
    }

    res.status(200).json({ success: true, sent });
  } catch (error) {
    console.error('Weekly summary error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
