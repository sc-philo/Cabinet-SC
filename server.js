// --- Dépendances ---
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// iCal (compat ESM/CommonJS)
const icalLib = require('ical-generator');
const ical = icalLib.default || icalLib;

// Email (SMTP)
const nodemailer = require('nodemailer');

const app = express();

// ------------------- Fichiers & utilitaires -------------------
const RES_FILE = './reservations.json';

function loadReservations() {
  try {
    if (!fs.existsSync(RES_FILE)) return [];
    return JSON.parse(fs.readFileSync(RES_FILE, 'utf-8'));
  } catch (e) {
    console.error('❌ Lecture reservations.json:', e);
    return [];
  }
}

function saveReservations(resList) {
  try {
    fs.writeFileSync(RES_FILE, JSON.stringify(resList, null, 2));
  } catch (e) {
    console.error('❌ Écriture reservations.json:', e);
  }
}

function addReservation(r) {
  const list = loadReservations();
  list.push(r);
  saveReservations(list);
}

function parseDateTimeFR(dateTimeStr) {
  // "JJ/MM/AAAA HH:mm" -> Date locale
  const [datePart, timePart] = String(dateTimeStr || '').trim().split(' ');
  if (!datePart || !timePart) return new Date('invalid');
  const [day, month, year] = datePart.split('/');
  return new Date(`${year}-${month}-${day}T${timePart}:00`);
}

function isSunday(d) {
  return d.getDay() === 0;
}

function isTooLate(d, serviceType) {
  const now = new Date();
  const diffH = (d - now) / 36e5;
  if (serviceType === 'cabinet') return diffH < 24;
  if (serviceType === 'visio' || serviceType === 'telephone') return diffH < 2;
  return false;
}

function isSlotTaken(dateTime) {
  return loadReservations().some(r => r.dateTime === dateTime);
}

// ------------------- Healthcheck -------------------
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// ------------------- ⚠️ Webhook Stripe (RAW body) -------------------
// IMPORTANT : doit être défini AVANT express.json()
app.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Webhook error:', err.message);
      return res.status(400).send(`Webhook error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const { dateTime, serviceType } = session.metadata || {};
      if (dateTime && serviceType) {
        try {
          addReservation({ dateTime, serviceType });
          console.log(`✅ Réservation ajoutée via Webhook: ${dateTime} - ${serviceType}`);

          // Notification email
          await notifyNewBooking({ dateTime, serviceType });
        } catch (e) {
          console.error('❌ Post-traitement webhook:', e);
        }
      } else {
        console.warn('⚠️ Metadata manquante dans la session Stripe.');
      }
    }

    res.json({ received: true });
  }
);

// ------------------- Middlewares (après le webhook) -------------------
app.use(cors());
app.use(express.static('public'));
app.use(express.json());

// ------------------- Transport e-mail -------------------
const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: String(process.env.SMTP_PORT || 465) === '465', // true si 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Helper notification (mail HTML simple)
async function notifyNewBooking({ dateTime, serviceType }) {
  const html = `
    <h2>🗓️ Nouveau rendez-vous confirmé</h2>
    <p><b>Date/heure :</b> ${dateTime}</p>
    <p><b>Type :</b> ${serviceType}</p>
    <p>Ajouté à <code>reservations.json</code> et visible dans <a href="https://cabinet-sarah-cohen.onrender.com/calendar.ics">le flux iCal</a>.</p>
  `;
  await mailer.sendMail({
    from: process.env.NOTIFY_FROM,
    to: process.env.NOTIFY_TO,
    subject: `✅ Nouveau RDV — ${serviceType} — ${dateTime}`,
    html,
  });
}

// ------------------- Stripe Checkout -------------------
app.post('/create-checkout-session', async (req, res) => {
  const { dateTime, serviceType } = req.body;
  console.log('🟡 Données reçues :', req.body);

  if (!dateTime || !serviceType) {
    return res.status(400).json({ error: 'Champs manquants' });
  }

  const parsed = parseDateTimeFR(dateTime);
  if (isNaN(parsed)) {
    return res.status(400).json({ error: 'Format de date invalide (JJ/MM/AAAA HH:mm).' });
  }

  if (isSlotTaken(dateTime)) {
    return res.status(400).json({ error: 'Ce créneau est déjà réservé.' });
  }

  if (serviceType === 'cabinet' && isSunday(parsed)) {
    return res.status(400).json({ error: 'Pas de rendez-vous au cabinet le dimanche.' });
  }

  if (isTooLate(parsed, serviceType)) {
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

// ------------------- Route DEBUG : ajouter une résa sans Stripe -------------------
app.post('/debug/add', async (req, res) => {
  const { dateTime, serviceType } = req.body;
  if (!dateTime || !serviceType) return res.status(400).json({ error: 'dateTime et serviceType requis' });

  const d = parseDateTimeFR(dateTime);
  if (isNaN(d)) return res.status(400).json({ error: 'Format de date invalide (JJ/MM/AAAA HH:mm).' });

  addReservation({ dateTime, serviceType });

  try {
    await notifyNewBooking({ dateTime, serviceType }); // email immédiat
  } catch (e) {
    console.error('❌ Envoi email (debug/add):', e);
  }

  res.json({ ok: true, count: loadReservations().length });
});

// ------------------- Flux iCal (Google/iCloud) -------------------
app.get('/calendar.ics', (_req, res) => {
  try {
    const cal = ical({
      name: 'Calendrier Cabinet Sarah Cohen',
      // timezone: 'Europe/Paris', // tu peux décommenter si besoin
    });

    const reservations = loadReservations();
    reservations.forEach(r => {
      const start = parseDateTimeFR(r.dateTime);
      const end = new Date(start.getTime() + 60 * 60 * 1000); // +1h
      const location = r.serviceType === 'cabinet'
        ? 'Cabinet Sarah Cohen'
        : 'En ligne (Visio/Téléphone)';

      cal.createEvent({
        start,
        end,
        summary: `Consultation - ${r.serviceType}`,
        location,
        url: 'https://cabinet-sarah-cohen.onrender.com',
      });
    });

    // Événement de test si aucune résa
    if (reservations.length === 0) {
      cal.createEvent({
        start: new Date(Date.UTC(2025, 7, 13, 20, 0)), // 22:00 Paris été
        end:   new Date(Date.UTC(2025, 7, 13, 21, 0)),
        summary: 'Séance de peinture (test)',
        description: 'Évènement de démonstration',
        location: 'Cabinet Sarah Cohen',
      });
    }

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="calendar.ics"');
    res.send(cal.toString());
  } catch (err) {
    console.error('❌ ICS generation error:', err && err.stack ? err.stack : err);
    res.status(500).send('ICS generation failed: ' + (err && err.message ? err.message : String(err)));
  }
});

// ------------------- Lancement serveur (Render) -------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
