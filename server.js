// ================================
// KEYTOCOIN FINAL SERVER.JS
// ================================
const express = require("express");
const bodyParser = require("body-parser");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(bodyParser.json());

// ================================
// KONFIGURASI
// ================================
const PORT = 8883;
const MAX_SUPPLY = 17_000_000;
const BLOCK_REWARD = 17;
const DIFFICULTY = 4;

// ================================
// STATE BLOCKCHAIN
// ================================
let totalSupply = 0;
let chain = [];
let balances = {};
let minedBlocks = {};

// ================================
// UTIL HASH
// ================================
function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

// ================================
// VERIFY SIGNATURE (ECDSA P-256)
// ================================
function verifySignature(from, to, amount, signatureHex, pubKeyJwk) {
  try {
    const verify = crypto.createVerify("SHA256");
    verify.update(from + to + amount);
    verify.end();

    const pubKey = crypto.createPublicKey({
      key: pubKeyJwk,
      format: "jwk"
    });

    return verify.verify(
      pubKey,
      Buffer.from(signatureHex, "hex")
    );
  } catch {
    return false;
  }
}

// ================================
// GENESIS BLOCK
// ================================
chain.push({
  index: 0,
  prevHash: "0",
  timestamp: Date.now(),
  nonce: 0,
  hash: sha256("genesis"),
  txs: []
});

// ================================
// WALLET INFO
// ================================
app.get("/wallet/:address", (req, res) => {
  const addr = req.params.address;
  res.json({
    balance: balances[addr] || 0,
    blocks: minedBlocks[addr] || 0,
    supply: totalSupply
  });
});

// ================================
// SEND TRANSACTION
// ================================
app.post("/send", (req, res) => {
  const { from, to, amount, signature, pubKey } = req.body;

  if (!from || !to || !amount || !signature || !pubKey)
    return res.json({ error: "Invalid transaction format" });

  if ((balances[from] || 0) < amount)
    return res.json({ error: "Insufficient balance" });

  if (
    !verifySignature(from, to, amount, signature, pubKey)
  )
    return res.json({ error: "Invalid signature" });

  // APPLY TRANSFER
  balances[from] -= amount;
  balances[to] = (balances[to] || 0) + amount;

  const tx = { from, to, amount, time: Date.now() };

  // BROADCAST
  broadcast({ type: "tx", ...tx });

  res.json({ message: "Transaction confirmed" });
});

// ================================
// MINING
// ================================
app.post("/mine", (req, res) => {
  const { address, nonce, powHash } = req.body;

  if (!address || nonce === undefined || !powHash)
    return res.json({ error: "Invalid mining data" });

  const data = address + "|";
  if (!powHash.startsWith("0".repeat(DIFFICULTY)))
    return res.json({ error: "Invalid PoW" });

  if (totalSupply + BLOCK_REWARD > MAX_SUPPLY)
    return res.json({ error: "Max supply reached" });

  // CREATE BLOCK
  const prev = chain[chain.length - 1];
  const block = {
    index: chain.length,
    prevHash: prev.hash,
    timestamp: Date.now(),
    nonce,
    hash: sha256(prev.hash + powHash),
    miner: address
  };

  chain.push(block);

  // REWARD
  balances[address] = (balances[address] || 0) + BLOCK_REWARD;
  minedBlocks[address] = (minedBlocks[address] || 0) + 1;
  totalSupply += BLOCK_REWARD;

  broadcast({
    type: "mine",
    miner: address,
    reward: BLOCK_REWARD,
    supply: totalSupply
  });

  res.json({ message: "Block mined KTC" });
});

// ================================
// WEBSOCKET
// ================================
function broadcast(msg) {
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) {
      c.send(JSON.stringify(msg));
    }
  });
}

wss.on("connection", ws => {
  ws.send(JSON.stringify({
    type: "info",
    message: "Connected to KeytoCoin Network"
  }));
});

// ================================
// START SERVER
// ================================
server.listen(PORT, () => {
  console.log(`⛓️ KeytoCoin running on http://localhost:${PORT}`);
});
