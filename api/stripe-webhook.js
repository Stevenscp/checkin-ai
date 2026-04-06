import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const event = req.body;

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.client_reference_id || session.metadata?.userId;
      const plan = session.metadata?.plan || 'basic';

      if (userId) {
        await supabase.from('coach_settings').upsert({
          coach_id: userId,
          plan,
          stripe_customer_id: session.customer
        }, { onConflict: 'coach_id' });
      }
    }

    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object;
      const userId = subscription.metadata?.userId;
      const plan = subscription.metadata?.plan || 'basic';

      if (userId) {
        await supabase.from('coach_settings').upsert({
          coach_id: userId,
          plan
        }, { onConflict: 'coach_id' });
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const userId = subscription.metadata?.userId;

      if (userId) {
        await supabase.from('coach_settings').upsert({
          coach_id: userId,
          plan: 'basic'
        }, { onConflict: 'coach_id' });
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.status(500).json({ error: error.message });
  }
}