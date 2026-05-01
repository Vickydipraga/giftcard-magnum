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

function resetModalState() {
  state.voucher = null;
  codeInput.value = "";
  flyerSection.classList.add("hidden");
  customerBadge.classList.add("hidden");
  selectedRestaurantBadge.classList.add("hidden");
  statusBox.className = "status-box hidden";
  statusBox.textContent = "";
  redeemButton.disabled = false;
  redeemButton.textContent = "Confirmar canje";

  if (state.selectedRestaurant) {
    syncSelectedRestaurantFromUi();
  }
}

function resetVoucherFlow() {
  resetModalState();
  state.selectedRestaurant = null;
  hideSelectionWarning();
  restaurantButtons.forEach((button) => button.classList.remove("active"));
  closeRedeemModal();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function fillVoucherUI(voucher) {
  customerBadge.textContent = voucher.customerName
    ? `Cliente: ${voucher.customerName}`
    : "Voucher sin nombre precargado";
  customerBadge.classList.remove("hidden");
  flyerCustomer.textContent = voucher.customerName || "Cliente por confirmar";
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

function redirectToWhatsapp(voucher) {
  if (!state.whatsappNumber) {
    showStatus("error", "Falta configurar el numero de WhatsApp.");
    redeemButton.disabled = false;
    redeemButton.textContent = "Confirmar canje";
    return;
  }

  showStatus("success", "Te redirigimos a WhatsApp...");
  window.open(buildWhatsappUrl(voucher), "_blank");
  resetVoucherFlow();
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
      flyerSection.classList.remove("hidden");
      showStatus("success", "Revisa tu voucher y confirma el canje cuando estes listo.");
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

  resetModalState();
  syncSelectedRestaurantFromUi();
  openRedeemModal();
});

closeRedeemModalButton.addEventListener("click", () => {
  closeRedeemModal();
  resetModalState();
});

modalBackdrop.addEventListener("click", () => {
  closeRedeemModal();
  resetModalState();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !redeemModal.classList.contains("hidden")) {
    closeRedeemModal();
    resetModalState();
  }
});

redeemButton.addEventListener("click", () => {
  if (!state.voucher || !state.selectedRestaurant) {
    showStatus("error", "Valida tu codigo y selecciona un restaurante.");
    return;
  }

  redeemButton.disabled = true;
  redeemButton.textContent = "Confirmando canje...";
  showStatus("info", "Confirmando canje...");

  postJson("/api/vouchers/redeem", {
    code: state.voucher.code,
    restaurant: state.selectedRestaurant
  })
    .then((data) => {
      state.voucher = data.voucher;
      redeemButton.textContent = "Abriendo WhatsApp...";
      redirectToWhatsapp(data.voucher);
    })
    .catch((error) => {
      redeemButton.disabled = false;
      redeemButton.textContent = "Confirmar canje";

      if (error.status === 409) {
        showStatus("error", "Este voucher ya fue canjeado.");
        return;
      }

      showStatus("error", error.message);
    });
});

loadMeta();
