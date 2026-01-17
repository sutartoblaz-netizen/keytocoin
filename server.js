const express = require("express");
const bodyParser = require("body-parser");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/* ================= CONFIG ================= */
const PORT = 8883;
const MAX_SUPPLY = 17_000_000;
const BLOCK_REWARD = 17;
const POW_DIFFICULTY = 4;
const MINE_COOLDOWN = 15_000; // ms

/* ================= STATE ================= */
let totalSupply = 0;
const wallets = {};        // address -> { balance, blocks }
const chain = [];          // block history
const mempool = [];
const lastMine = {};       // address -> timestamp

/* ================= MIDDLEWARE ================= */
app.use(bodyParser.json());
app.use((_, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

/* ================= UTILS ================= */
function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function now() {
  return Date.now();
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(data);
  });
}

/* ================= BLOCK ================= */
function createBlock({ miner, txs, nonce, powHash }) {
  const prev = chain[chain.length - 1];
  const block = {
    index: chain.length,
    time: now(),
    miner,
    txs,
    nonce,
    powHash,
    prevHash: prev ? sha256(JSON.stringify(prev)) : "GENESIS"
  };
  block.hash = sha256(JSON.stringify(block));
  return block;
}

/* ================= WALLET ================= */
function getWallet(address) {
  if (!wallets[address]) {
    wallets[address] = { balance: 0, blocks: 0 };
  }
  return wallets[address];
}

/* ================= VERIFY ================= */
function verifySignature(from, to, amount, signatureHex, pubKeyJwk) {
  try {
    const verify = crypto.createVerify("SHA256");
    verify.update(from + to + amount);
    verify.end();

    const pub = crypto.createPublicKey({
      key: pubKeyJwk,
      format: "jwk"
    });

    return verify.verify(pub, Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}

/* ================= API ================= */

// WALLET INFO
app.get("/wallet/:address", (req, res) => {
  const w = getWallet(req.params.address);
  res.json({
    balance: w.balance,
    blocks: w.blocks,
    supply: totalSupply
  });
});

// SEND TX
app.post("/send", (req, res) => {
  const { from, to, amount, signature, pubKey } = req.body;
  if (!from || !to || !amount) return res.json({ error: "Invalid TX" });

  const sender = getWallet(from);
  if (sender.balance < amount)
    return res.json({ error: "Insufficient balance" });

  if (!verifySignature(from, to, amount, signature, pubKey))
    return res.json({ error: "Invalid signature" });

  sender.balance -= amount;
  getWallet(to).balance += amount;

  mempool.push({ from, to, amount, time: now() });
  broadcast({ type: "tx", to });

  res.json({ message: "Transaction confirmed" });
});

// MINE
app.post("/mine", (req, res) => {
  const { address, nonce, powHash } = req.body;
  if (!address) return res.json({ error: "No miner address" });

  const last = lastMine[address] || 0;
  if (now() - last < MINE_COOLDOWN)
    return res.json({ error: "Mining cooldown" });

  if (!powHash.startsWith("0".repeat(POW_DIFFICULTY)))
    return res.json({ error: "Invalid PoW" });

  if (totalSupply + BLOCK_REWARD > MAX_SUPPLY)
    return res.json({ error: "Max supply reached" });

  const block = createBlock({
    miner: address,
    txs: mempool.splice(0),
    nonce,
    powHash
  });

  chain.push(block);
  totalSupply += BLOCK_REWARD;

  const w = getWallet(address);
  w.balance += BLOCK_REWARD;
  w.blocks += 1;
  lastMine[address] = now();

  broadcast({ type: "block", miner: address });

  res.json({ message: `Block #${block.index} mined (+${BLOCK_REWARD} KTC)` });
});

/* ================= WS ================= */
wss.on("connection", ws => {
  ws.send(JSON.stringify({ type: "sync", supply: totalSupply }));
});

/* ================= START ================= */
server.listen(PORT, () => {
  console.log(`⛓️ KeytoCoin node running on http://localhost:${PORT}`);
