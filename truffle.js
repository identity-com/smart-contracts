// Allows us to use ES6 in our migrations and tests.
require('babel-register')

module.exports = {
  networks: {
    // local testing with ganache-cli
    ganache: {
      host: 'localhost',
      gas: 3141592,
      gasPrice: 100000000000,
      port: 8545,
      network_id: '*', // Match any network id
      from: '0x48089757dbc23bd8e49436247c9966ff15802978'
    },
    // local or CI integration testing with a privatenet node
    // we need to separate this from the development network due to a bug with ganache-cli
    // https://github.com/trufflesuite/ganache-cli/issues/405
    // It currently doesn't support unlocking accounts properly
    integration: {
      host: 'localhost',
      gas: 3141592,
      gasPrice: 100000000000,
      port: 8545,
      network_id: '*', // Match any network id
      from: '0x48089757dbc23bd8e49436247c9966ff15802978',
      password: () => process.env.ACCOUNT_PASSWORD
    }
  }
};

if (!!process.env.GAS_USAGE) {
  module.exports.mocha = {
    reporter: 'eth-gas-reporter',
    reporterOptions: {
      currency: 'USD'
    }
  };
}
