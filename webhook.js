
const express = require('express');
const fs = require('fs');
const app = express();
app.use(express.json());

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
const reservationsFile = './reservations.json';

app.post('/webhook', express.raw({ type: 'application/json' }), (request, response) => {
  const sig = request.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
  } catch (err) {
    console.log(`⚠️  Webhook signature verification failed.`, err.message);
    return response.sendStatus(400);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const newRes = { dateTime: session.metadata.dateTime, mode: session.metadata.mode };

    let reservations = [];
    if (fs.existsSync(reservationsFile)) {
      reservations = JSON.parse(fs.readFileSync(reservationsFile));
    }

    reservations.push(newRes);
    fs.writeFileSync(reservationsFile, JSON.stringify(reservations, null, 2));
    console.log("✅ Réservation enregistrée :", newRes);
  }

  response.status(200).end();
});

module.exports = app;
