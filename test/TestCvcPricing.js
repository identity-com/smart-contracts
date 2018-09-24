// `artifacts.require` helper introduced by Truffle
const CvcOntology = artifacts.require('CvcOntology');
const CvcValidatorRegistry = artifacts.require('CvcValidatorRegistry');
const CvcPricing = artifacts.require('CvcPricing');
const PricingAccessor = artifacts.require('stubs/PricingAccessor');
const chai = require('chai');
chai.use(require('chai-bignumber')());
chai.use(require('chai-as-promised'));
const Bn = require('bignumber.js');
const {
  TOTAL_SUPPLY,
  EVENT_CREDENTIAL_ITEM_PRICE_SET,
  EVENT_CREDENTIAL_ITEM_PRICE_DELETED
} = require('../constants');

const { expect } = chai;

// Disabling no-undef because of `contract` helper introduced by Truffle
// eslint-disable-next-line no-undef
contract('CvcPricing', accounts => {
  const [admin, idv, idv2, idv3, idv4, idv5] = accounts;
  const gas = 6000000;
  const type = 'Credential';
  const name = 'proof_of_identity';
  const version = 'v1.0';
  const reference = 'https://www.identity.com/';
  const referenceType = 'JSON-LD-Context';
  const referenceHash = '0x2cd9bf92c5e20b1b410f5ace94d963a96e89156fbe65b70365e8596b37f1f165';
  const price = new Bn(2000);

  // IDV
  const idvName = 'Test IDV';
  const idvDescription = 'IDV for testing';

  // Contracts
  let pricing;
  let ontology;
  let idvRegistry;
  let pricingAccessor;

  beforeEach('Deploy Pricing contract', async () => {
    ontology = await CvcOntology.new({ from: admin, gas });
    idvRegistry = await CvcValidatorRegistry.new({ from: admin, gas });
    pricing = await CvcPricing.new(ontology.address, idvRegistry.address, { from: admin, gas });
    pricingAccessor = await PricingAccessor.new(pricing.address, { from: admin, gas });
  });

  describe('Initialization', () => {
    describe('when the CvcOntology is not a deployed contract address', () => {
      it('reverts', async () => {
        const cvcOntologyAddress = admin;
        await expect(CvcPricing.new(cvcOntologyAddress, idvRegistry.address, { from: admin, gas })).to.be.rejected;
      });
    });
    describe('when the CvcValidatorRegistry is not a deployed contract address', () => {
      it('reverts', async () => {
        const idvRegistryAddress = admin;
        await expect(CvcPricing.new(ontology.address, idvRegistryAddress, { from: admin, gas })).to.be.rejected;
      });
    });
  });

  describe('Getting prices:', () => {
    describe('when IDV is not registered', () => {
      it('returns the fallback price', async () =>
        assertFallbackPrice(await pricing.getPrice(idv, type, name, version)));
    });

    describe('when IDV is registered', () => {
      beforeEach(() => idvRegistry.set(idv, idvName, idvDescription, { from: admin }));

      describe('when credential item is undefined', () => {
        it('returns the fallback price', async () =>
          assertFallbackPrice(await pricing.getPrice(idv, type, 'non-existent', version)));
      });

      describe('when credential item is registered', () => {
        beforeEach(() => ontology.add(type, name, version, reference, referenceType, referenceHash, { from: admin }));

        describe('when price is not set', () => {
          it('returns the fallback price', async () =>
            assertFallbackPrice(await pricing.getPrice(idv, type, name, version)));
        });

        describe('when price is set', () => {
          const from = idv;
          beforeEach(() => pricing.setPrice(type, name, version, price, { from }));

          it('returns the correct price', async () => {
            const credentialItemPrice = await pricing.getPrice(idv, type, name, version);
            assertCredentialItemPrice(credentialItemPrice, [price, idv, type, name, version, false]);
          });

          it('returns the correct price by ID', async () => {
            // get first price from the list of all prices via accessor
            const credentialItemPrice = await pricingAccessor.getOne(0);
            // fetch single credential item price by ID
            expect(credentialItemPrice).to.deep.equal(await pricing.getPriceById(credentialItemPrice[0]));
          });

          it('returns the correct price by credential item id', async () => {
            const credentialItem = await ontology.getByTypeNameVersion(type, name, version);
            const priceByCredentialTypeNameVersion = await pricing.getPrice(idv, type, name, version);
            const priceByCredentialItemId = await pricing.getPriceByCredentialItemId(idv, credentialItem[0]);
            expect(priceByCredentialTypeNameVersion).to.deep.equal(priceByCredentialItemId);
          });

          describe('when credential item is deprecated', () => {
            beforeEach(() => ontology.deprecate(type, name, version, { from: admin }));

            it('still returns correct price', async () => {
              const credentialItemPrice = await pricing.getPrice(idv, type, name, version);
              assertCredentialItemPrice(credentialItemPrice, [price, idv, type, name, version, true]);
            });
          });
        });

        describe('when multiple prices are set', () => {
          const from = idv;
          const names = ['A', 'B', 'C'].map(i => `${name}${i}`);
          beforeEach(async () => {
            for (const credentialItemName of names) {
              // eslint-disable-next-line no-await-in-loop
              await ontology.add(type, credentialItemName, version, reference, referenceType, referenceHash, {
                from: admin
              });
              // eslint-disable-next-line no-await-in-loop
              await pricing.setPrice(type, credentialItemName, version, price, { from });
            }
          });

          it('returns all IDs', async () => {
            const ids = await pricing.getAllIds();
            expect(ids.length).to.equal(names.length);
          });

          it('returns all prices', async () => {
            await Promise.all(
              names.map(async (credentialItemName, i) => {
                const credentialItemPrice = await pricingAccessor.getOne(i);
                assertCredentialItemPrice(credentialItemPrice, [price, idv, type, credentialItemName, version, false]);
              })
            );
          });
        });
      });
    });
  });

  describe('Setting prices:', () => {
    describe('when the contract is paused', () => {
      beforeEach(() => pricing.pause({ from: admin }));
      it('reverts', () => expect(pricing.setPrice(type, name, version, price, { from: idv })).to.be.rejected);
    });

    describe('when IDV is not registered', () => {
      it('reverts', () => expect(pricing.setPrice(type, name, version, price, { from: idv })).to.be.rejected);
    });

    describe('when IDV is registered', () => {
      beforeEach(() => idvRegistry.set(idv, idvName, idvDescription, { from: admin }));

      describe('when the sender is not registered IDV', () => {
        it('reverts', () => expect(pricing.setPrice(type, name, version, price, { from: admin })).to.be.rejected);
      });

      describe('when credential item is undefined', () => {
        it('reverts', () =>
          expect(pricing.setPrice(type, 'non-existent', version, price, { from: idv })).to.be.rejected);
      });

      describe('when credential item is registered', () => {
        beforeEach(() => ontology.add(type, name, version, reference, referenceType, referenceHash, { from: admin }));

        describe('when credential item is deprecated', () => {
          beforeEach(() => ontology.deprecate(type, name, version, { from: admin }));

          it('reverts', () => expect(pricing.setPrice(type, name, version, price, { from: idv })).to.be.rejected);
        });

        describe('when price is not set', () => {
          it('sets the correct price', async () => {
            await pricing.setPrice(type, name, version, price, { from: idv });
            const credentialItemPrice = await pricing.getPrice(idv, type, name, version);
            assertCredentialItemPrice(credentialItemPrice, [price, idv, type, name, version]);
          });

          it('dispatches price set event', async () => {
            const credentialItem = await ontology.getByTypeNameVersion(type, name, version);
            const { logs } = await pricing.setPrice(type, name, version, price, { from: idv });
            const priceSettingEvents = logs.filter(e => e.event === EVENT_CREDENTIAL_ITEM_PRICE_SET);
            expect(priceSettingEvents).to.be.lengthOf(1);

            assertCredentialItemPriceSetEvent(priceSettingEvents[0], [
              price,
              idv,
              type,
              name,
              version,
              credentialItem[0]
            ]);
          });
        });

        describe('when price is set', () => {
          beforeEach(() => pricing.setPrice(type, name, version, price, { from: idv }));

          it('updates price correctly', async () => {
            const newPrice = price.add(100);
            await pricing.setPrice(type, name, version, newPrice, { from: idv });
            const credentialItemPrice = await pricing.getPrice(idv, type, name, version);
            assertCredentialItemPrice(credentialItemPrice, [newPrice, idv, type, name, version]);
          });

          it('does not duplicate IDs', async () => {
            const idsBefore = await pricing.getAllIds();
            // set price for existing credential item again
            const newPrice = price.add(100);
            await pricing.setPrice(type, name, version, newPrice, { from: idv });
            const idsAfter = await pricing.getAllIds();
            expect(idsBefore).to.deep.equal(idsAfter);
          });

          it('dispatches price set event', async () => {
            const credentialItem = await ontology.getByTypeNameVersion(type, name, version);
            const result = await pricing.setPrice(type, name, version, price, { from: idv });
            const priceSettingEvents = result.logs.filter(e => e.event === EVENT_CREDENTIAL_ITEM_PRICE_SET);
            expect(priceSettingEvents).to.be.lengthOf(1);

            assertCredentialItemPriceSetEvent(priceSettingEvents[0], [
              price,
              idv,
              type,
              name,
              version,
              credentialItem[0]
            ]);
          });
        });

        describe('when price is greater than CVC total supply', () => {
          it('reverts', () => {
            const invalidPrice = new Bn(TOTAL_SUPPLY).add(1);
            return expect(pricing.setPrice(type, name, version, invalidPrice, { from: idv })).to.be.rejected;
          });
        });

        describe('when price is equal to CVC total supply', () => {
          it('sets the correct price', async () => {
            const maxPrice = new Bn(TOTAL_SUPPLY);
            await pricing.setPrice(type, name, version, maxPrice, { from: idv });
            const credentialItemPrice = await pricing.getPrice(idv, type, name, version);
            assertCredentialItemPrice(credentialItemPrice, [maxPrice, idv, type, name, version]);
          });
        });

        describe('when price is zero', () => {
          it('sets the correct price', async () => {
            const zeroPrice = 0;
            await pricing.setPrice(type, name, version, zeroPrice, { from: idv });
            const credentialItemPrice = await pricing.getPrice(idv, type, name, version);
            assertCredentialItemPrice(credentialItemPrice, [zeroPrice, idv, type, name, version]);
          });
        });
      });
    });
  });

  describe('Deleting prices:', () => {
    describe('when the contract is paused', () => {
      beforeEach(() => pricing.pause({ from: admin }));
      it('reverts', () => expect(pricing.deletePrice(type, name, version, { from: idv })).to.be.rejected);
    });

    describe('when credential item is undefined', () => {
      it('reverts', () => expect(pricing.deletePrice(type, 'non-existent', version, { from: idv })).to.be.rejected);
    });

    describe('when credential item is registered', () => {
      beforeEach(() => ontology.add(type, name, version, reference, referenceType, referenceHash, { from: admin }));

      describe('when price is not set', () => {
        it('reverts', () => expect(pricing.deletePrice(type, name, version, { from: idv })).to.be.rejected);
      });

      describe('when price is set', () => {
        const idv1 = idv;
        const assertIdIsExcluded = (idsBefore, idsAfter, excludedId, includedIds = []) => {
          expect(idsAfter).has.lengthOf(idsBefore.length - 1);
          expect(idsAfter).not.include(excludedId);
          if (includedIds.length > 0) {
            expect(idsAfter).to.have.members(includedIds);
          }
        };

        beforeEach('register IDVs', async () => {
          await idvRegistry.set(idv1, idvName, idvDescription, { from: admin });
          await idvRegistry.set(idv2, idvName, idvDescription, { from: admin });
          await idvRegistry.set(idv3, idvName, idvDescription, { from: admin });
        });
        beforeEach('set prices', async () => {
          await pricing.setPrice(type, name, version, price, { from: idv1 });
          await pricing.setPrice(type, name, version, price, { from: idv2 });
          await pricing.setPrice(type, name, version, price, { from: idv3 });
        });

        describe('when the sender is not price owner IDV', () => {
          it('reverts', () => expect(pricing.deletePrice(type, name, version, { from: admin })).to.be.rejected);
        });

        it('deletes first price entry', async () => {
          const idsBefore = await pricing.getAllIds();
          const [firstItemId] = await pricing.getPrice(idv1, type, name, version);
          expect(firstItemId).to.equal(idsBefore[0], 'First id matches');
          await pricing.deletePrice(type, name, version, { from: idv1 });
          const credentialItemPrice = await pricing.getPrice(idv1, type, name, version);
          assertFallbackPrice(credentialItemPrice);
          assertIdIsExcluded(idsBefore, await pricing.getAllIds(), firstItemId);
        });

        it('deletes last price entry', async () => {
          const idsBefore = await pricing.getAllIds();
          const [lastItemId] = await pricing.getPrice(idv3, type, name, version);
          expect(lastItemId).to.equal(idsBefore[2], 'Last id matches');
          await pricing.deletePrice(type, name, version, { from: idv3 });
          const credentialItemPrice = await pricing.getPrice(idv3, type, name, version);
          assertFallbackPrice(credentialItemPrice);
          assertIdIsExcluded(idsBefore, await pricing.getAllIds(), lastItemId);
        });

        it('dispatches price deleted event', async () => {
          const credentialItem = await ontology.getByTypeNameVersion(type, name, version);
          const result = await pricing.deletePrice(type, name, version, { from: idv3 });
          const priceDeletingEvents = result.logs.filter(e => e.event === EVENT_CREDENTIAL_ITEM_PRICE_DELETED);
          expect(priceDeletingEvents).to.be.lengthOf(1);
          assertCredentialItemPriceDeletedEvent(priceDeletingEvents[0], [idv3, type, name, version, credentialItem[0]]);
        });

        it('deletes all prices from a long list', async () => {
          await idvRegistry.set(idv4, idvName, idvDescription, { from: admin });
          await idvRegistry.set(idv5, idvName, idvDescription, { from: admin });
          await pricing.setPrice(type, name, version, price, { from: idv4 });
          await pricing.setPrice(type, name, version, price, { from: idv5 });
          let allIdsBefore = await pricing.getAllIds();
          const [id1, id2, id3, id4, id5] = allIdsBefore;
          let allIdsAfter;

          // delete 3rd price
          await pricing.deletePrice(type, name, version, { from: idv3 });
          assertFallbackPrice(await pricing.getPrice(idv3, type, name, version));
          assertFallbackPrice(await pricing.getPriceById(id3));
          allIdsAfter = await pricing.getAllIds();
          assertIdIsExcluded(allIdsBefore, allIdsAfter, id3, [id1, id2, id4, id5]);

          // delete 5th price
          allIdsBefore = await pricing.getAllIds();
          await pricing.deletePrice(type, name, version, { from: idv5 });
          assertFallbackPrice(await pricing.getPrice(idv5, type, name, version));
          assertFallbackPrice(await pricing.getPriceById(id5));
          allIdsAfter = await pricing.getAllIds();
          assertIdIsExcluded(allIdsBefore, allIdsAfter, id5, [id1, id2, id4]);

          // delete 4th price
          allIdsBefore = await pricing.getAllIds();
          await pricing.deletePrice(type, name, version, { from: idv4 });
          assertFallbackPrice(await pricing.getPrice(idv4, type, name, version));
          assertFallbackPrice(await pricing.getPriceById(id4));
          allIdsAfter = await pricing.getAllIds();
          assertIdIsExcluded(allIdsBefore, allIdsAfter, id4, [id1, id2]);

          // delete 1st price
          allIdsBefore = await pricing.getAllIds();
          await pricing.deletePrice(type, name, version, { from: idv1 });
          assertFallbackPrice(await pricing.getPrice(idv1, type, name, version));
          assertFallbackPrice(await pricing.getPriceById(id1));
          allIdsAfter = await pricing.getAllIds();
          assertIdIsExcluded(allIdsBefore, allIdsAfter, id1, [id2]);

          // delete 2nd price
          allIdsBefore = await pricing.getAllIds();
          await pricing.deletePrice(type, name, version, { from: idv2 });
          assertFallbackPrice(await pricing.getPrice(idv2, type, name, version));
          assertFallbackPrice(await pricing.getPriceById(id2));
          allIdsAfter = await pricing.getAllIds();
          assertIdIsExcluded(allIdsBefore, allIdsAfter, id2);

          expect(await pricing.getAllIds()).to.be.lengthOf(0);
        });
      });
    });
  });
});

function assertCredentialItemPrice(
  credentialItemPrice,
  [expectedPrice, expectedIdv, expectedType, expectedName, expectedVersion, expectedDeprecated]
) {
  expect(credentialItemPrice)
    .to.be.an('array')
    .with.lengthOf(7);
  const [
    id,
    price,
    idv,
    credentialItemType,
    credentialItemName,
    credentialItemVersion,
    deprecated
  ] = credentialItemPrice;
  expect(id)
    .to.match(/^0x[0-f]{64}$/, 'Price ID is not bytes32 hex string')
    .to.not.match(/0x0{64}/, 'Empty price ID');
  expect(price).to.bignumber.equal(expectedPrice, 'Invalid price');
  expect(idv).to.equal(expectedIdv, 'Invalid IDV address');
  expect(credentialItemType).to.equal(expectedType, 'Invalid Type');
  expect(credentialItemName).to.equal(expectedName, 'Invalid Name');
  expect(credentialItemVersion).to.equal(expectedVersion, 'Invalid Version');
  expect(deprecated).to.be.a('boolean', 'Deprecated flag missing or invalid');
  if (typeof expectedDeprecated !== 'undefined') {
    expect(deprecated).to.equal(expectedDeprecated, 'Invalid deprecated value');
  }
}

function assertFallbackPrice(credentialItemPrice) {
  // Max available value could returned by getPrice method.
  // It is more than CVC total supply, which is invalid price.
  const fallbackPrice = new Bn(TOTAL_SUPPLY).add(1);
  expect(credentialItemPrice)
    .to.be.an('array')
    .with.lengthOf(7);
  const [
    id,
    price,
    idv,
    credentialItemType,
    credentialItemName,
    credentialItemVersion,
    deprecated
  ] = credentialItemPrice;
  expect(id).to.match(/0x0{64}/, 'Invalid price ID');
  expect(price).to.bignumber.equal(fallbackPrice, 'Invalid price');
  expect(idv).to.match(/0x0{40}/, 'Invalid IDV address');
  expect(credentialItemType).to.equal('', 'Invalid Type');
  expect(credentialItemName).to.equal('', 'Invalid Name');
  expect(credentialItemVersion).to.equal('', 'Invalid Version');
  expect(deprecated).to.equal(false, 'Invalid deprecated flag value');
}

function assertCredentialItemPriceSetEvent(
  event,
  [
    expectedPrice,
    expectedIdv,
    expectedCredentialItemType,
    expectedCredentialItemName,
    expectedCredentialItemVersion,
    expectedCredentialItemId
  ]
) {
  expect(event.args.id).to.match(/^0x[0-f]{64}$/, 'Invalid price ID');
  expect(event.args.price).to.bignumber.equal(expectedPrice, 'Invalid price');
  expect(event.args.idv).to.equal(expectedIdv, 'Invalid IDV address');
  expect(event.args.credentialItemType).to.equal(expectedCredentialItemType, 'Invalid Credential Item Type');
  expect(event.args.credentialItemName).to.equal(expectedCredentialItemName, 'Invalid Credential Item Name');
  expect(event.args.credentialItemVersion).to.equal(expectedCredentialItemVersion, 'Invalid Credential Item Version');
  expect(event.args.credentialItemId).to.equal(expectedCredentialItemId, 'Invalid Credential Item ID');
}

function assertCredentialItemPriceDeletedEvent(
  event,
  [
    expectedIdv,
    expectedCredentialItemType,
    expectedCredentialItemName,
    expectedCredentialItemVersion,
    expectedCredentialItemId
  ]
) {
  expect(event.args.id).to.match(/^0x[0-f]{64}$/, 'Invalid price ID');
  expect(event.args.idv).to.equal(expectedIdv, 'Invalid IDV address');
  expect(event.args.credentialItemType).to.equal(expectedCredentialItemType, 'Invalid Credential Item Type');
  expect(event.args.credentialItemName).to.equal(expectedCredentialItemName, 'Invalid Credential Item Name');
  expect(event.args.credentialItemVersion).to.equal(expectedCredentialItemVersion, 'Invalid Credential Item Version');
  expect(event.args.credentialItemId).to.equal(expectedCredentialItemId, 'Invalid Credential Item ID');
}
