# Contracts

This folder holds smart contract sorce code.

- Escrow: escrow service functionality for Identity.com marketplace. It controls an escrow placement's lifecycle which involves transferring a pre-approved amount funds from the Identity Requester account to its own account and keeping them until the marketplace deal is complete.
- Pricing: pricing stores actual prices for Credential Items available for sale. It allows registered Identity Validators to set or delete price for specific Credential Item.
- Ontology: ontology holds the list of all recognized Credential Items available for sale.
- Validator registry: is a registry for Identity Validators (IDV). It is part of the marketplace access control mechanism.
- Upgradeability: proxy functionality and all related contracts.
