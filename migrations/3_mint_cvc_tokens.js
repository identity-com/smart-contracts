const TruffleConfig = require('../truffle');
const { ONE_CVC } = require('../constants');
const deployedContractHelper = require('./utils/deployedContractHelper');
const { unlockAccount } = require('./utils');

module.exports = transform(async (deployer, network, accounts) => {
  const config = TruffleConfig.networks[network];
  const admin = config.from;
  const { gasPrice } = config;
  const getDeployedContract = deployedContractHelper(deployer.provider);
  unlockAccount(deployer, config);

  const token = await getDeployedContract('CvcToken');

  // Mint tokens for default requestor addresses
  accounts.push('0xf91a4ddfa76451d00b703311aae273f2f77cd52c');
  accounts.push('0x3a8bc151852c3771b5933419e5c74481679789d0');
  accounts.push('0xa27d4886302c55345a82f94436019e209c5c7bd6');

  await Promise.all(accounts.map(address => token.transfer(address, 1000 * ONE_CVC, { from: admin, gasPrice })));
  console.log(`${accounts.length} accounts have been minted 1000 CVCs`);
});

function transform(callback) {
  return (deployer, network, accounts) => deployer.then(() => callback(deployer, network, accounts));
}
