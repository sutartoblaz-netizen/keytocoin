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
function hexToBuf(hex) {
  if (!/^[0-9a-f]+$/i.test(hex)) return null;
  return new Uint8Array(hex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
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
      pubKey: null
    };
  }
  return wallets[address];
}

/* ================= VERIFY SIGNATURE ================= */
async function verifySignature({ from, to, amount, nonce, signature, pubKey }) {
  try {
    const derivedAddress = sha256(JSON.stringify(pubKey));
    if (derivedAddress !== from) return false;

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
  const w = getWallet(req.params.address);
  res.json({
    balance: w.balance,
    blocks: w.blocks,
    nonce: w.nonce,
    supply: totalSupply,
    height: blockHeight
  });
});

/* ================= SEND TX ================= */
app.post("/send", async (req, res) => {
  const ip = getIP(req);
  if (!allowRate(ip)) {
    return res.json({ error: "Too many requests" });
  }

  const { from, to, amount, nonce, signature, pubKey } = req.body;

  if (!from || !to || !signature || !pubKey) {
    return res.json({ error: "Invalid data" });
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

  res.json({ message: "Transaction confirmed" });
});

/* ================= MINE (NO LIMIT, NO COOLDOWN) ================= */
app.post("/mine", (req, res) => {
  const { address } = req.body;
  if (!address) return res.json({ error: "No address" });

  if (totalSupply + BLOCK_REWARD > MAX_SUPPLY) {
    return res.json({ error: "Max supply reached" });
  }

  const w = getWallet(address);

  w.balance += BLOCK_REWARD;
  w.blocks++;
  totalSupply += BLOCK_REWARD;
  blockHeight++;

  broadcast({ type: "mine", address, reward: BLOCK_REWARD });

  res.json({ message: ` Block mined 🪙 +${BLOCK_REWARD} KTC` });
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
  console.log(`🚀 KeytoCoin Secure Server running on port ${PORT}`);
});
