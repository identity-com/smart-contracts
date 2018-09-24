# Migrations

## The concept

We use the [proxy-contract pattern](https://blog.zeppelinos.org/proxy-patterns/) to make our smart contracts (SC) addresses fixed and achieve [upgradeability](https://github.com/zeppelinos/labs/tree/master/upgradeability_using_eternal_storage). 
Since contract code cannot be changed once deployed, all interactions with the contracts use proxies that point to the latest implementation of the contract.

In case a bug is found, a new implementation can be deployed without losing data or requiring clients to point to new contract addresses.

### Contracts or Applications?

One of the advantages of smart contracts is the 'code as law' principle: users can trust the open and immutable nature of the contract code.
Using proxies weakens this, and introduces a form of centralization, in that only trusted administrators can upgrade the contracts,
thereby changing the underlying code.

As custodians of the ecosystem, Identity.com reserves the right to make upgrades to the code during the beta phase,
in order to protect and preserve the security of the ecosystem and its users, with the intention of switching off
the proxies and switching to direct contract interaction once the system is considered ready. 

### Proxy contract

Solidity's assembly is used to use `delegatecall` to call other SC code. 
This allows to use proxy contract contexts (and storage), but execute implementation bytecode with provided arguments.
When changing implementations, data is still present on the proxy's storage.

### Eternal storage

There is a problem of SC state variable position collision (more info on how solidity determines at which address a var will be stored is [here](http://solidity.readthedocs.io/en/v0.4.24/miscellaneous.html#layout-of-state-variables-in-storage)). 
This preventds us from using ordinary SC vars in implementations as they may be shadowed by further implementations causing data loss.
Instead, [Eternal storage](https://github.com/zeppelinos/labs/blob/master/upgradeability_using_eternal_storage/contracts/EternalStorage.sol) pattern is used.
This allows us to store any value in the appropriate type map using any key.
Thus, we can be sure that this piece of data will be accessible in future implementations by the same key.

### upgradeTo and upgradeToAndCall

In order to switch to the new implementation we need to first deploy the new implementation and then tell proxy to use the new implementation instead of old one.
This is carried out using 2 methods on proxy SC: `upgradeTo` and `upgradeToAndCall`. 
The first one simply switches to the new implementation.
The second one switches to the new implementation and calls a method via `delegatecall`.
This allows you to initialise the proxy storage with new values.
Simply passing them to the implementation constructor has no effect - the call must be in the proxy's context to write to the proxy's storage.

### Migrator SC

For security reasons, `upgradeTo` and `upgradeToAndCall` can only be be called by proxy __admin__. 
In addition, we use the [transparent proxy pattern](https://github.com/zeppelinos/zos-lib/pull/36). 
This means that proxy service functions can only be called by a proxy admin, other callers are passed to the implementation.
If we need to upgrade a number of proxies at time, within a single transaction, in order to avoid a situation where some contracts are upgraded, and others are not,
then the Migrator smart contract must be used.
This smart contract is a proxy factory, and is therefore the admin of all proxies (it is ownable, so its owner can transfer admin rights to someone else). 
It uses the Builder pattern to keep a record of which proxy should be upgraded to which migration (optionally with `data`) and can upgrade all proxies within one transaction. 

### SC history

Since we want to keep track of all implementations that were in use, we save compiled version of each in separate folder `artifacts/compiled/vXXX`. 
This allows us to reproduce the entire history of upgrades with all initialisation data and values/flags set within those upgrades.

## How to make the next migration

### Create a new folder under compiled

Create a new version folder under `artifacts/compiled`. 
Run `truffle compile`, move the resultant artifacts into the new folder and check in.
You can now reference these artifacts in the migration script.

### Create a new migration script 

Create a new migration script (you must follow NUMBER_description_of_migration.js pattern). Reference your artifact by name and version:
```js
const compiledContractHelper = require('./utils/compiledContractHelper');
// The first argument is web3 provider. Could be taken from the deployer instance.
const getCompiledContract = compiledContractHelper(deployer.provider, 'version number');
const contract = getCompiledContract('contract name');
```

You can now deploy your contract via `deployer`:
```js
await deployer.deploy(contract, arguments, { from, gas, gasPrice });
```

and don't forget to save the artifact:
```js
const TruffleArtifactor = require('truffle-artifactor');
const artifactor = new TruffleArtifactor('artifacts/deployed/');
await artifactor.saveAll({
  contractName: _(contract)
    .pick(['contractName', 'abi', 'compiler', 'networks'])
    .set(['networks', deployer.network_id, 'address'], proxy.address)
    .value()
});
```