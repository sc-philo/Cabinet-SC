const nodemailer = require('nodemailer');
const fs = require('fs');

// Create reusable transporter using environment variables
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendAdminNotification({ dateTime, serviceType, sessionId }) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: adminEmail,
      subject: 'Nouvelle réservation',
      text: `Une nouvelle réservation a été enregistrée.\n\nType : ${serviceType}\nDate : ${dateTime}\nSession : ${sessionId}`,
    });
  } catch (err) {
    const logMessage = `[${new Date().toISOString()}] Notification failure: ${err.message}\n`;
    try {
      fs.appendFileSync('notification-errors.log', logMessage);
    } catch (e) {
      console.error('Erreur de journalisation :', e);
    }
    console.error("Échec de l'envoi de notification :", err);
  }
}

module.exports = { transporter, sendAdminNotification };
