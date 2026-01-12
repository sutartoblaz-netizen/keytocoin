const express = require("express");
const bodyParser = require("body-parser");
const http = require("http");
const WebSocket = require("ws");
const { webcrypto, createHash } = require("crypto");

const subtle = webcrypto.subtle;

/* ================= CONFIG ================= */
const PORT = 8883;
const MAX_SUPPLY = 17_000_000;
const BLOCK_REWARD = 17;
const MINE_COOLDOWN = 15_000;

/* ================= APP ================= */
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(bodyParser.json({ limit: "50kb" }));

/* ================= STATE ================= */
const wallets = {};
const rateLimit = {};
let totalSupply = 0;
let blockHeight = 0;

/* ================= UTILS ================= */
function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function hexToBuf(hex) {
  if (!/^[0-9a-f]+$/i.test(hex)) return null;
  return new Uint8Array(hex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
}

function getIP(req) {
  return req.headers["x-forwarded-for"] || req.socket.remoteAddress;
}

function allowRate(ip, limit = 10, time = 10_000) {
  const now = Date.now();
  rateLimit[ip] ??= [];
  rateLimit[ip] = rateLimit[ip].filter(t => now - t < time);
  if (rateLimit[ip].length >= limit) return false;
  rateLimit[ip].push(now);
  return true;
}

/* ================= ADDRESS NORMALIZER ================= */
function normalizeAddress(address, pubKey = null) {
  if (typeof address === "string" && /^[a-f0-9]{64}$/i.test(address)) {
    return address;
  }
  if (pubKey) {
    return sha256(JSON.stringify(pubKey));
  }
  return null;
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(data);
  });
}

/* ================= WALLET ================= */
function getWallet(address) {
  if (!wallets[address]) {
    wallets[address] = {
      balance: 0,
      blocks: 0,
      nonce: 0,
      pubKey: null,
      lastMine: 0
    };
  }
  return wallets[address];
}

/* ================= VERIFY SIGNATURE ================= */
async function verifySignature({ from, to, amount, nonce, signature, pubKey }) {
  try {
    const derived = sha256(JSON.stringify(pubKey));
    if (derived !== from) return false;

    const wallet = getWallet(from);

    if (!wallet.pubKey) {
      wallet.pubKey = pubKey;
    } else if (JSON.stringify(wallet.pubKey) !== JSON.stringify(pubKey)) {
      return false;
    }

    const key = await subtle.importKey(
      "jwk",
      pubKey,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );

    const data = new TextEncoder().encode(
      from + to + amount + nonce
    );

    const sig = hexToBuf(signature);
    if (!sig) return false;

    return await subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      sig,
      data
    );
  } catch {
    return false;
  }
}

/* ================= API ================= */

app.get("/wallet/:address", (req, res) => {
  const address = normalizeAddress(req.params.address);
  if (!address) return res.json({ error: "Invalid address" });

  const w = getWallet(address);
  res.json({
    address,
    balance: w.balance,
    blocks: w.blocks,
    nonce: w.nonce,
    supply: totalSupply,
    height: blockHeight
  });
});

/* ================= SEND ================= */
app.post("/send", async (req, res) => {
  const ip = getIP(req);
  if (!allowRate(ip)) {
    return res.json({ error: "Too many requests" });
  }

  let { from, to, amount, nonce, signature, pubKey } = req.body;

  from = normalizeAddress(from, pubKey);
  to = normalizeAddress(to);

  if (!from || !to || from === to) {
    return res.json({ error: "Invalid address" });
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.json({ error: "Invalid amount" });
  }

  const sender = getWallet(from);
  const receiver = getWallet(to);

  if (nonce !== sender.nonce) {
    return res.json({ error: "Invalid nonce" });
  }

  if (sender.balance < amount) {
    return res.json({ error: "Insufficient balance" });
  }

  const valid = await verifySignature({
    from, to, amount, nonce, signature, pubKey
  });

  if (!valid) {
    return res.json({ error: "Invalid signature" });
  }

  sender.balance -= amount;
  receiver.balance += amount;
  sender.nonce++;

  broadcast({ type: "tx", from, to, amount });

  res.json({ message: "Transaction confirmed", from, to });
});

/* ================= MINE ================= */
app.post("/mine", (req, res) => {
  const ip = getIP(req);
  if (!allowRate(ip, 3, 10_000)) {
    return res.json({ error: "Mining rate limited" });
  }

  let { address, pubKey } = req.body;
  address = normalizeAddress(address, pubKey);

  if (!address) {
    return res.json({ error: "Invalid address" });
  }

  const w = getWallet(address);
  const now = Date.now();

  if (now - w.lastMine < MINE_COOLDOWN) {
    return res.json({ error: "Mining cooldown active" });
  }

  if (totalSupply >= MAX_SUPPLY) {
    return res.json({ error: "Max supply reached" });
  }

  const reward = Math.min(BLOCK_REWARD, MAX_SUPPLY - totalSupply);

  w.balance += reward;
  w.blocks++;
  w.lastMine = now;

  totalSupply += reward;
  blockHeight++;

  broadcast({ type: "mine", address, reward });

  res.json({ message: `Block mined 🪙 +${reward} KTC`, address });
});

/* ================= WEBSOCKET ================= */
wss.on("connection", ws => {
  ws.send(JSON.stringify({
    type: "sync",
    supply: totalSupply,
    height: blockHeight
  }));
});

/* ================= START ================= */
server.listen(PORT, () => {
  console.log(`🚀 KeytoCoin Final Server running on port ${PORT}`);
});
