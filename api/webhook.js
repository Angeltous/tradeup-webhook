import { buffer } from 'micro'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2022-11-15',
})

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const sig = req.headers['stripe-signature']
    const buf = await buffer(req)

    let event

    try {
      event = stripe.webhooks.constructEvent(
        buf,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      )
    } catch (err) {
      console.error('❌ Webhook signature verification failed.', err.message)
      return res.status(400).send(`Webhook Error: ${err.message}`)
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object

      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )

      const { error } = await supabase.from('suscripciones_tradeup').insert([
        {
          email: session.customer_email,
          subscription_type: 'mensual',
          active: true,
          start_date: new Date().toISOString(),
          end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          stripe_customer_id: session.customer,
        },
      ])

      if (error) {
        console.error('❌ Error inserting subscription in Supabase:', error)
        return res.status(500).send('Failed to insert subscription')
      }

      console.log('✅ Subscription inserted successfully')
    }

    res.status(200).json({ received: true })
  } else {
    res.setHeader('Allow', 'POST')
    res.status(405).end('Method Not Allowed')
  }
}
