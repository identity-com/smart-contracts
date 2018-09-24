const truffleContract = require('truffle-contract');

module.exports = (provider, version) => name => {
  const contract = truffleContract(require(`../../artifacts/compiled/${version}/${name}.json`));
  contract.setProvider(provider);
  return contract;
};
