export function renderQrCode(element, text) {
  if (!element) return;
  element.innerHTML = "";

  if (!window.QRCode) {
    element.textContent = "QR library failed to load.";
    return;
  }

  new window.QRCode(element, {
    text,
    width: 240,
    height: 240,
    colorDark: "#050816",
    colorLight: "#ffffff",
    correctLevel: window.QRCode.CorrectLevel.M
  });
}
