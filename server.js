// server.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");

const app = express();
app.use(express.json());

const PORT = 8883;

/* ===============================
   BLOCKCHAIN STATE
================================ */
const blockchain = [];
const wallets = {};
const mempool = [];

let TOTAL_SUPPLY = 0;
const MAX_SUPPLY = 17_000_000;
const BLOCK_REWARD = 50;

/* ===============================
   GENESIS BLOCK
================================ */
blockchain.push({
  index: 0,
  prevHash: "0",
  timestamp: Date.now(),
  tx: [],
  miner: "genesis",
  hash: "GENESIS"
});

/* ===============================
   UTIL
================================ */
function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function getWallet(address) {
  if (!wallets[address]) {
    wallets[address] = { balance: 0, blocks: 0 };
  }
  return wallets[address];
}

function broadcast(type, data = {}) {
  const msg = JSON.stringify({ type, ...data });
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });
}

/* ===============================
   WALLET INFO
================================ */
app.get("/wallet/:address", (req, res) => {
  const w = getWallet(req.params.address);
  res.json({
    balance: w.balance,
    blocks: w.blocks,
    supply: TOTAL_SUPPLY
  });
});

/* ===============================
   VERIFY SIGNATURE
================================ */
function verifySignature(from, to, amount, signature, pubKey) {
  try {
    const verify = crypto.createVerify("SHA256");
    verify.update(from + to + amount);
    verify.end();

    return verify.verify(
      {
        key: crypto.createPublicKey({
          key: JSON.stringify(pubKey),
          format: "jwk"
        }),
        dsaEncoding: "ieee-p1363"
      },
      Buffer.from(signature, "hex")
    );
  } catch {
    return false;
  }
}

/* ===============================
   SEND TRANSACTION
================================ */
app.post("/send", (req, res) => {
  const { from, to, amount, signature, pubKey } = req.body;

  if (!from || !to || !amount || !signature || !pubKey) {
    return res.json({ error: "Invalid transaction format" });
  }

  const sender = getWallet(from);
  if (sender.balance < amount) {
    return res.json({ error: "Insufficient balance" });
  }

  if (!verifySignature(from, to, amount, signature, pubKey)) {
    return res.json({ error: "Invalid signature" });
  }

  sender.balance -= amount;
  getWallet(to).balance += amount;

  mempool.push({ from, to, amount });

  broadcast("tx", { from, to, amount });

  res.json({ message: "Transaction sent" });
});

/* ===============================
   MINE BLOCK
================================ */
app.post("/mine", (req, res) => {
  const { address } = req.body;
  if (!address) return res.json({ error: "No miner address" });

  if (TOTAL_SUPPLY >= MAX_SUPPLY) {
    return res.json({ error: "Max supply reached" });
  }

  const reward = Math.min(BLOCK_REWARD, MAX_SUPPLY - TOTAL_SUPPLY);

  const block = {
    index: blockchain.length,
    prevHash: blockchain[blockchain.length - 1].hash,
    timestamp: Date.now(),
    tx: mempool.splice(0),
    miner: address
  };

  block.hash = sha256(JSON.stringify(block));
  blockchain.push(block);

  TOTAL_SUPPLY += reward;

  const miner = getWallet(address);
  miner.balance += reward;
  miner.blocks++;

  broadcast("block", { index: block.index });

  res.json({ message: `Block #${block.index} mined (+${reward} KTC)` });
});

/* ===============================
   SERVER + WEBSOCKET
================================ */
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", ws => {
  ws.send(JSON.stringify({ type: "connected" }));
});

server.listen(PORT, () => {
  console.log("⛓ KeytoCoin node running on http://localhost:" + PORT);
});
