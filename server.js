const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
app.use(cors());
app.use(express.json());

// ================= CONFIG =================
const PORT = 8882;
const MAX_SUPPLY = 17_000_000;
const BLOCK_REWARD = 1;
const MINING_KEY = "EQB1FrLRrNYXPdgidVkVUPG2G-dUi36SyNGnoYQGzc6fZ165";

// ================= STATE =================
let totalSupply = 0;
let wallets = {}; 
// wallets[address] = { balance, blocks }

// ================= UTILS =================
function hash(data){
  return crypto.createHash("sha256").update(data).digest("hex");
}

function getWallet(address){
  if(!wallets[address]){
    wallets[address] = { balance: 0, blocks: 0 };
  }
  return wallets[address];
}

// ================= WALLET INFO =================
app.get("/wallet/:address",(req,res)=>{
  const w = getWallet(req.params.address);
  res.json({
    balance: w.balance,
    blocks: w.blocks,
    supply: totalSupply
  });
});

// ================= MINING =================
app.post("/mine",(req,res)=>{
  const { address, miningKey } = req.body;

  if(miningKey !== MINING_KEY){
    return res.json({ error: "Invalid mining key" });
  }

  if(totalSupply >= MAX_SUPPLY){
    return res.json({ error: "Max supply reached" });
  }

  const w = getWallet(address);
  w.balance += BLOCK_REWARD;
  w.blocks += 1;
  totalSupply += BLOCK_REWARD;

  res.json({
    message: `Block mined +${BLOCK_REWARD} KTC`,
    supply: totalSupply
  });
});

// ================= SEND TX =================
app.post("/send",(req,res)=>{
  const { from, to, amount } = req.body;

  if(!from || !to || amount <= 0){
    return res.json({ error: "Invalid transaction" });
  }

  const sender = getWallet(from);
  const receiver = getWallet(to);

  if(sender.balance < amount){
    return res.json({ error: "Insufficient balance" });
  }

  sender.balance -= amount;
  receiver.balance += amount;

  res.json({
    message: `Sent ${amount} KTC to ${to.slice(0,8)}...`
  });
});

// ================= EXPLORER =================
app.get("/explorer/addresses",(req,res)=>{
  const list = Object.entries(wallets).map(([address,w])=>({
    address,
    balance: w.balance,
    blocks: w.blocks
  }));

  res.json({ wallets: list });
});

// ================= START =================
app.listen(PORT,()=>{
  console.log("⛓️ KeytoCoin MAINNET running on port",PORT);
});
