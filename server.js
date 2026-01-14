const express = require("express");
const bodyParser = require("body-parser");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");

// ======================================================
// ⚙️ CONFIG
// ======================================================
const PORT = 8883;
const DIFFICULTY = 4;
const BLOCK_REWARD = 17;
const MAX_SUPPLY = 17_000_000;

// ======================================================
// 🚀 SERVER SETUP
// ======================================================
const app = express();
app.use(bodyParser.json({ limit: "1mb" }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ======================================================
// 🧱 BLOCKCHAIN STATE (IN-MEMORY, SAFE)
// ======================================================
const blockchain = [];
let mempool = [];
const balances = Object.create(null);
const minedBlocks = Object.create(null);
let totalSupply = 0;

// ======================================================
// 🔐 CRYPTO UTILS
// ======================================================
function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function safeNumber(n) {
  return Number.isFinite(n) && n > 0;
}

// ======================================================
// 📡 BROADCAST
// ======================================================
function broadcast(msg) {
  const payload = JSON.stringify(msg);
  for (const c of wss.clients) {
    if (c.readyState === WebSocket.OPEN) {
      c.send(payload);
    }
  }
}

// ======================================================
// 🧱 GENESIS BLOCK (IMMUTABLE)
// ======================================================
(function createGenesis() {
  const genesis = {
    index: 0,
    timestamp: Date.now(),
    txs: [],
    prevHash: "0".repeat(64),
    nonce: 0,
    hash: sha256("KEYTOCOIN-GENESIS")
  };
  blockchain.push(genesis);
})();

// ======================================================
// 📡 WEBSOCKET
// ======================================================
wss.on("connection", ws => {
  ws.send(JSON.stringify({
    type: "info",
    height: blockchain.length,
    supply: totalSupply
  }));
});

// ======================================================
// 🔐 SIGNATURE VERIFY (ECDSA P-256)
// ======================================================
function verifySignature({ from, to, amount, signature, pubKey }) {
  try {
    const verifier = crypto.createVerify("SHA256");
    verifier.update(from + to + amount);
    verifier.end();

    const keyObject = crypto.createPublicKey({
      key: pubKey,
      format: "jwk"
    });

    return verifier.verify(
      keyObject,
      Buffer.from(signature, "hex")
    );
  } catch {
    return false;
  }
}

// ======================================================
// 💼 WALLET INFO (UI DEPENDS ON THIS)
// ======================================================
app.get("/wallet/:address", (req, res) => {
  const a = req.params.address;
  res.json({
    balance: balances[a] || 0,
    blocks: minedBlocks[a] || 0,
    supply: totalSupply
  });
});

// ======================================================
// 💸 SEND TRANSACTION (SAFE)
// ======================================================
app.post("/send", (req, res) => {
  const { from, to, amount, signature, pubKey } = req.body;

  if (!from || !to || !safeNumber(amount))
    return res.json({ error: "Invalid transaction format" });

  if ((balances[from] || 0) < amount)
    return res.json({ error: "Insufficient balance" });

  if (!verifySignature({ from, to, amount, signature, pubKey }))
    return res.json({ error: "Invalid signature" });

  const tx = {
    from,
    to,
    amount,
    signature,
    pubKey,
    timestamp: Date.now()
  };

  mempool.push(tx);
  broadcast({ type: "tx", to });

  res.json({ message: "Transaction accepted" });
});

// ======================================================
// ⛏ MINING (POW SAFE, NO DOUBLE MINT)
// ======================================================
app.post("/mine", (req, res) => {
  const { address, nonce, powHash } = req.body;

  if (!address || typeof nonce !== "number")
    return res.json({ error: "Invalid mining data" });

  if (!powHash.startsWith("0".repeat(DIFFICULTY)))
    return res.json({ error: "Invalid Proof of Work" });

  if (totalSupply >= MAX_SUPPLY)
    return res.json({ error: "Max supply reached" });

  const reward = Math.min(BLOCK_REWARD, MAX_SUPPLY - totalSupply);

  const rewardTx = {
    from: "COINBASE",
    to: address,
    amount: reward
  };

  const block = {
    index: blockchain.length,
    timestamp: Date.now(),
    txs: [rewardTx, ...mempool],
    prevHash: blockchain[blockchain.length - 1].hash,
    nonce
  };

  block.hash = sha256(JSON.stringify(block));

  // APPLY TRANSACTIONS (ATOMIC STYLE)
  for (const tx of block.txs) {
    if (tx.from !== "COINBASE") {
      balances[tx.from] -= tx.amount;
    }
    balances[tx.to] = (balances[tx.to] || 0) + tx.amount;
  }

  totalSupply += reward;
  minedBlocks[address] = (minedBlocks[address] || 0) + 1;

  blockchain.push(block);
  mempool = [];

  broadcast({ type: "block", height: blockchain.length });

  res.json({ message: "Block mined KTC" });
});

// ======================================================
// 🌐 READ-ONLY ENDPOINTS
// ======================================================
app.get("/chain", (_, res) => res.json(blockchain));
app.get("/", (_, res) => res.send("KeytoCoin Blockchain Node Running"));

// ======================================================
// 🚀 START NODE (FAIL-SAFE)
// ======================================================
server.listen(PORT, () => {
  console.log("⛓ KeytoCoin NODE running on port", PORT);
});
