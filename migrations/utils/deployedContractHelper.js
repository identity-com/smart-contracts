const truffleContract = require('truffle-contract');

module.exports = provider => name => {
  const contract = truffleContract(require(`../../artifacts/deployed/${name}`));
  contract.setProvider(provider);
  return contract.deployed();
};
