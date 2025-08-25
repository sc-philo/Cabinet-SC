const express = require('express');
const fs = require('fs');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
const reservationsFile = './reservations.json';

app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.log(`⚠️  Webhook signature verification failed.`, err.message);
    return res.sendStatus(400);
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
    console.log('✅ Réservation enregistrée :', newRes);
  }

  res.status(200).end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Webhook listening on port ${PORT}`));
