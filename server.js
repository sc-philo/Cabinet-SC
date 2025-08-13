// --- core deps ---
const express = require('express');
const cors = require('cors');
const fs = require('fs');

// --- stripe (clé via variable d'environnement STRIPE_SECRET_KEY) ---
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// --- (optionnel) autres routes si tu en as déjà ---
const calendarRoute = require('./routes/calendar'); // ok si tu veux garder ce fichier
const ical = require('ical-generator');

const app = express();

// ------------------- Middlewares -------------------
app.use(cors());
app.use(express.static('public'));
app.use(express.json());

// Monte les routes additionnelles si besoin
app.use('/', calendarRoute); // sans conflit avec /calendar.ics ci-dessous

// ------------------- Réservations utilitaires -------------------
const reservationsFile = './reservations.json';

function parseDateTime(dateTimeStr) {
  // Convertit "14/05/2025 12:00" → Date JS locale
  const [datePart, timePart] = String(dateTimeStr || '').trim().split(' ');
  if (!datePart || !timePart) return new Date('invalid');
  const [day, month, year] = datePart.split('/');
  return new Date(`${year}-${month}-${day}T${timePart}:00`);
}

function isSlotTaken(dateTime) {
  try {
    if (!fs.existsSync(reservationsFile)) return false;
    const reservations = JSON.parse(fs.readFileSync(reservationsFile, 'utf8'));
    return reservations.some(r => r.dateTime === dateTime);
  } catch (e) {
    console.error('❌ Lecture reservations.json:', e);
    return false;
  }
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
  console.log('🟡 Données reçues :', req.body);

  if (!dateTime || !serviceType) {
    console.log('❌ Champs manquants :', { dateTime, serviceType });
    return res.status(400).json({ error: 'Champs manquants', received: { dateTime, serviceType } });
  }

  const parsedDate = parseDateTime(dateTime);
  if (isNaN(parsedDate)) {
    console.log('❌ Format de date invalide :', dateTime);
    return res.status(400).json({ error: 'Format de date invalide.' });
  }

  if (isSlotTaken(dateTime)) {
    console.log('❌ Créneau déjà pris :', dateTime);
    return res.status(400).json({ error: 'Ce créneau est déjà réservé.' });
  }

  if (serviceType === 'cabinet' && isSunday(parsedDate)) {
    console.log('❌ Cabinet interdit le dimanche :', dateTime);
    return res.status(400).json({ error: 'Pas de rendez-vous au cabinet le dimanche.' });
  }

  if (isTooLate(parsedDate, serviceType)) {
    console.log('❌ Créneau trop proche :', dateTime);
    return res.status(400).json({ error: 'Ce créneau est trop proche. Merci de réserver à l’avance.' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: `Consultation - ${serviceType}` },
          unit_amount: 8000, // €80.00
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${req.headers.origin}/success.html`,
      cancel_url: `${req.headers.origin}/cancel.html`,
      metadata: { dateTime, serviceType }
    });

    res.json({ id: session.id });
  } catch (err) {
    console.error('❌ Erreur Stripe :', err.message);
    res.status(500).json({ error: 'Erreur Stripe : ' + err.message });
  }
});

// ------------------- Route iCal (flux pour Google/iCloud) -------------------
app.get('/calendar.ics', (req, res) => {
  try {
    const cal = ical({
      name: 'Calendrier Cabinet Sarah Cohen',
      // on peut remettre explicitement la TZ si besoin:
      // timezone: 'Europe/Paris',
    });

    // ✅ Événement de test (en UTC pour éviter tout bug de TZ).
    // 22:00 Paris (été, UTC+2) = 20:00Z
    cal.createEvent({
      start: new Date(Date.UTC(2025, 7, 13, 20, 0)), // 2025-08-13 20:00:00Z
      end:   new Date(Date.UTC(2025, 7, 13, 21, 0)),
      summary: 'Séance de peinture',
      description: 'Peinture dans l’atelier',
      location: 'Cabinet Sarah Cohen',
      url: 'https://cabinet-sarah-cohen.onrender.com',
      // uid facultatif (généré si absent)
    });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="calendar.ics"');
    res.send(cal.toString());
  } catch (err) {
    console.error('❌ ICS generation error:', err && err.stack ? err.stack : err);
    res.status(500).send('ICS generation failed: ' + (err && err.message ? err.message : String(err)));
  }
});

// ------------------- Lancement du serveur (Render) -------------------
const PORT = process.env.PORT || 4242;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
