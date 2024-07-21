require("dotenv").config();
const axios = require("axios");
const { ChainId, Token, TokenAmount, Pair, Trade, TradeType, Route, Fetcher, Percent } = require("@uniswap/sdk");
const { ethers } = require("ethers");

const taxWalletThreshold = 500;
let taxWalletBalance = 0;

const tokenContract = "0xeA4170A365952c666A9f34950771E51841732de9";
const wethContract = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const routerContract = "0xaaF409E68d9CDc7B26cf1b3d6e6d4ca09F1aede3";

const provider = new ethers.providers.InfuraProvider("mainnet", process.env.INFURA_API_KEY);
const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_API_KEY, provider);
const token = new Token(ChainId.MAINNET, tokenContract, 18);

async function getTokenBalance() {
    try {
        const balanceResponse = await axios.get(`https://api.etherscan.io/api?module=account&action=tokenbalance&contractaddress=${tokenContract}&address=${tokenContract}&tag=latest&apikey=${process.env.ETHERSCAN_API_KEY}`);
        if (balanceResponse.data.status !== "1") {
            throw new Error("Failed to fetch the balance data: " + balanceResponse.data.message);
        }

        taxWalletBalance = Number(balanceResponse.data.result) / 10 ** 18;
        console.log("Current balance:", taxWalletBalance);

    } catch (error) {
        console.error(error.message);
    }
}

async function sellToken(amountIn) {
    try {
        const token = new Token(ChainId.MAINNET, tokenContract, 18);
        const weth = new Token(ChainId.MAINNET, wethContract, 18);
        
        // Fetch pair data
        const pair = await Fetcher.fetchPairData(token, weth, provider);
        const route = new Route([pair], token);

        const amountInToken = new TokenAmount(token, ethers.utils.parseUnits(amountIn, token.decimals).toString());
        const trade = new Trade(route, amountInToken, TradeType.EXACT_INPUT);

        const slippage = new Percent("50", "10000"); // Set slippage tolerance to 0.5%
        const amountOutMin = trade.minimumAmountOut(slippage).toFixed();
        const deadline = Math.floor(Date.now() / 1000) + 60 * 2; // 2 minutes from now

        const iface = new ethers.utils.Interface([
            "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory)"
        ]);

        const data = iface.encodeFunctionData("swapExactTokensForETH", [
            ethers.utils.parseUnits(amountIn, token.decimals).toString(),
            ethers.utils.parseUnits(amountOutMin, token.decimals).toString(),
            [token.address, weth.address],
            wallet.address,
            deadline
        ]);

        const suggestedGasFeeResponse = await axios.get(`https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=${process.env.ETHERSCAN_API_KEY}`);
        if (suggestedGasFeeResponse.data.status !== "1") {
            throw new Error("Failed to fetch the gas fee data: " + suggestedGasFeeResponse.data.message);
        }

        const suggestedGasFee = suggestedGasFeeResponse.data.result.ProposeGasPrice;

        const tx = {
            to: routerContract,
            data: data,
            gasLimit: 200000, // Estimate the gas limit as needed
            gasPrice: ethers.utils.parseUnits(suggestedGasFee, "gwei") // Set gas price as needed
        };

        // Sign and send the transaction
        const txResponse = await wallet.sendTransaction(tx);
        await txResponse.wait(); // Wait for the transaction to be mined

        console.log(`Transaction hash: ${txResponse.hash}`);
        return true;

    } catch (error) {
        console.error(error.message);
    }
}

async function main() {
    while (true) {
        try {
            await getTokenBalance();

            if (taxWalletBalance >= taxWalletThreshold) {
                const completedSwap = await sellToken("1");
                if (completedSwap) {
                    taxWalletBalance = 0;
                    await new Promise(r => setTimeout(r, 20000));
                }
            }

            await new Promise(r => setTimeout(r, 1000));


        } catch(error) {
            await console.error(error.message);
        }
    }
}

main();
