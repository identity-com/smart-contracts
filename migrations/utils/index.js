const Web3 = require('web3');

const encodeABI = (contract, method, args) =>
  contract.at(contract.address).contract[method].getData.apply(contract, args);

const unlockAccount = (deployer, config, duration = 600) => {
  if (!config.password || !config.from) return;

  const web3 = new Web3(deployer.provider);
  console.log(`>> Unlocking account ${config.from}`);
  web3.personal.unlockAccount(config.from, config.password(), duration);
};

module.exports = {
  encodeABI,
  unlockAccount
};
