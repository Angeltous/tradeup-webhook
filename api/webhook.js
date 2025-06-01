import { buffer } from 'micro';
import Stripe from 'stripe';

export const config = {
  api: {
    bodyParser: false,
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end('Method Not Allowed');
  }

  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('❌ Webhook signature verification failed.', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // 👉 EVENTO: checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    const email = session.customer_details?.email || 'no-email';
    const subscriptionType = session.metadata?.plan || 'unknown';
    const isLifetime = subscriptionType === 'lifetime';

    const now = new Date().toISOString();
    const endDate = isLifetime
      ? null
      : new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();

    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/Suscripciones%20TradeUp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apiKey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        email,
        subscription_type: subscriptionType,
        active: true,
        start_date: now,
        end_date: endDate,
        stripe_customer_id: session.customer,
        created_at: now,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Error al insertar en Supabase:', data);
    } else {
      console.log('✅ Insertado en Supabase:', data);
    }
  }

  res.status(200).json({ received: true });
}
