
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const app = express();
app.use(cors());
app.use(express.static('public'));
app.use(express.json());

const reservationsFile = './reservations.json';

function isSlotTaken(dateTime) {
  if (!fs.existsSync(reservationsFile)) return false;
  const reservations = JSON.parse(fs.readFileSync(reservationsFile));
  return reservations.some(r => r.dateTime === dateTime);
}

function isSunday(dateTimeStr) {
  const date = new Date(dateTimeStr);
  return date.getDay() === 0;
}

function isTooLate(dateTimeStr, serviceType) {
  const now = new Date();
  const chosen = new Date(dateTimeStr);
  const diffMs = chosen - now;
  const diffH = diffMs / (1000 * 60 * 60);
  if (serviceType === 'cabinet') return diffH < 24;
  if (serviceType === 'visio' || serviceType === 'telephone') return diffH < 2;
  return false;
}

app.post('/create-checkout-session', async (req, res) => {
  const { dateTime, serviceType } = req.body;
  console.log("🟡 Données reçues :", req.body);

  if (!dateTime || !serviceType) {
    console.log("❌ Champs manquants :", { dateTime, serviceType });
    return res.status(400).json({ error: 'Champs manquants', received: { dateTime, serviceType } });
  }

  if (isSlotTaken(dateTime)) {
    console.log("❌ Créneau déjà pris :", dateTime);
    return res.status(400).json({ error: 'Ce créneau est déjà réservé.' });
  }

  if (serviceType === 'cabinet' && isSunday(dateTime)) {
    console.log("❌ Tentative de réservation un dimanche au cabinet :", dateTime);
    return res.status(400).json({ error: 'Pas de rendez-vous au cabinet le dimanche.' });
  }

  if (isTooLate(dateTime, serviceType)) {
    console.log("❌ Créneau trop proche :", { dateTime, serviceType });
    return res.status(400).json({ error: 'Ce créneau est trop proche. Merci de réserver à l’avance.' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: `Consultation - ${serviceType}` },
          unit_amount: 8000,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${req.headers.origin}/success.html`,
      cancel_url: `${req.headers.origin}/cancel.html`,
      metadata: {
        dateTime,
        serviceType
      }
    });

    res.json({ id: session.id });
  } catch (err) {
    console.error("❌ Erreur Stripe :", err.message);
    res.status(500).json({ error: 'Erreur Stripe : ' + err.message });
  }
});

const port = process.env.PORT || 4242;
app.listen(port, () => console.log(`Server running on port ${port}`));
