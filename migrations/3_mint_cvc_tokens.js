const TruffleConfig = require('../truffle');
const { ONE_CVC } = require('../constants');
const deployedContractHelper = require('./utils/deployedContractHelper');
const Web3 = require('web3');

module.exports = transform(async (deployer, network, accounts) => {
  const config = TruffleConfig.networks[network];
  const admin = config.from;
  const { gasPrice } = config;
  const getDeployedContract = deployedContractHelper(deployer.provider);

  const token = await getDeployedContract('CvcToken');
  const web3 = new Web3(deployer.provider);
  // Provision default IDR:
  const idr = '0x8935161928e65081bcaef7358e97dce1c560dc9b'; // SIP
  console.log('Crediting ETH...');
  const ethAmount = 10;
  await web3.eth.sendTransaction({
    from: admin,
    to: idr,
    value: web3.toWei(ethAmount, 'ether'),
    gas: 30000,
    gasPrice: 100000000000
  });
  console.log(`${idr} has been credited with ${ethAmount} ETH`);

  // Credit tokens
  console.log('Crediting tokens...');
  const cvcAmount = 1000;
  accounts.push(idr);
  accounts.push('0xf91a4ddfa76451d00b703311aae273f2f77cd52c');
  accounts.push('0x3a8bc151852c3771b5933419e5c74481679789d0');
  accounts.push('0xa27d4886302c55345a82f94436019e209c5c7bd6');
  await Promise.all(
    accounts.map(
      address => token.transfer(address, cvcAmount * ONE_CVC, { from: admin, gasPrice }).then(() => {
        console.log(`${address} has been credited with ${cvcAmount} CVC`);
      })
    )
  );
});

function transform(callback) {
  return (deployer, network, accounts) => deployer.then(() => callback(deployer, network, accounts));
}
