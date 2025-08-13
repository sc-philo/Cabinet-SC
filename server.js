const express = require('express');
const cors = require('cors');
const fs = require('fs');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const calendarRoute = require('./routes/calendar');
const ical = require('ical-generator');

const app = express();

// Middlewares
app.use(cors());
app.use(express.static('public'));
app.use(express.json());
app.use('/', calendarRoute);

const reservationsFile = './reservations.json';

// ------------------- Fonctions utilitaires -------------------
function parseDateTime(dateTimeStr) {
  // Convertit "14/05/2025 12:00" → Date JS
  const [datePart, timePart] = dateTimeStr.split(' ');
  const [day, month, year] = datePart.split('/');
  return new Date(`${year}-${month}-${day}T${timePart}:00`);
}

function isSlotTaken(dateTime) {
  if (!fs.existsSync(reservationsFile)) return false;
  const reservations = JSON.parse(fs.readFileSync(reservationsFile));
  return reservations.some(r => r.dateTime === dateTime);
}

function isSunday(parsedDate) {
  return parsedDate.getDay() === 0; // Sunday = 0
}

function isTooLate(parsedDate, serviceType) {
  const now = new Date();
  const diffMs = parsedDate - now;
  const diffH = diffMs / (1000 * 60 * 60);
  if (serviceType === 'cabinet') return diffH < 24;
  if (serviceType === 'visio' || serviceType === 'telephone') return diffH < 2;
  return false;
}

// ------------------- Route Stripe -------------------
app.post('/create-checkout-session', async (req, res) => {
  const { dateTime, serviceType } = req.body;
  console.log("🟡 Données reçues :", req.body);

  if (!dateTime || !serviceType) {
    console.log("❌ Champs manquants :", { dateTime, serviceType });
    return res.status(400).json({ error: 'Champs manquants', received: { dateTime, serviceType } });
  }

  const parsedDate = parseDateTime(dateTime);
  if (isNaN(parsedDate)) {
    console.log("❌ Format de date invalide :", dateTime);
    return res.status(400).json({ error: 'Format de date invalide.' });
  }

  if (isSlotTaken(dateTime)) {
    console.log("❌ Créneau déjà pris :", dateTime);
    return res.status(400).json({ error: 'Ce créneau est déjà réservé.' });
  }

  if (serviceType === 'cabinet' && isSunday(parsedDate)) {
    console.log("❌ Cabinet interdit le dimanche :", dateTime);
    return res.status(400).json({ error: 'Pas de rendez-vous au cabinet le dimanche.' });
  }

  if (isTooLate(parsedDate, serviceType)) {
    console.log("❌ Créneau trop proche :", dateTime);
    return res.status(400).json({ error: 'Ce créneau est trop proche. Merci de réserver à l’avance.' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: `Consultation - ${serviceType}` },
          unit_amount: 8000, // Prix en centimes
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

// ------------------- Route iCal -------------------
app.get('/calendar.ics', (req, res) => {
  const cal = ical({
    name: 'Calendrier Cabinet Sarah Cohen',
    timezone: 'Europe/Paris',
  });

  // Exemple d’événement (à remplacer plus tard par tes vrais RDV)
  cal.createEvent({
    start: new Date('2025-08-13T22:00:00+02:00'), // Heure Paris
    end:   new Date('2025-08-13T23:00:00+02:00'),
    summary: 'Séance de peinture',
    description: 'Peinture dans l’atelier',
    location: 'Cabinet Sarah Cohen',
    url: 'https://cabinet-sarah-cohen.onrender.com',
  });

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="calendar.ics"');
  res.send(cal.toString());
});

// ------------------- Lancement du serveur -------------------
const PORT = process.env.PORT || 4242;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
