import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14.10.0?target=deno'

const stripe = new Stripe('sk_test_51ShnlT40CPO0GsETq1rsp2QUIhmeJc6NzFFEjAERHvmbMWV3YabUdfJapGkm7NDvJx7M35p3bTyKvCf0vfFSfgaN00R7SKTzhH', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const PLAN_PRICES: Record<string, number> = {
  pyme: 1997,  // $19.97
  pro: 4997,   // $49.97
  plus: 9997   // $99.97
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { planId, userId, userEmail } = await req.json()

    if (!planId || !userId || !userEmail) {
      throw new Error('Missing required parameters')
    }

    const amount = PLAN_PRICES[planId]
    if (!amount) {
      throw new Error('Invalid plan ID')
    }

    // Crear Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        planId,
        userId,
        userEmail,
      },
      description: `Suscripción ${planId.toUpperCase()} - ${userEmail}`,
    })

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
