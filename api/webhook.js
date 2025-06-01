import { buffer } from 'micro';
import Stripe from 'stripe';

// Stripe y Supabase config
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
    console.error('❌ Error validando firma Stripe:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log("✅ SESIÓN COMPLETADA:", session);

    const email = session.customer_details?.email || 'sin_email@error.com';
    const subscriptionType = session.metadata?.plan || 'mensual';
    const now = new Date().toISOString();
    const endDate = subscriptionType === 'lifetime'
      ? null
      : new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();

    // Inserción en Supabase
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/Suscripciones%20TradeUp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apiKey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          email,
          subscription_type: subscriptionType,
          active: true,
          start_date: now,
          end_date: endDate,
          stripe_customer_id: session.customer || 'sin_id',
          created_at: now,
        }),
      });

      const result = await response.json();
      console.log("🟢 Supabase insert result:", result);

      if (!response.ok) {
        console.error("❌ Supabase error:", result);
        return res.status(500).json({ error: 'Error al insertar en Supabase', details: result });
      }
    } catch (err) {
      console.error("❌ Error al conectar con Supabase:", err);
      return res.status(500).json({ error: 'Fallo de red o Supabase inalcanzable' });
    }
  }

  res.status(200).json({ received: true });
}
