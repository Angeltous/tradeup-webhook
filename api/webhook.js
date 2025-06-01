import { buffer } from 'micro';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end('Method Not Allowed');
  }

  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook Error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Manejar checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_details?.email || 'unknown@example.com';
    const subscriptionType = session.metadata?.plan || 'unknown';
    const isLifetime = subscriptionType === 'lifetime';
    const now = new Date().toISOString();
    const endDate = isLifetime ? null : new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();

    const response = await fetch(`${SUPABASE_URL}/rest/v1/Suscripciones%20TradeUp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apiKey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
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
    console.log('Inserted checkout.session.completed into Supabase:', data);
  }

  // Manejar invoice.paid (para pruebas desde dashboard)
  if (event.type === 'invoice.paid') {
    const invoice = event.data.object;
    const email = invoice.customer_email || 'unknown@example.com';
    const subscriptionType = invoice.lines?.data[0]?.description || 'unknown';
    const customerId = invoice.customer;
    const now = new Date().toISOString();
    const endDate = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();

    const response = await fetch(`${SUPABASE_URL}/rest/v1/Suscripciones%20TradeUp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apiKey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({
        email,
        subscription_type: subscriptionType,
        active: true,
        start_date: now,
        end_date: endDate,
        stripe_customer_id: customerId,
        created_at: now,
      }),
    });

    const data = await response.json();
    console.log('Inserted invoice.paid into Supabase:', data);
  }

  res.status(200).json({ received: true });
}
