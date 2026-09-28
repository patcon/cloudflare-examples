import PartySocket from "partysocket";
import QRCode from "qrcode";

// DOM elements
const generateBtn = document.getElementById('generate') as HTMLButtonElement;
const showPinBtn = document.getElementById('showPinBtn') as HTMLButtonElement;
const linkArea = document.getElementById('linkArea') as HTMLDivElement;
const joinUrlSpan = document.getElementById('joinUrl') as HTMLSpanElement;
const qrCanvas = document.getElementById('qr') as HTMLCanvasElement;
const pinSection = document.getElementById('pinSection') as HTMLDivElement;
const pinInput = document.getElementById('pinInput') as HTMLInputElement;
const joinByPin = document.getElementById('joinByPin') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLParagraphElement;

let senderWs: PartySocket | null = null;
let myPin: string | null = null;

// --- HELPERS ---
function randomPin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Close code the server sends when a PIN already has two devices (see
// PIN_FULL in src/teleporter.ts).
const PIN_FULL = 4000;

// The Worker serves the page and the sockets, so connect to wherever the page
// came from: ws(s)://<host>/teleporter/<pin>.
function connect(pin: string): PartySocket {
  const ws = new PartySocket({
    host: location.host,
    basePath: `teleporter/${pin}`,
    // Retrying a full PIN would never work.
    shouldReconnectOnClose: (evt) => evt.code !== PIN_FULL,
  });
  ws.addEventListener('close', (evt) => {
    if (evt.code !== PIN_FULL) return;
    pinSection.classList.remove('hidden');
    status.textContent = `PIN ${pin} is already in use by two devices.`;
  });
  return ws;
}

// --- Generate session ID immediately on page load ---
const mySessionId = crypto.randomUUID();
const sessionIdSpan = document.getElementById('sessionId') as HTMLSpanElement;
sessionIdSpan.textContent = mySessionId;
console.log("Host session ID:", mySessionId);

// --- SENDER FLOW ---
generateBtn.onclick = async () => {
  myPin = randomPin();
  const url = `${location.origin}${location.pathname}?pin=${myPin}`;

  joinUrlSpan.textContent = url;
  linkArea.classList.remove('hidden');

  await QRCode.toCanvas(qrCanvas, url);

  console.log("Connecting as sender, PIN:", myPin);

  if (senderWs) senderWs.close();
  senderWs = connect(myPin);

  senderWs.addEventListener('open', () => {
    console.log("[Sender] Connected, PIN:", myPin);
  });

  senderWs.addEventListener('message', (evt) => {
    const msg = JSON.parse(evt.data);
    console.log("[Sender] got message:", msg);

    if (msg.type === "request_session") {
      console.log("[Sender] sending session payload back:", mySessionId);
      senderWs!.send(JSON.stringify({
        type: "session_payload",
        payload: { sessionId: mySessionId }
      }));
    }
  });

  senderWs.addEventListener('close', () => {
    console.log("[Sender] Connection closed");
  });
};

// --- RECEIVER FLOW ---
function joinToRoom(pin: string) {
  if (!pin) return;

  console.log("Connecting as receiver, PIN:", pin);

  const ws2 = connect(pin);

  ws2.addEventListener('open', () => {
    console.log("[Receiver] Connected, requesting session");
    ws2.send(JSON.stringify({ type: "request_session" }));
  });

  ws2.addEventListener('message', (evt) => {
    const msg = JSON.parse(evt.data);
    console.log("[Receiver] got:", msg);
    if (msg.type === "session_payload") {
      status.textContent = `Received session: ${msg.payload.sessionId}`;
    }
  });

  ws2.addEventListener('close', () => {
    console.log("[Receiver] Connection closed");
  });
}

joinByPin.onclick = () => joinToRoom(pinInput.value.trim());

// --- SHOW PIN INPUT ---
showPinBtn.onclick = () => {
  pinSection.classList.remove('hidden');
};

// --- AUTO JOIN IF URL HAS ?pin= ---
const params = new URLSearchParams(window.location.search);
const urlPin = params.get("pin");
if (urlPin) {
  pinSection.classList.remove('hidden'); // show input/status
  pinInput.value = urlPin; // optional pre-fill
  joinToRoom(urlPin);
}
