import PartySocket from "partysocket";
import QRCode from "qrcode";

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// DOM elements
const glyph = byId<HTMLDivElement>('glyph');
const sessionIdEl = byId<HTMLParagraphElement>('sessionId');
const previousInfo = byId<HTMLParagraphElement>('previousInfo');
const previousIdEl = byId<HTMLSpanElement>('previousId');
const switchBackBtn = byId<HTMLButtonElement>('switchBack');
const screens = {
  home: byId<HTMLElement>('screen-home'),
  code: byId<HTMLElement>('screen-code'),
  enter: byId<HTMLElement>('screen-enter'),
  connected: byId<HTMLElement>('screen-connected'),
};
const codeTitle = byId<HTMLHeadingElement>('codeTitle');
const hostName = byId<HTMLElement>('hostName');
const qrCanvas = byId<HTMLCanvasElement>('qr');
const pinDisplay = byId<HTMLParagraphElement>('pinDisplay');
const codeStatus = byId<HTMLParagraphElement>('codeStatus');
const pinForm = byId<HTMLFormElement>('pinForm');
const pinInput = byId<HTMLInputElement>('pinInput');
const enterError = byId<HTMLParagraphElement>('enterError');
const connStatus = byId<HTMLParagraphElement>('connStatus');
const promptBox = byId<HTMLDivElement>('prompt');
const promptGlyph = byId<HTMLDivElement>('promptGlyph');
const promptTitle = byId<HTMLParagraphElement>('promptTitle');
const promptId = byId<HTMLParagraphElement>('promptId');
const promptYes = byId<HTMLButtonElement>('promptYes');
const promptNo = byId<HTMLButtonElement>('promptNo');
const moreActions = byId<HTMLDetailsElement>('moreActions');

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

function saveSession({ beam = false } = {}) {
  sessionStorage.setItem(SESSION_KEY, mySessionId);
  if (previousSessionId) sessionStorage.setItem(PREVIOUS_KEY, previousSessionId);
  else sessionStorage.removeItem(PREVIOUS_KEY);
  sessionIdEl.textContent = mySessionId;
  previousIdEl.textContent = previousSessionId ? shortId(previousSessionId) : "";
  previousInfo.hidden = !previousSessionId;
  drawGlyph(glyph, mySessionId);
  if (beam) {
    glyph.classList.remove('beam');
    void glyph.offsetWidth; // restart the animation
    glyph.classList.add('beam');
  }
}

// Replaces this device's session, keeping the old one to switch back to.
function useSession(sessionId: string) {
  if (sessionId === mySessionId) return;
  previousSessionId = mySessionId;
  mySessionId = sessionId;
  saveSession({ beam: true });
}

// Swaps the two, so switching back can itself be undone.
switchBackBtn.onclick = () => {
  if (!previousSessionId) return;
  [mySessionId, previousSessionId] = [previousSessionId, mySessionId];
  saveSession({ beam: true });
};

// Session IDs come from the other device, so check they look like one.
const isSessionId = (value: unknown): value is string =>
  typeof value === "string" && /^[\w-]{1,100}$/.test(value);

const shortId = (id: string) => id.slice(0, 8);

// --- GLYPH ---
// A 5×5 mirrored pattern and a hue, both from a hash of the session ID, so
// the same session looks the same on every device.
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function drawGlyph(el: HTMLElement, sessionId: string) {
  const bits = hash(sessionId + "#cells");
  let cells = "";
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      if (!((bits >> (y * 3 + x)) & 1)) continue;
      cells += `<rect x="${x + 1}" y="${y + 1}" width="1" height="1"/>`;
      if (x < 2) cells += `<rect x="${5 - x}" y="${y + 1}" width="1" height="1"/>`;
    }
  }
  el.style.setProperty('--hue', String(hash(sessionId) % 360));
  el.innerHTML = `<svg viewBox="0 0 7 7" shape-rendering="crispEdges">${cells}</svg>`;
}

// --- SCREENS ---
type Screen = keyof typeof screens;

function show(screen: Screen) {
  for (const [name, el] of Object.entries(screens)) el.hidden = name !== screen;
  if (screen === 'enter') pinInput.focus();
}

type StatusKind = 'wait' | 'ok' | 'warn';
const STATUS_ICONS: Record<StatusKind, string> = {
  wait: '<span class="dot"></span>',
  ok: '<svg class="icon"><use href="#i-check"/></svg>',
  warn: '<svg class="icon"><use href="#i-alert"/></svg>',
};

function setStatus(el: HTMLElement, kind: StatusKind, text: string) {
  el.dataset.kind = kind;
  el.innerHTML = STATUS_ICONS[kind];
  el.append(text);
  el.hidden = false;
}

function ask(opts: { title: string; sessionId: string; yes: string; no: string; onYes: () => void; onNo: () => void }) {
  promptTitle.textContent = opts.title;
  promptId.textContent = opts.sessionId;
  drawGlyph(promptGlyph, opts.sessionId);
  promptYes.textContent = opts.yes;
  promptNo.textContent = opts.no;
  promptYes.onclick = () => { promptBox.hidden = true; opts.onYes(); };
  promptNo.onclick = () => { promptBox.hidden = true; opts.onNo(); };
  promptBox.hidden = false;
  promptYes.focus();
}

// --- PAIRING ---
// Both devices connect to the same PIN. The one showing the code knows what
// it's there for (sending or getting), so once paired it sends its session
// or asks for the other's by itself. The other device only has to agree.
type Intent = 'send' | 'get';

let ws: PartySocket | null = null;
let showingCode = false;

function send(message: Message) {
  ws?.send(JSON.stringify(message));
}

function sendMySession() {
  send({ type: "session_offer", sessionId: mySessionId });
  setStatus(connStatus, 'wait', "Sent this device's session. Waiting for your other device to use it…");
}

function askForTheirs() {
  send({ type: "session_request" });
  setStatus(connStatus, 'wait', "Asked your other device for its session. Waiting for it to send it…");
}

function disconnect() {
  const old = ws;
  ws = null;
  old?.close();
  promptBox.hidden = true;
}

function pair(pin: string, intent: Intent | null) {
  disconnect();
  let pendingIntent = intent;

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
        show('connected');
        moreActions.open = false;
        setStatus(connStatus, 'ok', "Connected to your other device.");
        // Do what this device came for, once per pairing.
        if (pendingIntent === 'send') sendMySession();
        if (pendingIntent === 'get') askForTheirs();
        pendingIntent = null;
        break;
      case "peer_left":
        promptBox.hidden = true;
        if (showingCode) {
          show('code');
          setStatus(codeStatus, 'warn', "Your other device disconnected. Scan the code again to reconnect.");
        } else {
          setStatus(connStatus, 'wait', "Your other device disconnected. Waiting for it to come back…");
        }
        break;
      case "session_request":
        ask({
          title: "Your other device wants this device's session.",
          sessionId: mySessionId,
          yes: "Send it", no: "Don't send",
          onYes: sendMySession,
          onNo: () => {
            send({ type: "session_request_denied" });
            setStatus(connStatus, 'warn', "You didn't send this device's session.");
          },
        });
        break;
      case "session_request_denied":
        setStatus(connStatus, 'warn', "Your other device didn't send its session.");
        break;
      case "session_offer":
        if (!isSessionId(msg.sessionId)) return;
        if (msg.sessionId === mySessionId) {
          send({ type: "session_used" });
          setStatus(connStatus, 'ok', "Both devices already use this session.");
          return;
        }
        ask({
          title: "Your other device sent its session. Use it on this device?",
          sessionId: msg.sessionId,
          yes: "Use it", no: "Keep mine",
          onYes: () => {
            useSession(msg.sessionId);
            send({ type: "session_used" });
            setStatus(connStatus, 'ok', "Done. This device now uses your other device's session.");
          },
          onNo: () => setStatus(connStatus, 'warn', "Kept this device's session."),
        });
        break;
      case "session_used":
        setStatus(connStatus, 'ok', "Done. Your other device now uses this session.");
        break;
    }
  });

  socket.addEventListener('close', (evt) => {
    if (socket !== ws || evt.code !== PIN_FULL) return;
    ws = null;
    showingCode = false;
    show('enter');
    setStatus(enterError, 'warn', `Code ${pin} is already connecting two devices. Ask for a new code.`);
  });
}

// --- CHOICES ---
async function showCode(intent: Intent) {
  showingCode = true;
  const pin = randomPin();
  const url = `${location.origin}${location.pathname}?pin=${pin}`;

  codeTitle.textContent = intent === 'send' ? "Move to another device" : "Bring to this device";
  hostName.textContent = location.host;
  pinDisplay.textContent = `${pin.slice(0, 3)} ${pin.slice(3)}`;
  pinDisplay.setAttribute('aria-label', `Code ${pin.split('').join(' ')}`);
  setStatus(codeStatus, 'wait', "Waiting for your other device…");
  await QRCode.toCanvas(qrCanvas, url, { width: 400, margin: 2, color: { dark: '#18202e', light: '#ffffff' } });
  show('code');
  pair(pin, intent);
}

// A random 6-digit PIN, 100000 to 999999.
function randomPin(): string {
  return (100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000)).toString();
}

function enterCode(pin: string) {
  showingCode = false;
  show('connected');
  moreActions.open = false;
  setStatus(connStatus, 'wait', `Connecting with code ${pin}…`);
  pair(pin, null);
}

function startOver() {
  disconnect();
  showingCode = false;
  history.replaceState(null, "", location.pathname);
  show('home');
}

byId<HTMLButtonElement>('chooseSend').onclick = () => showCode('send');
byId<HTMLButtonElement>('chooseGet').onclick = () => showCode('get');
byId<HTMLButtonElement>('chooseEnter').onclick = () => {
  enterError.hidden = true;
  pinInput.value = "";
  show('enter');
};
byId<HTMLButtonElement>('sendMine').onclick = sendMySession;
byId<HTMLButtonElement>('askTheirs').onclick = askForTheirs;
for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-action="start-over"]')) {
  btn.onclick = startOver;
}

pinInput.addEventListener('input', () => {
  pinInput.value = pinInput.value.replace(/\D/g, '').slice(0, 6);
});

pinForm.onsubmit = (evt) => {
  evt.preventDefault();
  enterCode(pinInput.value);
};

// --- ARRIVING FROM A SCANNED CODE (?pin=) ---
const urlPin = new URLSearchParams(location.search).get("pin");
if (urlPin && /^\d{6}$/.test(urlPin)) enterCode(urlPin);
else show('home');
