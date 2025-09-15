diff --git a/webhook.js b/webhook.js
index 5253e2ea8c68cabc773d152295c77915e8574bba..4847939218c27e6e7d2a66c0c6bdd808cd76a639 100644
--- a/webhook.js
+++ b/webhook.js
@@ -1,44 +1,51 @@
 // webhook.js
 const express = require('express');
 const fs = require('fs');
 const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
+const { sendAdminNotification } = require('./notifier');
 
 const app = express();
 const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
 const reservationsFile = './reservations.json';
 
 // Route Stripe en mode raw pour valider la signature
 app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
   const sig = req.headers['stripe-signature'];
 
   let event;
   try {
     event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
   } catch (err) {
     console.error('⚠️  Signature invalide :', err.message);
     return res.sendStatus(400);
   }
 
   // Traitement de l'événement
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
+
+    sendAdminNotification({
+      dateTime: newRes.dateTime,
+      serviceType: newRes.mode,
+      sessionId: session.id,
+    });
   }
 
   res.status(200).end();
 });
 
 // Activation du parsing JSON pour les autres routes
 app.use(express.json());
 
 const PORT = process.env.PORT || 3000;
 app.listen(PORT, () => console.log(`Webhook listening on port ${PORT}`));
