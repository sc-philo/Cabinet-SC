diff --git a/server.js b/server.js
index d2a4ebe7720edc9919396059be91d7fe849bd8ff..d8d679202374afc062bb58f105ed2f9e8e321359 100644
--- a/server.js
+++ b/server.js
@@ -1,31 +1,32 @@
 // --- Imports & init ---------------------------------------------------------
 const fs = require('fs');
 const express = require('express');
 const cors = require('cors');
 const bodyParser = require('body-parser');
 const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
+const { sendAdminNotification } = require('./notifier');
 
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
diff --git a/server.js b/server.js
index d2a4ebe7720edc9919396059be91d7fe849bd8ff..d8d679202374afc062bb58f105ed2f9e8e321359 100644
--- a/server.js
+++ b/server.js
@@ -33,50 +34,56 @@ app.post('/webhook', bodyParser.raw({ type: 'application/json' }), (req, res) =>
 
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
+
+        sendAdminNotification({
+          dateTime,
+          serviceType,
+          sessionId: session.id,
+        });
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
