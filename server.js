// ================= KEYTOCOIN SERVER (FINAL SYNC) =================
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "20kb" }));

// ================= CONFIG =================
const PORT = 8882;
const MAX_SUPPLY = 17_000_000;
const BLOCK_REWARD = 1;
const MINING_KEY = "EQB1FrLRrNYXPdgidVkVUPG2G-dUi36SyNGnoYQGzc6fZ165";
const MINING_DELAY = 4000;

// ================= STATE (IN-MEMORY) =================
const wallets = {}; // address => { balance, blocks }
let totalSupply = 0;
const lastMine = {};

// ================= UTILS =================
function validAddress(addr) {
  return typeof addr === "string" && /^[a-f0-9]{32}$/.test(addr);
}

function getWallet(addr) {
  if (!wallets[addr]) {
    wallets[addr] = { balance: 0, blocks: 0 };
  }
  return wallets[addr];
}

// ================= WALLET INFO =================
app.get("/wallet/:address", (req, res) => {
  const { address } = req.params;
  if (!validAddress(address)) {
    return res.json({ balance: 0, blocks: 0, supply: totalSupply });
  }

  const w = getWallet(address);
  res.json({
    balance: w.balance,
    blocks: w.blocks,
    supply: totalSupply
  });
});

// ================= MINING =================
app.post("/mine", (req, res) => {
  const { address, miningKey } = req.body;

  if (miningKey !== MINING_KEY) {
    return res.status(403).json({ error: "Invalid mining key" });
  }

  if (!validAddress(address)) {
    return res.status(400).json({ error: "Invalid address" });
  }

  if (totalSupply >= MAX_SUPPLY) {
    return res.status(403).json({ error: "Max supply reached" });
  }

  const now = Date.now();
  if (lastMine[address] && now - lastMine[address] < MINING_DELAY) {
    return res.status(429).json({ error: "Mining too fast" });
  }

  lastMine[address] = now;

  const w = getWallet(address);
  w.balance += BLOCK_REWARD;
  w.blocks += 1;
  totalSupply += BLOCK_REWARD;

  res.json({ message: "Block mined successfully" });
});

// ================= SEND TX =================
app.post("/send", (req, res) => {
  const { from, to, amount } = req.body;

  if (
    !validAddress(from) ||
    !validAddress(to) ||
    typeof amount !== "number" ||
    amount <= 0
  ) {
    return res.status(400).json({ error: "Invalid transaction data" });
  }

  const sender = getWallet(from);
  const receiver = getWallet(to);

  if (sender.balance < amount) {
    return res.status(400).json({ error: "Insufficient balance" });
  }

  sender.balance -= amount;
  receiver.balance += amount;

  res.json({ message: "Transaction successful" });
});

// ================= START =================
app.listen(PORT, () => {
  console.log(`🪙 KeytoCoin Server running on http://localhost:${PORT}`);
});
