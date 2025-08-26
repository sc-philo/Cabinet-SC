// --- Imports & init ---------------------------------------------------------
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Si tu as ce fichier : routes/calendar.js
let calendarRoute = null;
try {
  calendarRoute = require('./routes/calendar');
} catch (e) {
  // pas grave s’il n’existe pas
}

const app = express();
app.use(cors());

// ---------------------------------------------------------------------------
// 1) WEBHOOK STRIPE (raw body, AVANT express.json())
// ---------------------------------------------------------------------------
app.post('/webhook', bodyParser.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('⚠️  Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      console.log('💰 Paiement confirmé :', session.id);

      const meta = session.metadata || {};
      const dateTime    = meta.dateTime    || null;
      const serviceType = meta.serviceType || null;

      try {
        const reservationsFile = './reservations.json';
        const current = fs.existsSync(reservationsFile)
          ? JSON.parse(fs.readFileSync(reservationsFile, 'utf8'))
          : [];

        current.push({
          session_id: session.id,
          dateTime,
          serviceType,
          createdAt: new Date().toISOString(),
        });

        fs.writeFileSync(reservationsFile, JSON.stringify(current, null, 2));
        console.log('📝 Réservation enregistrée via webhook.');
      } catch (e) {
        console.error('Erreur écriture reservations.json (webhook):', e);
      }
      break;
    }
    default:
      console.log('ℹ️  Événement Stripe non géré :', event.type);
  }

  res.sendStatus(200);
});

// ---------------------------------------------------------------------------
// 2) Le reste de l’app (JSON, statiques, utilitaires)
// ---------------------------------------------------------------------------
app.use(express.json());                // APRÈS le webhook
app.use(express.static('public'));      // tes fichiers publics (index.html, etc.)
if (calendarRoute) app.use('/', calendarRoute);

// ---------------------- Utils réservation & règles -------------------------
const RESA_FILE = './reservations.json';

function parseFRDateTime(dateTimeStr) {
  if (!dateTimeStr) return null;
  if (dateTimeStr.includes('/')) {
    const [datePart, timePart] = dateTimeStr.trim().split(/[ T]/);
    const [d, m, y] = datePart.split('/').map(Number);
    const [hh, mm] = (timePart || '00:00').split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm);
  }
  const d = new Date(dateTimeStr);
  return isNaN(d) ? null : d;
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

function outOfDailyWindow(d, serviceType) {
  if (serviceType === 'visio' || serviceType === 'telephone') {
    const h = d.getHours();
    const m = d.getMinutes();
    const afterStart = h > 7 || (h === 7 && m >= 0);
    const beforeEnd  = h < 23 || (h === 23 && m <= 30);
    return !(afterStart && beforeEnd);
  }
  return false;
}

function isSlotTaken(dateTime) {
  if (!fs.existsSync(RESA_FILE)) return false;
  try {
    const reservations = JSON.parse(fs.readFileSync(RESA_FILE, 'utf8'));
    return reservations.some(r => r.dateTime === dateTime);
  } catch {
    return false;
  }
}

// ---------------------- Route checkout session -----------------------------
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { dateTime, serviceType } = req.body;

    if (!dateTime || !serviceType) {
      return res.status(400).json({
        error: "Champs manquants",
        message:
          "Merci d’indiquer un type de séance et un créneau date/heure.",
      });
    }

    const parsed = parseFRDateTime(dateTime);
    if (!parsed || isNaN(parsed)) {
      return res.status(400).json({
        error: "Format de date invalide",
        message:
          "Format attendu : JJ/MM/AAAA HH:MM (ex. 15/08/2025 14:30).",
      });
    }

    if (serviceType === 'cabinet' && isSunday(parsed)) {
      return res.status(400).json({
        error: "Dimanche non disponible",
        message:
          "Les rendez-vous au cabinet ne sont pas disponibles le dimanche.",
      });
    }

    if (isTooLate(parsed, serviceType)) {
      return res.status(400).json({
        error: "Créneau trop proche",
        message:
          serviceType === 'cabinet'
            ? "Les rendez-vous au cabinet doivent être pris au moins 24h à l’avance."
            : "Les rendez-vous en visio/téléphone doivent être pris au moins 2h à l’avance.",
      });
    }

    if (outOfDailyWindow(parsed, serviceType)) {
      return res.status(400).json({
        error: "Hors horaires",
        message:
          "Visio / téléphone : réservation possible entre 07:00 et 23:30.",
      });
    }

    if (isSlotTaken(dateTime)) {
      return res.status(400).json({
        error: "Créneau indisponible",
        message: "Ce créneau est déjà réservé. Merci de choisir une autre heure.",
      });
    }

    const amount = 8000; // 80,00 €

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            unit_amount: amount,
            product_data: {
              name: `Consultation — ${serviceType}`,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${req.headers.origin}/success.html`,
      cancel_url: `${req.headers.origin}/cancel.html`,
      metadata: { dateTime, serviceType },
    });

    return res.json({ id: session.id });
  } catch (err) {
    console.error('❌ Erreur Stripe /create-checkout-session :', err);
    return res.status(500).json({
      error: "StripeError",
      message:
        "Impossible de créer la session de paiement pour le moment. Merci de réessayer dans quelques minutes.",
    });
  }
});

// ---------------------- Démarrage ------------------------------------------
const PORT = process.env.PORT || 10000; // Render lie le port automatiquement
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
