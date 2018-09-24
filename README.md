# Identity.com Smart Contracts

## Summary

The smart contracts of the [Identity.com](https://www.identity.com/) marketplace.

Identity.com grants users, requesters, and validators around the world entry to accessible, reusable identity verification powered by CVC tokens.

## Contracts

### Functional Contracts

#### CvcOntology: 

Holds the list of all recognized Credential Items available for sale in the ecosystem.

#### CvcPricing:

Stores actual prices for Credential Items available for sale.
It allows registered Identity Validators to set or delete prices for specific Credential Items.

#### CvcEscrow: 

Provides an escrow service for the Identity.com marketplace.
It controls an escrow placement's lifecycle which involves transferring a pre-approved amount funds

#### CvcValidatorRegistry:

A registry for Identity Validators (IDV). It is part of the marketplace access control mechanism.

### Support Contracts

- CvcMigrator
- CvcProxy
- EternalStorage
- ImplementationStorage
- Initializable
- Ownable
- Pausable
- Migrations

For details on the migration and proxy patterns used in Identity.com, see [migrations/README.md](migrations/README.md)

## Project structure

The project follows the Truffle framework basic structure:
 - `migrations` folder for the migration files
 - `contracts` folder for smart contract source code files
 - `test` for smart contracts unit tests
 - `truffle.js` file at the top level for network management.
 
# Testing

All tests are running against Truffle's Ganache.
We have the `docker-compose.yml` file with default setup for ganache to speed up environment setup.
See `package.json` for available testing commands.

# Running migrations

Setup connection to your ethereum node (ganache/privatenet/testnet/mainnet). 
Run `deploy-contracts` npm command. 
Resulting JSON artifacts with ABIs and network addresses will be in `artifacts/deployed` folder.
