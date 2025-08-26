const express = require('express');
const ical    = require('ical-generator');
const fs      = require('fs');
const path    = require('path');

const router = express.Router();
const RESA_FILE = path.join(__dirname, '..', 'reservations.json');

// Convertit "15/08/2025 14:30" (ou ISO) en objet Date
function parseFRDateTime(str) {
  if (!str) return null;
  if (str.includes('/')) {
    const [d, m, y, h = '00', min = '00'] =
      str.replace(' ', '/').replace(':', '/').split('/').map(Number);
    return new Date(y, m - 1, d, h, min);
  }
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

router.get('/calendar.ics', (req, res) => {
  const cal = ical({ name: 'Calendrier Cabinet Sarah Cohen' });

  let reservations = [];
  try {
    reservations = JSON.parse(fs.readFileSync(RESA_FILE, 'utf8'));
  } catch (err) {
    console.error('Impossible de lire reservations.json :', err);
  }

  reservations.forEach(r => {
    const start = parseFRDateTime(r.dateTime);
    if (!start) return;
    const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 h
    cal.createEvent({
      start,
      end,
      summary: `Consultation — ${r.serviceType}`,
      description: `Séance ${r.serviceType}`,
      location: 'Cabinet Sarah Cohen',
      url: 'https://cabinet-sarah-cohen.onrender.com',
    });
  });

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="calendar.ics"'
  );
  cal.serve(res);
});

module.exports = router;
