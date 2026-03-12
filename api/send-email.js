import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'CheckIn AI <onboarding@resend.dev>';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { type, data } = req.body;

    if (type === 'new-checkin') {
      // Coach gets notified when client submits check-in
      await resend.emails.send({
        from: FROM,
        to: data.coachEmail,
        subject: `📋 New check-in from ${data.clientName}`,
        html: `
          <div style="font-family:'DM Sans',sans-serif;background:#0d0d0d;padding:40px;max-width:600px;margin:0 auto;border-radius:16px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:32px;">
              <div style="width:36px;height:36px;background:#f5a623;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;">⚡</div>
              <span style="font-size:20px;font-weight:700;color:#fff;">CheckIn AI</span>
            </div>
            <h1 style="color:#fff;font-size:24px;margin:0 0 8px;">New Check-In Received</h1>
            <p style="color:#888;font-size:15px;margin:0 0 28px;">${data.clientName} just submitted their weekly check-in and is waiting for your review.</p>
            <div style="background:#161616;border:1px solid #2a2a2a;border-radius:12px;padding:24px;margin-bottom:28px;">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                ${data.weight ? `<div><div style="color:#555;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Weight</div><div style="color:#fff;font-size:16px;font-weight:600;">${data.weight} lbs</div></div>` : ''}
                ${data.adherence !== undefined ? `<div><div style="color:#555;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Adherence</div><div style="color:#fff;font-size:16px;font-weight:600;">${data.adherence}%</div></div>` : ''}
                ${data.sleep ? `<div><div style="color:#555;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Sleep</div><div style="color:#fff;font-size:16px;font-weight:600;">${data.sleep}/10</div></div>` : ''}
                ${data.energy ? `<div><div style="color:#555;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Energy</div><div style="color:#fff;font-size:16px;font-weight:600;">${data.energy}/10</div></div>` : ''}
              </div>
              ${data.notes ? `<div style="margin-top:16px;padding-top:16px;border-top:1px solid #222;"><div style="color:#555;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Client Notes</div><div style="color:#aaa;font-size:14px;line-height:1.6;">${data.notes}</div></div>` : ''}
            </div>
            <a href="${data.appUrl}" style="display:inline-block;background:#f5a623;color:#000;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:15px;">Review Check-In →</a>
            <p style="color:#444;font-size:12px;margin-top:32px;">You're receiving this because you're a CheckIn AI coach. <a href="${data.appUrl}/settings" style="color:#f5a623;">Manage notifications</a></p>
          </div>
        `
      });
    }

    else if (type === 'feedback-sent') {
      // Client gets notified when coach sends feedback
      await resend.emails.send({
        from: FROM,
        to: data.clientEmail,
        subject: `💪 Your coach reviewed your check-in`,
        html: `
          <div style="font-family:'DM Sans',sans-serif;background:#0d0d0d;padding:40px;max-width:600px;margin:0 auto;border-radius:16px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:32px;">
              <div style="width:36px;height:36px;background:#f5a623;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;">⚡</div>
              <span style="font-size:20px;font-weight:700;color:#fff;">CheckIn AI</span>
            </div>
            <h1 style="color:#fff;font-size:24px;margin:0 0 8px;">Your Coach Has Reviewed Your Check-In</h1>
            <p style="color:#888;font-size:15px;margin:0 0 28px;">Great work staying consistent! ${data.coachName} has reviewed your weekly check-in and left you feedback.</p>
            ${data.coachNote ? `
            <div style="background:#161616;border:1px solid #2a2a2a;border-radius:12px;padding:24px;margin-bottom:28px;">
              <div style="color:#f5a623;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Message from ${data.coachName}</div>
              <div style="color:#ccc;font-size:15px;line-height:1.7;">${data.coachNote}</div>
            </div>` : ''}
            ${data.analysis ? `
            <div style="background:#161616;border:1px solid #2a2a2a;border-radius:12px;padding:24px;margin-bottom:28px;">
              <div style="color:#f5a623;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">AI Analysis</div>
              <div style="color:#aaa;font-size:14px;line-height:1.7;">${data.analysis.substring(0, 500)}${data.analysis.length > 500 ? '...' : ''}</div>
            </div>` : ''}
            <p style="color:#444;font-size:12px;margin-top:32px;">Sent via CheckIn AI · <a href="mailto:${data.coachEmail}" style="color:#f5a623;">Contact your coach</a></p>
          </div>
        `
      });
    }

    else if (type === 'weekly-summary') {
      // Weekly summary to coach
      await resend.emails.send({
        from: FROM,
        to: data.coachEmail,
        subject: `📊 Your weekly CheckIn AI summary`,
        html: `
          <div style="font-family:'DM Sans',sans-serif;background:#0d0d0d;padding:40px;max-width:600px;margin:0 auto;border-radius:16px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:32px;">
              <div style="width:36px;height:36px;background:#f5a623;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;">⚡</div>
              <span style="font-size:20px;font-weight:700;color:#fff;">CheckIn AI</span>
            </div>
            <h1 style="color:#fff;font-size:24px;margin:0 0 8px;">Weekly Summary</h1>
            <p style="color:#888;font-size:15px;margin:0 0 28px;">Here's how your coaching practice performed this week, ${data.coachName}.</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px;">
              <div style="background:#161616;border:1px solid #2a2a2a;border-radius:12px;padding:20px;text-align:center;">
                <div style="color:#f5a623;font-size:28px;font-weight:700;">${data.totalCheckins}</div>
                <div style="color:#555;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-top:4px;">Check-ins Received</div>
              </div>
              <div style="background:#161616;border:1px solid #2a2a2a;border-radius:12px;padding:20px;text-align:center;">
                <div style="color:#4ade80;font-size:28px;font-weight:700;">${data.approvedCheckins}</div>
                <div style="color:#555;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-top:4px;">Reviewed & Sent</div>
              </div>
              <div style="background:#161616;border:1px solid #2a2a2a;border-radius:12px;padding:20px;text-align:center;">
                <div style="color:#fff;font-size:28px;font-weight:700;">${data.totalClients}</div>
                <div style="color:#555;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-top:4px;">Active Clients</div>
              </div>
              <div style="background:#161616;border:1px solid #2a2a2a;border-radius:12px;padding:20px;text-align:center;">
                <div style="color:#f5a623;font-size:28px;font-weight:700;">${data.pendingCheckins}</div>
                <div style="color:#555;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-top:4px;">Pending Review</div>
              </div>
            </div>
            <a href="${data.appUrl}" style="display:inline-block;background:#f5a623;color:#000;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:15px;">Go to Dashboard →</a>
            <p style="color:#444;font-size:12px;margin-top:32px;">Weekly summaries are sent every Monday. <a href="${data.appUrl}/settings" style="color:#f5a623;">Manage notifications</a></p>
          </div>
        `
      });
    }

    else if (type === 'welcome-client') {
      // Welcome email when coach adds a new client
      await resend.emails.send({
        from: FROM,
        to: data.clientEmail,
        subject: `👋 ${data.coachName} has added you to CheckIn AI`,
        html: `
          <div style="font-family:'DM Sans',sans-serif;background:#0d0d0d;padding:40px;max-width:600px;margin:0 auto;border-radius:16px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:32px;">
              <div style="width:36px;height:36px;background:#f5a623;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;">⚡</div>
              <span style="font-size:20px;font-weight:700;color:#fff;">CheckIn AI</span>
            </div>
            <h1 style="color:#fff;font-size:24px;margin:0 0 8px;">Welcome to CheckIn AI! 🎉</h1>
            <p style="color:#888;font-size:15px;margin:0 0 28px;">Your coach <strong style="color:#fff;">${data.coachName}</strong> has set you up on CheckIn AI — a platform for submitting your weekly check-ins and getting personalised AI-powered feedback.</p>
            <div style="background:#161616;border:1px solid #2a2a2a;border-radius:12px;padding:24px;margin-bottom:28px;">
              <div style="color:#f5a623;font-size:13px;font-weight:700;margin-bottom:16px;">How it works</div>
              ${[
                ["1", "Submit your weekly check-in using the link below"],
                ["2", "Your coach reviews it with AI-powered analysis"],
                ["3", "You receive personalised feedback every week"]
              ].map(([num, text]) => `
                <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:12px;">
                  <div style="width:24px;height:24px;background:#f5a623;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:#000;flex-shrink:0;">${num}</div>
                  <div style="color:#aaa;font-size:14px;line-height:1.5;padding-top:3px;">${text}</div>
                </div>`).join('')}
            </div>
            <a href="${data.checkinUrl}" style="display:inline-block;background:#f5a623;color:#000;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:15px;">Submit Your First Check-In →</a>
            <p style="color:#444;font-size:12px;margin-top:32px;">You were added by coach ${data.coachName}. Questions? <a href="mailto:${data.coachEmail}" style="color:#f5a623;">Contact your coach</a></p>
          </div>
        `
      });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Email error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
