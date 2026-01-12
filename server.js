const express = require("express");
const bodyParser = require("body-parser");
const http = require("http");
const WebSocket = require("ws");
const { webcrypto } = require("crypto");

const subtle = webcrypto.subtle;

/* ================= CONFIG ================= */
const PORT = 8883;
const MAX_SUPPLY = 17_000_000;
const BLOCK_REWARD = 17;

/* ================= APP ================= */
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(bodyParser.json());

/* ================= STATE ================= */
const wallets = {};
let totalSupply = 0;
let blockHeight = 0;

/* ================= UTILS ================= */
function hexToBuf(hex) {
  return new Uint8Array(hex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(data);
  });
}

/* ================= VERIFY SIGNATURE (FIXED) ================= */
async function verifySignature({ from, to, amount, signature, pubKey }) {
  try {
    const key = await subtle.importKey(
      "jwk",
      pubKey,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );

    const data = new TextEncoder().encode(from + to + amount);
    const sig = hexToBuf(signature);

    return await subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      sig,
      data
    );
  } catch (e) {
    console.error("VERIFY ERROR:", e.message);
    return false;
  }
}

/* ================= WALLET ================= */
function getWallet(address) {
  if (!wallets[address]) {
    wallets[address] = { balance: 0, blocks: 0, pubKey: null };
  }
  return wallets[address];
}

/* ================= API ================= */

app.get("/wallet/:address", (req, res) => {
  const w = getWallet(req.params.address);
  res.json({ balance: w.balance, blocks: w.blocks, supply: totalSupply });
});

/* SEND TX */
app.post("/send", async (req, res) => {
  const { from, to, amount, signature, pubKey } = req.body;

  if (!from || !to || !amount || !signature || !pubKey) {
    return res.json({ error: "Invalid transaction data" });
  }

  const sender = getWallet(from);
  const receiver = getWallet(to);

  if (sender.balance < amount) {
    return res.json({ error: "Insufficient balance" });
  }

  const valid = await verifySignature({ from, to, amount, signature, pubKey });
  if (!valid) {
    return res.json({ error: "Invalid signature" });
  }

  if (!sender.pubKey) sender.pubKey = pubKey;

  sender.balance -= amount;
  receiver.balance += amount;

  broadcast({ type: "tx", from, to, amount });

  res.json({ message: `Sent ${amount} KTC to ${to}` });
});

/* MINE */
app.post("/mine", (req, res) => {
  const { address } = req.body;
  if (!address) return res.json({ error: "No address" });

  if (totalSupply + BLOCK_REWARD > MAX_SUPPLY) {
    return res.json({ error: "Max supply reached" });
  }

  const w = getWallet(address);
  w.balance += BLOCK_REWARD;
  w.blocks += 1;

  totalSupply += BLOCK_REWARD;
  blockHeight++;

  broadcast({ type: "mine", address, reward: BLOCK_REWARD });

  res.json({ message: `Block mined 🪙 +${BLOCK_REWARD} KTC` });
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
  console.log(`🚀 KeytoCoin Server running http://keytocoin.global:${PORT}`);
});
