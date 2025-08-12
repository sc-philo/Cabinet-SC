const express = require('express');
const router = express.Router();
const ical = require('ical-generator');

// Route pour générer et servir le flux iCal
router.get('/calendar.ics', (req, res) => {
    const cal = ical({ name: 'Calendrier Cabinet Sarah Cohen' });

    // Exemple d’événements — à remplacer plus tard par les vrais événements de ton site
    cal.createEvent({
        start: new Date(2025, 7, 15, 10, 0), // 15 août 2025, 10h00
        end: new Date(2025, 7, 15, 11, 0),
        summary: 'Consultation Client',
        description: 'Consultation psychologique avec Sarah Cohen',
        location: 'Cabinet Sarah Cohen',
        url: 'https://cabinet-sarah-cohen.onrender.com'
    });

    cal.createEvent({
        start: new Date(2025, 7, 16, 14, 0),
        end: new Date(2025, 7, 16, 15, 0),
        summary: 'Séance de Peinture',
        description: 'Atelier artistique avec Sarah',
        location: 'Atelier Cabinet Sarah Cohen'
    });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="calendar.ics"');
    cal.serve(res);
});

module.exports = router;

