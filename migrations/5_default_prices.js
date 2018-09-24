const Web3 = require('web3');

const TruffleConfig = require('../truffle');
const deployedContractHelper = require('./utils/deployedContractHelper');
const { unlockAccount } = require('./utils');

module.exports = transform(async (deployer, network) => {
  const config = TruffleConfig.networks[network];
  const admin = config.from;
const { gasPrice } = config;
  const gas = 1e6;
  unlockAccount(deployer, config);

  const getDeployedContract = deployedContractHelper(deployer.provider);

  // Register default IDV first.
  const idvAddress = '0x1a88a35421a4a0d3e13fe4e8ebcf18e9a249dc5a';
  const automationTestIDV = '0xb69271f06da20cf1b2545e1fb969cd827e281434';
  const idvRegistry = await getDeployedContract('CvcValidatorRegistry');
  await Promise.all([
    idvRegistry.set(idvAddress, 'IDV', 'IDV company', { from: admin, gas, gasPrice }),
    idvRegistry.set(automationTestIDV, 'TestIDV', 'For test suite', { from: admin, gas, gasPrice })
  ]);

  // Unlock IDV account.
  if (config.password) {
    const web3 = new Web3(new Web3.providers.HttpProvider(`http://${config.host}:${config.port}`));
    console.log(`>> Unlocking IDV account ${idvAddress}`);
    web3.personal.unlockAccount(idvAddress, config.password(), 36000);
    web3.personal.unlockAccount(automationTestIDV, config.password(), 36000);
  }
  // Set Proof Of Identity price.
  const pricing = await getDeployedContract('CvcPricing');
  await Promise.all([
    pricing.setPrice('credential', 'proofOfIdentity', 'v1.0', 2000, { from: idvAddress, gas, gasPrice }),
    pricing.setPrice('credential', 'proofOfAge', 'v1.0', 1000, { from: idvAddress, gas, gasPrice }),
    pricing.setPrice('credential', 'proofOfIdentity', 'v1.0', 3000, { from: automationTestIDV, gas, gasPrice })
  ]);

  console.log(`Price added: credential, proofOfIdentity, v1.0, 2000, ${idvAddress}.`);
  console.log(`Price added: credential, proofOfAge, v1.0, 1000, ${idvAddress}.`);
  console.log(`Price added: credential, proofOfIdentity, v1.0, 3000, ${automationTestIDV}.`);
});

function transform(callback) {
  return (deployer, network, accounts) => deployer.then(() => callback(deployer, network, accounts));
}
