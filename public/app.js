
flatpickr("#datetime", { enableTime: true, dateFormat: "d/m/Y H:i", locale: "fr", minDate: "today", time_24hr: true });

const serviceType = document.getElementById('service-type');
const datetime = document.getElementById('datetime');
const bookBtn = document.getElementById('book-btn');

function checkForm() {
    bookBtn.disabled = !(serviceType.value && datetime.value);
}

serviceType.addEventListener('change', checkForm);
datetime.addEventListener('input', checkForm);

document.getElementById('booking-form').addEventListener('submit', function(e) {
    e.preventDefault();

    fetch("/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            serviceType: serviceType.value,
            dateTime: datetime.value
        })
    })
    .then(res => {
        if (!res.ok) throw new Error("Erreur serveur");
        return res.json();
    })
    .then(session => {
        return Stripe("pk_live_51RHaSBCsDKqeKVJfv2mA8R62HyusAzPmAPi0ZOCEEfnOPjqzdyYGOWwbIGTxcq34UZ7Na0xoElsTKOCbOYs1Vxfo00vWC58ztY)
            .redirectToCheckout({ sessionId: session.id });
    })
    .catch(err => {
        console.error("Erreur lors de la création de la session Stripe :", err);
        alert("Impossible de créer la session de paiement. Veuillez réessayer plus tard.");
    });
});
