import PartySocket from "partysocket";
import QRCode from "qrcode";

// DOM elements
const sessionIdSpan = document.getElementById('sessionId') as HTMLSpanElement;
const previousInfo = document.getElementById('previousInfo') as HTMLParagraphElement;
const previousIdSpan = document.getElementById('previousId') as HTMLSpanElement;
const switchBackBtn = document.getElementById('switchBack') as HTMLButtonElement;
const generateBtn = document.getElementById('generate') as HTMLButtonElement;
const showPinBtn = document.getElementById('showPinBtn') as HTMLButtonElement;
const linkArea = document.getElementById('linkArea') as HTMLDivElement;
const joinUrlSpan = document.getElementById('joinUrl') as HTMLSpanElement;
const qrCanvas = document.getElementById('qr') as HTMLCanvasElement;
const pinSection = document.getElementById('pinSection') as HTMLDivElement;
const pinInput = document.getElementById('pinInput') as HTMLInputElement;
const joinByPin = document.getElementById('joinByPin') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLParagraphElement;
const pairedActions = document.getElementById('pairedActions') as HTMLDivElement;
const sendMineBtn = document.getElementById('sendMine') as HTMLButtonElement;
const askTheirsBtn = document.getElementById('askTheirs') as HTMLButtonElement;
const promptBox = document.getElementById('prompt') as HTMLDivElement;
const promptText = document.getElementById('promptText') as HTMLParagraphElement;
const promptYes = document.getElementById('promptYes') as HTMLButtonElement;
const promptNo = document.getElementById('promptNo') as HTMLButtonElement;

// Messages between the two devices, which the Teleporter relays as they are,
// and the two it sends itself (peer_joined, peer_left).
type Message =
  | { type: "peer_joined" }
  | { type: "peer_left" }
  | { type: "session_request" }
  | { type: "session_request_denied" }
  | { type: "session_offer"; sessionId: string }
  | { type: "session_used" };

// Close code the server sends when a PIN already has two devices (see
// PIN_FULL in src/teleporter.ts).
const PIN_FULL = 4000;

// --- SESSION ---
// Kept in sessionStorage, so it survives a reload but each tab is its own
// "device", and two tabs can try a transfer. A real app would keep it in
// localStorage or a cookie.
const SESSION_KEY = "teleporter.session";
const PREVIOUS_KEY = "teleporter.previousSession";

let mySessionId = sessionStorage.getItem(SESSION_KEY) ?? crypto.randomUUID();
let previousSessionId = sessionStorage.getItem(PREVIOUS_KEY);
saveSession();

function saveSession() {
  sessionStorage.setItem(SESSION_KEY, mySessionId);
  if (previousSessionId) sessionStorage.setItem(PREVIOUS_KEY, previousSessionId);
  else sessionStorage.removeItem(PREVIOUS_KEY);
  sessionIdSpan.textContent = mySessionId;
  previousIdSpan.textContent = previousSessionId ?? "";
  previousInfo.classList.toggle('hidden', !previousSessionId);
}

// Replaces this device's session, keeping the old one to switch back to.
function useSession(sessionId: string) {
  if (sessionId === mySessionId) return;
  previousSessionId = mySessionId;
  mySessionId = sessionId;
  saveSession();
}

// Swaps the two, so switching back can itself be undone.
switchBackBtn.onclick = () => {
  if (!previousSessionId) return;
  [mySessionId, previousSessionId] = [previousSessionId, mySessionId];
  saveSession();
};

// Session IDs come from the other device, so check they look like one.
const isSessionId = (value: unknown): value is string =>
  typeof value === "string" && /^[\w-]{1,100}$/.test(value);

// --- HELPERS ---
// A random 6-digit PIN, 100000 to 999999.
function randomPin(): string {
  return (100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000)).toString();
}

function showPrompt(text: string, yes: string, no: string, onYes: () => void, onNo: () => void) {
  promptText.textContent = text;
  promptYes.textContent = yes;
  promptNo.textContent = no;
  promptYes.onclick = () => { hidePrompt(); onYes(); };
  promptNo.onclick = () => { hidePrompt(); onNo(); };
  promptBox.classList.remove('hidden');
}

function hidePrompt() {
  promptBox.classList.add('hidden');
}

function setPaired(paired: boolean) {
  pairedActions.classList.toggle('hidden', !paired);
  if (!paired) hidePrompt();
}

// --- PAIRING ---
// Both devices connect to the same PIN, and after that they're equal: either
// can send its session or ask for the other's.
let ws: PartySocket | null = null;

function send(message: Message) {
  ws?.send(JSON.stringify(message));
}

function pair(pin: string) {
  if (!pin) return;
  ws?.close();
  setPaired(false);
  status.textContent = `Waiting for the other device on PIN ${pin}…`;

  // The Worker serves the page and the sockets, so connect to wherever the
  // page came from: ws(s)://<host>/teleporter/<pin>.
  const socket = new PartySocket({
    host: location.host,
    basePath: `teleporter/${pin}`,
    // Retrying a full PIN would never work.
    shouldReconnectOnClose: (evt) => evt.code !== PIN_FULL,
  });
  ws = socket;

  socket.addEventListener('message', (evt) => {
    let msg: Message;
    try {
      msg = JSON.parse(evt.data);
    } catch {
      return;
    }
    console.log("got:", msg);

    switch (msg.type) {
      case "peer_joined":
        status.textContent = `Paired on PIN ${pin}.`;
        setPaired(true);
        break;
      case "peer_left":
        status.textContent = `The other device left. Waiting for it on PIN ${pin}…`;
        setPaired(false);
        break;
      case "session_request":
        showPrompt(
          "The other device is asking for your session.", "Allow", "Deny",
          () => {
            send({ type: "session_offer", sessionId: mySessionId });
            status.textContent = "Sent your session.";
          },
          () => {
            send({ type: "session_request_denied" });
            status.textContent = "You didn't send your session.";
          },
        );
        break;
      case "session_request_denied":
        status.textContent = "The other device said no.";
        break;
      case "session_offer":
        if (!isSessionId(msg.sessionId)) return;
        showPrompt(
          `The other device sent its session: ${msg.sessionId}`, "Use it", "Ignore",
          () => {
            useSession(msg.sessionId);
            send({ type: "session_used" });
            status.textContent = "Now using the other device's session.";
          },
          () => { status.textContent = "Ignored the other device's session."; },
        );
        break;
      case "session_used":
        status.textContent = "The other device is now using your session.";
        break;
    }
  });

  socket.addEventListener('close', (evt) => {
    if (socket !== ws) return; // an old socket, replaced by pairing again
    setPaired(false);
    if (evt.code === PIN_FULL) status.textContent = `PIN ${pin} is already in use by two devices.`;
  });
}

sendMineBtn.onclick = () => {
  send({ type: "session_offer", sessionId: mySessionId });
  status.textContent = "Sent your session. Waiting for the other device to use it…";
};

askTheirsBtn.onclick = () => {
  send({ type: "session_request" });
  status.textContent = "Asked for the other device's session…";
};

// --- GENERATE A LINK ---
generateBtn.onclick = async () => {
  const pin = randomPin();
  const url = `${location.origin}${location.pathname}?pin=${pin}`;

  joinUrlSpan.textContent = url;
  linkArea.classList.remove('hidden');
  await QRCode.toCanvas(qrCanvas, url);

  pair(pin);
};

// --- OR ENTER A PIN ---
joinByPin.onclick = () => pair(pinInput.value.trim());

showPinBtn.onclick = () => {
  pinSection.classList.remove('hidden');
};

// --- AUTO PAIR IF URL HAS ?pin= ---
const params = new URLSearchParams(window.location.search);
const urlPin = params.get("pin");
if (urlPin) {
  pinSection.classList.remove('hidden');
  pinInput.value = urlPin;
  pair(urlPin);
}
