const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(bodyParser.json());

/* ================= STATE ================= */
const wallets = Object.create(null);
let totalSupply = 0;
let blockHeight = 0;

const MAX_SUPPLY = 17_000_000;
const BLOCK_REWARD = 50;

/* ================= FAST WALLET INIT ================= */
function getWallet(addr) {
  return wallets[addr] ||= { balance: 0, blocks: 0 };
}

/* ================= RAW → DER ================= */
function rawToDer(hex) {
  const sig = Buffer.from(hex, "hex");
  const r = sig.slice(0, 32);
  const s = sig.slice(32, 64);

  const trim = b => {
    let i = 0;
    while (b[i] === 0 && i < b.length - 1) i++;
    return b.slice(i);
  };

  const rT = trim(r);
  const sT = trim(s);

  return Buffer.concat([
    Buffer.from([0x30, rT.length + sT.length + 4]),
    Buffer.from([0x02, rT.length]), rT,
    Buffer.from([0x02, sT.length]), sT
  ]);
}

/* ================= VERIFY ================= */
function verifySignature(from, to, amount, signature, pubKey) {
  const key = crypto.createPublicKey({ key: pubKey, format: "jwk" });
  const data = Buffer.from(from + to + amount);
  const sig = rawToDer(signature);

  return crypto.verify("sha256", data, key, sig);
}

/* ================= WALLET ================= */
app.get("/wallet/:address", (req, res) => {
  const w = getWallet(req.params.address);
  res.json({
    balance: w.balance,
    blocks: w.blocks,
    supply: totalSupply
  });
});

/* ================= MINE ================= */
app.post("/mine", (req, res) => {
  const { address } = req.body;
  if (!address) return res.json({ error: "No address" });
  if (totalSupply >= MAX_SUPPLY) return res.json({ error: "Max supply" });

  const w = getWallet(address);
  w.balance += BLOCK_REWARD;
  w.blocks++;
  totalSupply += BLOCK_REWARD;
  blockHeight++;

  broadcast({ type: "block", height: blockHeight });
  res.json({ message: `Block #${blockHeight} mined (+${BLOCK_REWARD} KTC)` });
});

/* ================= SEND TX ================= */
app.post("/send", (req, res) => {
  const { from, to, amount, signature, pubKey } = req.body;

  if (!from || !to || !signature || !pubKey || amount <= 0)
    return res.json({ error: "Invalid transaction" });

  const sender = getWallet(from);
  if (sender.balance < amount)
    return res.json({ error: "Insufficient balance" });

  /* VERIFY LAST (CPU SAVER) */
  if (!verifySignature(from, to, amount, signature, pubKey))
    return res.json({ error: "Invalid signature" });

  const receiver = getWallet(to);
  sender.balance -= amount;
  receiver.balance += amount;

  broadcast({ type: "tx", from, to, amount });
  res.json({ message: `Sent ${amount} KTC to ${to}` });
});

/* ================= WEBSOCKET ================= */
function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const ws of wss.clients)
    if (ws.readyState === 1) ws.send(msg);
}

wss.on("connection", ws => {
  ws.send(JSON.stringify({ type: "sync" }));
});

/* ================= START ================= */
const PORT = 8883;
server.listen(PORT, () => {
  console.log(`🪙 KeytoCoin FAST server @ http://localhost:${PORT}`);
});
