const { axios, mysql, con, util, queryAsync, telegramBot } = require("./common");
const { ensureLogFileExists, getLogCountFromLogFile, logError } = require("./logger");
const { ethers } = require("ethers");

const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);

const priceFeedABI = [
    {
        "inputs": [],
        "name": "latestRoundData",
        "outputs": [
            { "internalType": "uint80", "name": "roundId", "type": "uint80" },
            { "internalType": "int256", "name": "answer", "type": "int256" },
            { "internalType": "uint256", "name": "startedAt", "type": "uint256" },
            { "internalType": "uint256", "name": "updatedAt", "type": "uint256" },
            { "internalType": "uint80", "name": "answeredInRound", "type": "uint80" }
        ],
        "stateMutability": "view",
        "type": "function"
    }
];

const priceFeedContracts = [
    { contract_address: "0x547a514d5e3769680Ce22B2361c10Ea13619e8a9", symbol:"AAVE", decimals: 8 }, // AAVE-USD
    { contract_address: "0xD10aBbC76679a20055E167BB80A24ac851b37056", symbol:"APE", decimals: 8 }, // APE-USD
    { contract_address: "0x31697852a68433DbCc2Ff612c516d69E3D9bd08F", symbol:"ARB", decimals: 8 }, // ARB-USD
    { contract_address: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c", symbol:"BTC", decimals: 8 }, // BTC-USD
    { contract_address: "0xCd627aA160A6fA45Eb793D19Ef54f5062F20f33f", symbol:"CRV", decimals: 8 }, // CRV-USD
    { contract_address: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", symbol:"ETH", decimals: 8 }, // ETH-USD
    { contract_address: "0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c", symbol:"LINK", decimals: 8 }, // LINK-USD
    { contract_address: "0x7bAC85A8a13A4BcD8abb3eB7d6b4d632c5a57676", symbol:"MATIC", decimals: 8 }, // MATIC-USD
    { contract_address: "0xec1D1B3b0443256cc3860e24a46F108e699484Aa", symbol:"MKR", decimals: 8 }, // MKR-USD
    { contract_address: "0x4ffC43a60e009B551865A93d232E33Fce9f01507", symbol:"SOL", decimals: 8 }, // SOL-USD
    { contract_address: "0x553303d460EE0afB37EdFf9bE42922D8FF63220e", symbol:"UNI", decimals: 8 }, // UNI-USD
    { contract_address: "0xA027702dbb89fbd58938e4324ac03B58d812b0E1", symbol:"YFI", decimals: 8 }, // YFI-USD
    // Full list of supported assets and networks: https://docs.chain.link/data-feeds/price-feeds/addresses
];

const pctDifferenceThreshold = 10;
const lowerRange = 1 - (pctDifferenceThreshold / 100);
const upperRange = 1 + (pctDifferenceThreshold / 100);

async function validatePrice(priceFeedContract, currentOffChainPrice) {
    try {
        const priceFeed = new ethers.Contract(priceFeedContract.contract_address, priceFeedABI, provider);
        const priceFeedData = await priceFeed.latestRoundData();
        const currentOnChainPrice = parseFloat(ethers.utils.formatUnits(priceFeedData.answer, priceFeedContract.decimals));
        console.log(`${priceFeedContract.symbol}'s on-chain price is currently ${currentOnChainPrice.toLocaleString()} and the off-chain price is currently ${currentOffChainPrice.toLocaleString()}.`);

        const priceRatio = currentOnChainPrice / currentOffChainPrice;
        
        if (priceRatio < lowerRange || priceRatio > upperRange) {
            console.log(`Found a price discrepancy for ${priceFeedContract.symbol}!`);
            //await telegramBot.telegram.sendMessage(process.env.TELEGRAM_CHAT_ID, `Found a price discrepancy for ${priceFeedContract.symbol}!`);
            return true;
        }

    } catch (error) {
        await logError(error);
    }
}

async function main() {
    try {
        await ensureLogFileExists();
        const currentLogCount = await getLogCountFromLogFile();

        await con.connect();

        let discrepancyCount = 0;

        for (let i = 0; i < priceFeedContracts.length; i++) {
            const [offChainData] = await queryAsync("SELECT price FROM coin WHERE symbol=? ORDER BY mc_rank ASC LIMIT 1", priceFeedContracts[i].symbol);
            const foundDiscrepancy = await validatePrice(priceFeedContracts[i], offChainData.price);
            discrepancyCount = foundDiscrepancy ? discrepancyCount + 1 : discrepancyCount;
        }

        const newLogCount = await getLogCountFromLogFile();
        const logCountDiff = (currentLogCount !== -1 && newLogCount !== -1) ? (newLogCount - currentLogCount) : -1;

        let msg;

        if (logCountDiff === 0) {
            if (discrepancyCount === 0) {
                msg = `✅ Validated prices.`;
            } else {
                msg = `⚠️ Found ${discrepancyCount} price discrepancies.`;
            }
            
        } else {
            msg = `❌ NEW ERROR! Something went wrong when validating prices. (${logCountDiff})`;
        }

        console.log(msg);
        await telegramBot.telegram.sendMessage(process.env.TELEGRAM_CHAT_ID, msg);

    } catch (error) {
        await logError(error);
        await telegramBot.telegram.sendMessage(process.env.TELEGRAM_CHAT_ID, `❌ NEW ERROR! Something went wrong when validating prices: ${error}`);

    } finally {
        await con.end();
    }
}

main();