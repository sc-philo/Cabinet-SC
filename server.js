
const express = require('express');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

app.post('/create-checkout-session', async (req, res) => {
    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price_data: { currency: 'eur', product_data: { name: `Consultation - ${req.body.serviceType}` }, unit_amount: 8000 }, quantity: 1 }],
        mode: 'payment',
        success_url: 'https://votre-site.com/success.html',
        cancel_url: 'https://votre-site.com/cancel.html',
        metadata: { serviceType: req.body.serviceType, dateTime: req.body.dateTime }
    });
    res.json({ id: session.id });
});

app.listen(4242, () => console.log("Server running on port 4242"));
