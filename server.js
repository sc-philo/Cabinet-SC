
const express = require('express');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const path = require('path');
const app = express();

// Autoriser CORS pour toutes les origines et méthodes GET, POST
app.use(cors({
    origin: "*",
    methods: ["GET", "POST"],
}));

app.use(express.json());

// Servir les fichiers statiques (index.html, etc.) depuis le dossier public
app.use(express.static(path.join(__dirname, 'public')));

// Route POST pour créer une session Stripe
app.post('/create-checkout-session', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: `Consultation - ${req.body.serviceType}`
                    },
                    unit_amount: 8000
                },
                quantity: 1
            }],
            mode: 'payment',
            success_url: 'https://sarah-cohen-cabinet-vrsu.onrender.com/success.html',
            cancel_url: 'https://sarah-cohen-cabinet-vrsu.onrender.com/cancel.html',
            metadata: {
                serviceType: req.body.serviceType,
                dateTime: req.body.dateTime
            }
        });

        res.json({ id: session.id });
    } catch (error) {
        console.error("Error creating checkout session:", error);
        res.status(500).send("Erreur lors de la création de la session de paiement.");
    }
});

// Définir le port, utile pour Render
const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
