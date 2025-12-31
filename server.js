// server.js — FINAL
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 8882;
const MAX_SUPPLY = 17_000_000;
const BLOCK_REWARD = 1;

const wallets = {};
const blockchain = [];
let totalSupply = 0;

function sha256(data){
  return crypto.createHash("sha256").update(data).digest("hex");
}

function ensureWallet(address){
  if(!wallets[address]){
    wallets[address] = { balance:0, blocks:0 };
  }
}

function createBlock(address){
  const prevHash = blockchain.length
    ? blockchain[blockchain.length-1].hash
    : "GENESIS BLOCKCORE";

  const block = {
    index: blockchain.length,
    timestamp: Date.now(),
    miner: address,
    reward: BLOCK_REWARD,
    prevHash
  };

  block.hash = sha256(JSON.stringify(block));
  blockchain.push(block);
  return block;
}

app.get("/",(_,res)=>{
  res.json({status:"KEYTOCOIN MAINNET ONLINE", supply:totalSupply});
});

app.get("/balance",(_,res)=>{
  res.json({supply:totalSupply});
});

app.get("/wallet/:address",(req,res)=>{
  ensureWallet(req.params.address);
  res.json({
    address:req.params.address,
    balance:wallets[req.params.address].balance,
    blocks:wallets[req.params.address].blocks,
    supply:totalSupply
  });
});

app.post("/mine",(req,res)=>{
  const {address}=req.body;
  if(!address) return res.json({error:"No address"});
  if(totalSupply>=MAX_SUPPLY) return res.json({error:"Max supply reached"});

  ensureWallet(address);
  const block=createBlock(address);
  wallets[address].balance+=BLOCK_REWARD;
  wallets[address].blocks++;
  totalSupply++;

  res.json({message:"BLOCK MINING",block});
});

app.post("/send",(req,res)=>{
  const {from,to,amount}=req.body;
  if(!from||!to||amount<=0) return res.json({error:"Invalid tx"});
  ensureWallet(from); ensureWallet(to);
  if(wallets[from].balance<amount) return res.json({error:"Insufficient balance"});
  wallets[from].balance-=amount;
  wallets[to].balance+=amount;
  res.json({message:`Transferred ${amount} KTC`});
});

app.listen(PORT,()=>{
  console.log("⛓ KeytoCoin running on http://localhost:"+PORT);
});
