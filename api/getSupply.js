require("dotenv").config();
const express = require("express");
const axios = require("axios");
const app = express();
const port = 8080;
const apiKey = process.env.ETHERSCAN_API_KEY;

const tokenContract = "0xeA4170A365952c666A9f34950771E51841732de9";
const vestingContract = "0xDba68f07d1b7Ca219f78ae8582C213d975c25cAf"; // UNCX's vesting contract
const burnAddress = "0x000000000000000000000000000000000000dEaD";

let circulatingSupplyCache = null;
let totalSupplyCache = null;

const updateTokenSupplyData = async () => {
    try {
        const totalSupplyResponse = await axios.get(`https://api.etherscan.io/api?module=stats&action=tokensupply&contractaddress=${tokenContract}&apikey=${apiKey}`);
        await new Promise(r => setTimeout(r, 1000));

        const lockedSupplyResponse = await axios.get(`https://api.etherscan.io/api?module=account&action=tokenbalance&contractaddress=${tokenContract}&address=${vestingContract}&tag=latest&apikey=${apiKey}`);
        await new Promise(r => setTimeout(r, 1000));

        const burnedSupplyResponse = await axios.get(`https://api.etherscan.io/api?module=account&action=tokenbalance&contractaddress=${tokenContract}&address=${burnAddress}&tag=latest&apikey=${apiKey}`);

        if (totalSupplyResponse.data.status !== "1" || lockedSupplyResponse.data.status !== "1" || burnedSupplyResponse.data.status !== "1") {
            throw new Error("Failed to fetch data: " + totalSupplyResponse.data.message + ", " + lockedSupplyResponse.data.message + ", " + burnedSupplyResponse.data.message);
        }

        const totalSupply = (Number(totalSupplyResponse.data.result) - Number(burnedSupplyResponse.data.result)) / 10 ** 18;
        const lockedSupply = Number(lockedSupplyResponse.data.result) / 10 ** 18;

        totalSupplyCache = Math.round(totalSupply);
        circulatingSupplyCache = Math.round(totalSupply - lockedSupply);

        console.log(`Token supply data updated. Total Supply: ${totalSupplyCache}, Circulating Supply: ${circulatingSupplyCache}`);

    } catch(error) {
        console.error("Error updating token supply data:", error.message);
    }
};

setInterval(updateTokenSupplyData, 30000); // Set up interval to update the token supply data every ~30 seconds

updateTokenSupplyData(); // Initial fetch to populate the cache

app.get("/circulating-supply", (req, res) => {
    if (circulatingSupplyCache !== null) {
        res.json(circulatingSupplyCache);
    } else {
        res.status(500).json({ error: "Circulating supply data is not available." });
    }
});

app.get("/total-supply", (req, res) => {
    if (totalSupplyCache !== null) {
        res.json(totalSupplyCache);
    } else {
        res.status(500).json({ error: "Total supply data is not available." });
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
