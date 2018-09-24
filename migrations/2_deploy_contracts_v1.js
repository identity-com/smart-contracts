const _ = require('lodash');
const TruffleArtifactor = require('truffle-artifactor');

const artifactor = new TruffleArtifactor('artifacts/deployed/');

const CvcMigrator = artifacts.require('CvcMigrator');
const Proxy = artifacts.require('CvcProxy');

const { CVC_DECIMALS, TOTAL_SUPPLY } = require('../constants');
const TruffleConfig = require('../truffle');
const compiledContractHelper = require('./utils/compiledContractHelper');
const { encodeABI, unlockAccount } = require('./utils');

// This is the version of compiled contracts we deploy.
const CONTRACTS_IMPLEMENTATION_VERSION = 'v1';

// Gas limits:
const GAS_DEPLOYMENT_TOKEN = 2100000;
const GAS_DEPLOYMENT_MIGRATOR = 2300000;
const GAS_DEPLOYMENT_ONTOLOGY = 4200000;
const GAS_DEPLOYMENT_VALIDATOR_REGISTRY = 1800000;
const GAS_DEPLOYMENT_PRICING = 5000000;
const GAS_DEPLOYMENT_ESCROW = 6400000;
const GAS_CALL_CREATE_PROXY = 600000;
const GAS_CALL_ADD_UPGRADE_ONTOLOGY = 160000;
const GAS_CALL_ADD_UPGRADE_VALIDATOR_REGISTRY = 150000;
const GAS_CALL_ADD_UPGRADE_PRICING = 190000;
const GAS_CALL_ADD_UPGRADE_ESCROW = 210000;
const GAS_CALL_MIGRATE = 1000000;

module.exports = transform(async (deployer, network) => {
  // Get truffle config for current network.
  const config = TruffleConfig.networks[network];

  // Unlock sender account if necessary.
  unlockAccount(deployer, config);

  // Transaction default options:
  const { from, gasPrice } = config;
  const admin = from;
  const txOptions = { gasPrice, from };

  // Load artifacts of the compiled contracts.
  const getCompiledContract = compiledContractHelper(deployer.provider, CONTRACTS_IMPLEMENTATION_VERSION);
  const [CvcToken, CvcPricing, CvcEscrow, CvcOntology, CvcValidatorRegistry] = [
    'CvcToken',
    'CvcPricing',
    'CvcEscrow',
    'CvcOntology',
    'CvcValidatorRegistry'
  ].map(getCompiledContract);

  // Deploy CVC token contract first (Note: Use real CVC token address for mainnet deployments)
  // eslint-disable-next-line max-len,prettier/prettier
  await deployer.deploy(CvcToken, admin, 'TestCVCToken', 'TCVC', TOTAL_SUPPLY, CVC_DECIMALS, {...txOptions, gas: GAS_DEPLOYMENT_TOKEN });

  // Then deploy CvcMigrator contract.
  await deployer.deploy(CvcMigrator, { ...txOptions, gas: GAS_DEPLOYMENT_MIGRATOR });

  // Deploy proxies for each contract.
  const migrator = CvcMigrator.at(CvcMigrator.address);
  // We can't make this with Promise.all (in single block) due to the nonce shuffling issues.
  const ontologyProxy = await createProxy(migrator, txOptions);
  const validatorRegistryProxy = await createProxy(migrator, txOptions);
  const pricingProxy = await createProxy(migrator, txOptions);
  const escrowProxy = await createProxy(migrator, txOptions);

  // Deploy Ontology contract.
  await deployer.deploy(CvcOntology, { ...txOptions, gas: GAS_DEPLOYMENT_ONTOLOGY });
  console.log(`Adding Ontology proxy contract upgrade...`);
  await migrator.addUpgrade(
    ontologyProxy.address,
    CvcOntology.address,
    encodeABI(CvcOntology, 'initialize', [admin]),
    { ...txOptions, gas: GAS_CALL_ADD_UPGRADE_ONTOLOGY }
  );

  // Deploy ValidatorRegistry contract.
  await deployer.deploy(CvcValidatorRegistry, { ...txOptions, gas: GAS_DEPLOYMENT_VALIDATOR_REGISTRY });
  console.log(`Adding ValidatorRegistry proxy contract upgrade...`);
  await migrator.addUpgrade(
    validatorRegistryProxy.address,
    CvcValidatorRegistry.address,
    encodeABI(CvcValidatorRegistry, 'initialize', [admin]),
    { ...txOptions, gas: GAS_CALL_ADD_UPGRADE_VALIDATOR_REGISTRY }
  );

  // Deploy Pricing contract.
  // eslint-disable-next-line max-len,prettier/prettier
  await deployer.deploy(CvcPricing, CvcOntology.address, CvcValidatorRegistry.address, { ...txOptions, gas: GAS_DEPLOYMENT_PRICING });
  console.log(`Adding Pricing proxy contract upgrade...`);
  await migrator.addUpgrade(
    pricingProxy.address,
    CvcPricing.address,
    encodeABI(CvcPricing, 'initialize', [ontologyProxy.address, validatorRegistryProxy.address, admin]),
    { ...txOptions, gas: GAS_CALL_ADD_UPGRADE_PRICING }
  );

  // Deploy marketplace escrow contract.
  // eslint-disable-next-line max-len,prettier/prettier
  await deployer.deploy(CvcEscrow, CvcToken.address, admin, CvcPricing.address, { ...txOptions, gas: GAS_DEPLOYMENT_ESCROW });
  console.log(`Adding Escrow proxy contract upgrade...`);
  await migrator.addUpgrade(
    escrowProxy.address,
    CvcEscrow.address,
    encodeABI(CvcEscrow, 'initialize', [CvcToken.address, admin, pricingProxy.address, admin]),
    { ...txOptions, gas: GAS_CALL_ADD_UPGRADE_ESCROW }
  );

  // Execute proxy upgrades - switch all Proxy contracts to provided implementations and initialize them.
  console.log(`Upgrading proxy contracts with new implementations...`);
  await migrator.migrate({ ...txOptions, gas: GAS_CALL_MIGRATE });

  console.log(`Ontology proxy at ${ontologyProxy.address}`);
  console.log(`Validator registry proxy at ${validatorRegistryProxy.address}`);
  console.log(`Pricing proxy at ${pricingProxy.address}`);
  console.log(`Escrow proxy at ${escrowProxy.address}`);
  console.log(`Contracts have been deployed successfully from ${admin} address`);

  await artifactor.saveAll({
    CvcToken,
    CvcOntology: _(CvcOntology)
      .pick(['contractName', 'abi', 'compiler', 'networks'])
      .set(['networks', deployer.network_id, 'address'], ontologyProxy.address)
      .value(),
    CvcEscrow: _(CvcEscrow)
      .pick(['contractName', 'abi', 'compiler', 'networks'])
      .set(['networks', deployer.network_id, 'address'], escrowProxy.address)
      .value(),
    CvcPricing: _(CvcPricing)
      .pick(['contractName', 'abi', 'compiler', 'networks'])
      .set(['networks', deployer.network_id, 'address'], pricingProxy.address)
      .value(),
    CvcValidatorRegistry: _(CvcValidatorRegistry)
      .pick(['contractName', 'abi', 'compiler', 'networks'])
      .set(['networks', deployer.network_id, 'address'], validatorRegistryProxy.address)
      .value(),
    CvcMigrator: _(CvcMigrator)
      .pick(['contractName', 'abi', 'compiler', 'networks'])
      .value()
  });

  // We need to save CvcToken artifact to `build/contracts/` as it is not compiled from the sources anymore.
  // Artifacts has internal cache with the map of contracts that will be saved in `Saving artifacts...` step.
  // Thus, later on we could use `artifacts.require` to get CvcToken (i.e. in unit tests).
  artifacts.cache.CvcToken = CvcToken;
});

function transform(callback) {
  return (deployer, network, accounts) => deployer.then(() => callback(deployer, network, accounts));
}

async function createProxy(migrator, txOptions) {
  console.log(`Deploying new instance of Proxy contract...`);
  // eslint-disable-next-line max-len,prettier/prettier
  const { logs: [{ args: { proxyAddress } }] } = await migrator.createProxy({ ...txOptions, gas: GAS_CALL_CREATE_PROXY });
  return Proxy.at(proxyAddress);
}
