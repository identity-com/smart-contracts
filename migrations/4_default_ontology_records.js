// `artifacts.require` helper introduced by Truffle
const TruffleConfig = require('../truffle');
const deployedContractHelper = require('./utils/deployedContractHelper');
const { unlockAccount } = require('./utils');

module.exports = transform(async (deployer, network) => {
  const config = TruffleConfig.networks[network];
  const admin = config.from;
  const gas = 1e6;
const { gasPrice } = config;
  unlockAccount(deployer, config);

  const getDeployedContract = deployedContractHelper(deployer.provider);
  const ontology = await getDeployedContract('CvcOntology');

  await Promise.all([
    ontology.add(
      'credential',
      'proofOfIdentity',
      'v1.0',
      'https://www.identity.com/',
      'JSON-LD-Context',
      '0x2cd9bf92c5e20b1b410f5ace94d963a96e89156fbe65b70365e8596b37f1f165', // keccak('qwerty')
      { from: admin, gas, gasPrice }
    ),
    ontology.add(
      'credential',
      'proofOfAge',
      'v1.0',
      'https://www.identity.com/',
      'JSON-LD-Context',
      '0x2cd9bf92c5e20b1b410f5ace94d963a96e89156fbe65b70365e8596b37f1f165', // keccak('qwerty')
      { from: admin, gas, gasPrice }
    )
  ]);

  console.log('Default ontology records added:');
  const records = await ontology.getAllIds().then(ids => Promise.all(ids.map(id => ontology.getById(id))));
  records.map(credentialItem => {
    const [id, type, name, version] = credentialItem;
    return console.log(`${type} ${name} ${version} with ID=${id}`);
  });
});

function transform(callback) {
  return (deployer, network, accounts) => deployer.then(() => callback(deployer, network, accounts));
}
