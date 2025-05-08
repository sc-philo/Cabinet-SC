# Cabinet Sarah Cohen

Site officiel de Sarah Cohen - Philosophie, Psychanalyse existentielle et anthropologie symbolique.

## Structure

- `public/` → Contient le site statique (HTML, CSS, JS, images)
- `server.js` → Serveur Node.js qui sert le site et gère Stripe
- `webhook.js` → Gestion des Webhooks Stripe (optionnel)
- `package.json` → Déclaration du projet Node.js pour Render ou Railway

## Déploiement

Compatible Render et Railway.

### Démarrer localement

```bash
npm install
node server.js
```

### Production (Render ou Railway)

- Connecter à GitHub
- Déployer via "New Web Service"
- Commande de démarrage : `node server.js`