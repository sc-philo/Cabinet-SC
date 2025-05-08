
const express = require('express');
const bodyParser = require('body-parser');
const stripe = require('stripe')('sk_test_51RHaSBCsDKqeKVJfLGX3pYREpuwMBH3JIGMDWpmfhU0BGSeigwAqEDSq9TtlDMjeZZoJSAw3ahQUoGZPALUUYGfX00n8QV4eTw');
const emailjs = require('@emailjs/nodejs');
const app = express();
const endpointSecret = 'whsec_VOTRE_SIGNATURE_ICI';

app.use(bodyParser.raw({ type: 'application/json' }));

app.post('/webhook', (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        emailjs.init("SC.cabinet-philosophe");
        emailjs.send("default_service", "SC.cabinet-philosophe", { service_type: session.metadata.serviceType, date_time: session.metadata.dateTime });
    }

    res.json({ received: true });
});

app.listen(4243, () => console.log("Webhook listening on 4243"));
