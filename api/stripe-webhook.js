import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const event = req.body;

  if (event.type === 'checkout.session.completed' ||
      event.type === 'customer.subscription.updated') {
    const userId = event.data.object.client_reference_id;
    console.log(`Subscription active for user: ${userId}`);
  }

  res.status(200).json({ received: true });
}
