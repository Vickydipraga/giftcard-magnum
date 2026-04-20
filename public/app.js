const state = {
  voucher: null,
  selectedRestaurant: null,
  whatsappNumber: "5493513578562"
};

const form = document.getElementById("voucherForm");
const codeInput = document.getElementById("code");
const statusBox = document.getElementById("statusBox");
const flyerSection = document.getElementById("flyerSection");
const customerBadge = document.getElementById("customerBadge");
const selectedRestaurantBadge = document.getElementById("selectedRestaurantBadge");
const flyerRestaurant = document.getElementById("flyerRestaurant");
const flyerCustomer = document.getElementById("flyerCustomer");
const redeemButton = document.getElementById("redeemButton");
const redeemModal = document.getElementById("redeemModal");
const openRedeemModalButton = document.getElementById("openRedeemModalButton");
const closeRedeemModalButton = document.getElementById("closeRedeemModalButton");
const modalBackdrop = document.getElementById("modalBackdrop");
const selectionWarning = document.getElementById("selectionWarning");
const restaurantButtons = Array.from(document.querySelectorAll(".restaurant-card"));

function normalizePhoneNumber(phone) {
  return String(phone || "").replace(/[^\d]/g, "");
}

async function loadMeta() {
  try {
    const response = await fetch("/api/meta");
    const data = await response.json();
    state.whatsappNumber = normalizePhoneNumber(data.whatsappNumber) || state.whatsappNumber;
  } catch (error) {
    state.whatsappNumber = state.whatsappNumber;
  }
}

function formatDate(isoDate) {
  if (!isoDate) return "";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short" }).format(new Date(`${isoDate}T00:00:00`));
}

function showStatus(type, message) {
  statusBox.textContent = message;
  statusBox.className = `status-box ${type}`;
}

function openRedeemModal() {
  redeemModal.classList.remove("hidden");
  redeemModal.setAttribute("aria-hidden", "false");
  codeInput.focus();
}

function closeRedeemModal() {
  redeemModal.classList.add("hidden");
  redeemModal.setAttribute("aria-hidden", "true");
}

function hideSelectionWarning() {
  selectionWarning.classList.add("hidden");
}

function showSelectionWarning() {
  selectionWarning.classList.remove("hidden");
}

function resetVoucherFlow() {
  state.voucher = null;
  state.selectedRestaurant = null;
  codeInput.value = "";
  flyerSection.classList.add("hidden");
  customerBadge.classList.add("hidden");
  selectedRestaurantBadge.classList.add("hidden");
  statusBox.className = "status-box hidden";
  statusBox.textContent = "";
  hideSelectionWarning();
  restaurantButtons.forEach((button) => button.classList.remove("active"));
  closeRedeemModal();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function getSelectedRestaurantButton() {
  return restaurantButtons.find((button) => button.classList.contains("active")) || null;
}

function syncSelectedRestaurantFromUi() {
  const activeButton = getSelectedRestaurantButton();

  if (!activeButton) {
    return null;
  }

  state.selectedRestaurant = activeButton.dataset.restaurant;
  flyerRestaurant.textContent = activeButton.querySelector(".restaurant-name").textContent;
  selectedRestaurantBadge.textContent = `Restaurante: ${flyerRestaurant.textContent}`;
  selectedRestaurantBadge.classList.remove("hidden");
  hideSelectionWarning();
  return activeButton;
}

function buildWhatsappUrl(voucher) {
  const restaurantName = flyerRestaurant.textContent.trim();
  const customerName = voucher.customerName || "";
  const message = [
    `Hola, quiero canjear mi voucher de Magnum con el codigo "${voucher.code}" en el Restaurante ${restaurantName}`,
    "",
    `Mi nombre es: ${customerName}`,
    "Mi DNI:"
  ].join("\n");

  return `https://wa.me/${state.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

async function redeemAndRedirectToWhatsapp(voucher) {
  if (!state.whatsappNumber) {
    showStatus("error", "Falta configurar el numero de WhatsApp.");
    return;
  }

  try {
    showStatus("info", "Reservando voucher y abriendo WhatsApp...");

    await postJson("/api/vouchers/redeem", {
      code: voucher.code,
      restaurant: state.selectedRestaurant,
      customerName: voucher.customerName || ""
    });

    showStatus("success", "Codigo valido. Te redirigimos a WhatsApp...");
    window.open(buildWhatsappUrl(voucher), "_blank");
    resetVoucherFlow();
  } catch (error) {
    showStatus("error", error.message);
  }
}

function resetSelection() {
  state.selectedRestaurant = null;
  restaurantButtons.forEach((button) => button.classList.remove("active"));
  flyerSection.classList.add("hidden");
  selectedRestaurantBadge.classList.add("hidden");
  redeemButton.disabled = false;
  redeemButton.textContent = "Confirmar canje";
}

function fillVoucherUI(voucher) {
  customerBadge.textContent = voucher.customerName
    ? `Cliente: ${voucher.customerName}`
    : "Voucher sin nombre precargado";
  customerBadge.classList.remove("hidden");
  flyerCustomer.textContent = voucher.customerName || "Cliente por confirmar";
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.message || "Ocurrio un error");
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  syncSelectedRestaurantFromUi();
  showStatus("info", "Validando codigo...");

  try {
    const data = await postJson("/api/vouchers/check", {
      code: codeInput.value
    });

    state.voucher = data.voucher;
    fillVoucherUI(data.voucher);
    if (state.selectedRestaurant) {
      await redeemAndRedirectToWhatsapp(data.voucher);
    } else {
      showStatus("success", "Codigo valido. Ahora elige uno de los restaurantes.");
    }
  } catch (error) {
    state.voucher = null;
    customerBadge.classList.add("hidden");
    if (error.status === 404) {
      showStatus("error", "El codigo no existe.");
      return;
    }

    if (error.status === 409) {
      showStatus("error", "Este voucher ya fue canjeado.");
      return;
    }

    showStatus("error", error.message);
  }
});

loadMeta();

restaurantButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.selectedRestaurant = button.dataset.restaurant;
    restaurantButtons.forEach((item) => item.classList.toggle("active", item === button));
    flyerRestaurant.textContent = button.querySelector(".restaurant-name").textContent;
    selectedRestaurantBadge.textContent = `Restaurante: ${flyerRestaurant.textContent}`;
    selectedRestaurantBadge.classList.remove("hidden");
    hideSelectionWarning();

    if (!state.voucher) {
      showStatus("info", "Restaurante elegido. Ahora presiona Canjear y valida tu codigo.");
      return;
    }

    flyerSection.classList.remove("hidden");
    showStatus("info", "Revisa tu voucher y confirma el canje cuando estes listo.");
  });
});

openRedeemModalButton.addEventListener("click", () => {
  if (!syncSelectedRestaurantFromUi()) {
    showSelectionWarning();
    return;
  }
  openRedeemModal();
});

closeRedeemModalButton.addEventListener("click", closeRedeemModal);
modalBackdrop.addEventListener("click", closeRedeemModal);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !redeemModal.classList.contains("hidden")) {
    closeRedeemModal();
  }
});

redeemButton.addEventListener("click", async () => {
  if (!state.voucher || !state.selectedRestaurant) {
    showStatus("error", "Valida tu codigo y selecciona un restaurante.");
    return;
  }

  redeemButton.disabled = true;
  showStatus("info", "Procesando canje...");

  try {
    const data = await postJson("/api/vouchers/redeem", {
      code: state.voucher.code,
      restaurant: state.selectedRestaurant,
      customerName: state.voucher.customerName || ""
    });

    state.voucher = data.voucher;
    flyerCustomer.textContent = data.voucher.customerName || "Cliente confirmado";
    showStatus(
      "success",
      data.notification.sent
        ? "Voucher canjeado y aviso enviado por WhatsApp."
        : "Voucher canjeado. Falta configurar Twilio para el aviso por WhatsApp."
    );
    redeemButton.textContent = "Voucher canjeado";
  } catch (error) {
    redeemButton.disabled = false;
    showStatus("error", error.message);
  }
});
