const TruffleArtifactor = require('truffle-artifactor');
const TruffleConfig = require('../truffle');
const { unlockAccount } = require('./utils');

const Migrations = artifacts.require('./Migrations.sol');
const artifactor = new TruffleArtifactor('artifacts/deployed/');

module.exports = function(deployer, network) {
  const config = TruffleConfig.networks[network];
  unlockAccount(deployer, config, 3660);
  return deployer.deploy(Migrations).then(() => artifactor.save(Migrations));
};
