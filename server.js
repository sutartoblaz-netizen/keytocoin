// ======================================================
// 🔗 KEYTOCOIN BLOCKCHAIN SERVER (FINAL MATCHED)
// ======================================================

const express = require("express");
const bodyParser = require("body-parser");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");

const PORT = 8883;
const DIFFICULTY = 4;
const BLOCK_REWARD = 17;
const MAX_SUPPLY = 17_000_000;

const app = express();
app.use(bodyParser.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ======================================================
// 🧱 CHAIN STATE
// ======================================================
let blockchain = [];
let mempool = [];
let balances = {};
let minedBlocks = {};
let totalSupply = 0;

// ======================================================
// 🔐 UTIL
// ======================================================
function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function broadcast(msg) {
  const d = JSON.stringify(msg);
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(d);
  });
}

// ======================================================
// 🧱 GENESIS
// ======================================================
blockchain.push({
  index: 0,
  timestamp: Date.now(),
  txs: [],
  prevHash: "0".repeat(64),
  nonce: 0,
  hash: sha256("KEYTOCOIN-GENESIS")
});

// ======================================================
// 📡 WEBSOCKET
// ======================================================
wss.on("connection", ws => {
  ws.send(JSON.stringify({ type: "info", message: "Connected" }));
});

// ======================================================
// 🔐 VERIFY SIGNATURE (ECDSA)
// ======================================================
function verifySignature(tx) {
  try {
    const verify = crypto.createVerify("SHA256");
    verify.update(tx.from + tx.to + tx.amount);
    verify.end();

    const pub = crypto.createPublicKey({
      key: tx.pubKey,
      format: "jwk"
    });

    return verify.verify(pub, Buffer.from(tx.signature, "hex"));
  } catch {
    return false;
  }
}

// ======================================================
// 💼 WALLET INFO (USED BY UI)
// ======================================================
app.get("/wallet/:addr", (req, res) => {
  const a = req.params.addr;
  res.json({
    balance: balances[a] || 0,
    blocks: minedBlocks[a] || 0,
    supply: totalSupply
  });
});

// ======================================================
// 💸 SEND TRANSACTION
// ======================================================
app.post("/send", (req, res) => {
  const { from, to, amount, signature, pubKey } = req.body;

  if (!from || !to || !amount)
    return res.json({ error: "Invalid TX data" });

  if ((balances[from] || 0) < amount)
    return res.json({ error: "Insufficient balance" });

  const tx = { from, to, amount, signature, pubKey };

  if (!verifySignature(tx))
    return res.json({ error: "Invalid signature" });

  mempool.push({ ...tx, timestamp: Date.now() });
  broadcast({ type: "tx", to });

  res.json({ message: "Transaction accepted" });
});

// ======================================================
// ⛏ MINING
// ======================================================
app.post("/mine", (req, res) => {
  const { address, nonce, powHash } = req.body;

  if (!powHash.startsWith("0".repeat(DIFFICULTY)))
    return res.json({ error: "Invalid PoW" });

  if (totalSupply >= MAX_SUPPLY)
    return res.json({ error: "Max supply reached" });

  const rewardTx = {
    from: "COINBASE",
    to: address,
    amount: BLOCK_REWARD
  };

  const block = {
    index: blockchain.length,
    timestamp: Date.now(),
    txs: [rewardTx, ...mempool],
    prevHash: blockchain[blockchain.length - 1].hash,
    nonce
  };

  block.hash = sha256(JSON.stringify(block));

  // APPLY TX
  block.txs.forEach(tx => {
    if (tx.from !== "COINBASE")
      balances[tx.from] -= tx.amount;

    balances[tx.to] = (balances[tx.to] || 0) + tx.amount;
  });

  totalSupply += BLOCK_REWARD;
  minedBlocks[address] = (minedBlocks[address] || 0) + 1;

  blockchain.push(block);
  mempool = [];

  broadcast({ type: "block" });

  res.json({ message: "Block mined successfully" });
});

// ======================================================
// 🌐 INFO
// ======================================================
app.get("/chain", (_, res) => res.json(blockchain));
app.get("/", (_, res) => res.send("KeytoCoin Node Running"));

// ======================================================
// 🚀 START
// ======================================================
server.listen(PORT, () => {
  console.log("⛓ KeytoCoin running on port", PORT);
});
