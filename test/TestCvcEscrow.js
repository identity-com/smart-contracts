// `artifacts.require` helper introduced by Truffle
const CvcToken = artifacts.require('CvcToken');

const CvcEscrow = artifacts.require('CvcEscrow');
const CvcPricing = artifacts.require('CvcPricing');
const CvcOntology = artifacts.require('CvcOntology');
const CvcValidatorRegistry = artifacts.require('CvcValidatorRegistry');
const crypto = require('crypto');
const Web3 = require('web3');
const _ = require('lodash');
const Bn = require('bignumber.js');
const chai = require('chai');
chai.use(require('chai-as-promised'));

const {
  EVENT_ESCROW_PLACED,
  EVENT_ESCROW_MOVED,
  EVENT_ESCROW_RELEASED,
  EVENT_ESCROW_REFUNDED,
  TOTAL_SUPPLY,
  CVC_DECIMALS,
  ONE_CVC
} = require('../constants');

const { expect } = chai;
let token;

const url = process.env.RSK_NODE_URL;
const web3 = new Web3(new Web3.providers.HttpProvider(url));

// Disabling no-undef because of `contract` helper introduced by Truffle
// eslint-disable-next-line no-undef
contract('CvcEscrow:', accounts => {
  const gas = 7000000;
  const [platform, idr] = accounts;
  const idv = '0x1a88a35421a4a0d3e13fe4e8ebcf18e9a249dc5a';
  const scopeRequestId = generateScopeRequestId();
  const amount = 2000; // in the least dividable units
  const batchSize = 99;
  const scopeRequestIdBatch = generateScopeRequestBatch(batchSize);
  const batchAmount = new Bn(amount).mul(batchSize).toNumber();
  const credentialItemIds = ['0xb5784440e237737fe62c5703fe5b0153cf9b28e6dd481a13790c885d10e8497e']; // ProofOfIdentity

  let pricing;
  before(async () => {
    // Deploy CvcToken.
    token = await CvcToken.new(platform, 'Identity.com', 'CVC', TOTAL_SUPPLY, CVC_DECIMALS);
    // Mint IDR tokens.
    await token.transfer(idr, 5 * ONE_CVC, { from: platform });
    // Register IDV.
    const validatorRegistry = await CvcValidatorRegistry.new({ gas });
    await validatorRegistry.set(idv, 'IDV', 'IDV company');

    // Register Credential Item.
    const ontology = await CvcOntology.new({ gas });
    await ontology.add(
      'credential',
      'proofOfIdentity',
      'v1.0',
      'https://www.identity.com/',
      'JSON-LD-Context',
      '0x2cd9bf92c5e20b1b410f5ace94d963a96e89156fbe65b70365e8596b37f1f165'
    );

    // Set default price.
    pricing = await CvcPricing.new(ontology.address, validatorRegistry.address, { gas });
    await pricing.setPrice('credential', 'proofOfIdentity', 'v1.0', 2000, { from: idv });
  });

  let escrow;
  beforeEach('Deploy CvcEscrow', async () => {
    escrow = await CvcEscrow.new(token.address, platform, pricing.address, { gas });
  });

  const mineBlock = async () => token.approve(platform, 0); // Dummy tx to make sure block is mined.

  // eslint-disable-next-line no-shadow
  const placeEscrow = async (idv, scopeRequestId, amount, credentialItemIds, options, withApprove = true) => {
    if (withApprove) {
      await token.approve(escrow.address, amount, options);
    }
    return escrow.place(idv, scopeRequestId, amount, credentialItemIds, options);
  };

  // eslint-disable-next-line no-shadow
  const placeEscrowBatch = async (idv, scopeRequestIds, amount, credentialItemIds, options, withApprove = true) => {
    if (withApprove) {
      await token.approve(escrow.address, amount, options);
    }
    return escrow.placeBatch(idv, scopeRequestIds, amount, credentialItemIds, options);
  };

  describe('Initialization', () => {
    describe('when the CvcToken is not a deployed contract address', () => {
      it('reverts', async () => {
        const tokenAddress = platform; // use platform as non-contract address example
        await expect(CvcEscrow.new(tokenAddress, platform, pricing.address, { gas })).to.be.rejected;
      });
    });
    describe('when the CvcPricing is not a deployed contract address', () => {
      it('reverts', async () => {
        const pricingAddress = platform; // use platform as non-contract address example
        await expect(CvcEscrow.new(token.address, platform, pricingAddress, { gas })).to.be.rejected;
      });
    });
  });

  describe('Place', () => {
    describe('when IDR has not approved enough tokens', () => {
      it('reverts', () =>
        expect(placeEscrow(idv, scopeRequestId, amount, credentialItemIds, { from: idr }, false)).to.be.rejected);
    });

    describe('when IDR has approved enough tokens', () => {
      describe('when the contract is paused', () => {
        beforeEach('Pause contract', () => escrow.pause({ from: platform }));
        it('reverts', () =>
          expect(placeEscrow(idv, scopeRequestId, amount, credentialItemIds, { from: idr })).to.be.rejected);
      });

      describe('when escrow was already placed', () => {
        beforeEach('Place escrow', () => placeEscrow(idv, scopeRequestId, amount, credentialItemIds, { from: idr }));
        it('reverts', () =>
          expect(placeEscrow(idv, scopeRequestId, amount, credentialItemIds, { from: idr })).to.be.rejected);

        describe('before escrow timeout', () => {
          describe('when escrow was released', () => {
            beforeEach('Release escrow', () => escrow.release(idr, idv, scopeRequestId, { from: platform }));
            it('reverts', () =>
              expect(placeEscrow(idv, scopeRequestId, amount, credentialItemIds, { from: idr })).to.be.rejected);
          });
        });

        describe('after escrow timeout', () => {
          beforeEach('Simulate timeout', async () => {
            await escrow.setTimeoutThreshold(1);
            await mineBlock();
          });

          describe('when escrow was refunded', () => {
            beforeEach('Refund escrow', () => escrow.refund(idr, idv, scopeRequestId, { from: platform }));
            it('places escrow', () => placeEscrow(idv, scopeRequestId, amount, credentialItemIds, { from: idr }));
          });
        });
      });

      describe('when new escrow', () => {
        let balanceChanges;
        let placeLogs;
        beforeEach('Place escrow & and get balance changes', async () => {
          const balances = await getBalances([idr, escrow.address, platform, idv]);
          placeLogs = (await placeEscrow(idv, scopeRequestId, amount, credentialItemIds, { from: idr })).logs;
          balanceChanges = await getBalanceChanges(balances);
        });

        it('correctly updates balances', async () => {
          assertBalanceChange(balanceChanges, idr, -amount);
          assertBalanceChange(balanceChanges, escrow.address, +amount);
          assertBalanceChange(balanceChanges, idv, 0);
          assertBalanceChange(balanceChanges, platform, 0);
        });

        it(`emits ${EVENT_ESCROW_PLACED} event`, async () => {
          const placementId = calculatePlacementId(idr, idv, [scopeRequestId]);
          const events = placeLogs.filter(e => e.event === EVENT_ESCROW_PLACED);
          expect(events).to.be.lengthOf(1);
          const [event] = events;
          expect(event.args.idr).to.equal(idr, 'Requestor address does not match');
          expect(event.args.idv).to.equal(idv, 'IDV address does not match');
          expect(event.args.scopeRequestId).to.equal(scopeRequestId, 'ScopeRequest ID does not match');
          expect(event.args.credentialItemIds).to.deep.equal(credentialItemIds, 'CredentialItems does not match');
          expect(event.args.amount.toNumber()).to.equal(amount, 'Escrow amount does not match');
          expect(event.args.placementId).to.equal(placementId, 'Escrow placement ID does not match');
        });

        describe('when escrowed amount is less than credential item price', () => {
          it('reverts', () =>
            expect(placeEscrow(idv, scopeRequestId, amount - 1, credentialItemIds, { from: idr })).to.be.rejected);
        });

        describe('when escrowed amount is more than credential item price', () => {
          it('reverts', () =>
            expect(placeEscrow(idv, scopeRequestId, amount + 1, credentialItemIds, { from: idr })).to.be.rejected);
        });
      });
    });
  });

  describe('Place Batch', () => {
    const placementId = calculatePlacementId(idr, idv, scopeRequestIdBatch);
    describe('when IDR has not approved enough tokens', () => {
      it('reverts', () =>
        expect(placeEscrowBatch(idv, scopeRequestIdBatch, batchAmount, credentialItemIds, { from: idr }, false)).to.be
          .rejected);
    });

    describe('when IDR has approved enough tokens', () => {
      describe('when the contract is paused', () => {
        beforeEach('Pause contract', () => escrow.pause({ from: platform }));
        it('reverts', () =>
          expect(placeEscrowBatch(idv, scopeRequestIdBatch, batchAmount, credentialItemIds, { from: idr })).to.be
            .rejected);
      });

      describe('when escrow batch was already placed', () => {
        beforeEach('Place escrow batch', () =>
          placeEscrowBatch(idv, scopeRequestIdBatch, batchAmount, credentialItemIds, { from: idr })
        );
        it('reverts', () =>
          expect(placeEscrowBatch(idv, scopeRequestIdBatch, batchAmount, credentialItemIds, { from: idr })).to.be
            .rejected);

        describe('before escrow timeout', () => {
          describe('when escrow batch was released', () => {
            beforeEach('Release escrow', () =>
              escrow.releaseBatch(idr, idv, scopeRequestIdBatch, [], { from: platform })
            );
            it('reverts', () =>
              expect(placeEscrowBatch(idv, scopeRequestIdBatch, batchAmount, credentialItemIds, { from: idr })).to.be
                .rejected);
          });
        });

        describe('after escrow timeout', () => {
          beforeEach('Simulate timeout', async () => {
            await escrow.setTimeoutThreshold(1);
            await mineBlock();
          });

          describe('when escrow batch was refunded', () => {
            beforeEach('Refund escrow', () => escrow.refundBatch(idr, idv, scopeRequestIdBatch, { from: platform }));

            it('places escrow', () =>
              placeEscrowBatch(idv, scopeRequestIdBatch, batchAmount, credentialItemIds, { from: idr }));
          });
        });
      });

      describe('when new escrow', () => {
        let balanceChanges;
        let placeLogs;
        beforeEach('Place escrow & and get balance changes', async () => {
          const balances = await getBalances([idr, escrow.address, platform, idv]);
          placeLogs = (await placeEscrowBatch(idv, scopeRequestIdBatch, batchAmount, credentialItemIds, { from: idr }))
            .logs;
          balanceChanges = await getBalanceChanges(balances);
        });

        it('correctly updates balances', async () => {
          assertBalanceChange(balanceChanges, idr, -batchAmount);
          assertBalanceChange(balanceChanges, escrow.address, +batchAmount);
          assertBalanceChange(balanceChanges, idv, 0);
          assertBalanceChange(balanceChanges, platform, 0);
        });

        it(`emits ${EVENT_ESCROW_PLACED} event`, async () => {
          const events = placeLogs.filter(e => e.event === EVENT_ESCROW_PLACED);
          expect(events).to.be.lengthOf(batchSize);
          events.forEach((event, i) => {
            expect(event.args.idr).to.equal(idr, 'Requestor address does not match');
            expect(event.args.idv).to.equal(idv, 'IDV address does not match');
            expect(event.args.scopeRequestId).to.equal(scopeRequestIdBatch[i], 'ScopeRequest ID does not match');
            expect(event.args.credentialItemIds).to.deep.equal(credentialItemIds, 'CredentialItems does not match');
            expect(event.args.amount.toNumber()).to.equal(amount, 'Escrow amount does not match');
            expect(event.args.placementId).to.equal(placementId, 'Escrow placement ID does not match');
          });
        });

        describe('when escrowed amount is less than credential item price', () => {
          it('reverts', () =>
            expect(placeEscrowBatch(idv, scopeRequestIdBatch, batchAmount - 1, credentialItemIds, { from: idr })).to.be
              .rejected);
        });

        describe('when escrowed amount is more than credential item price', () => {
          it('reverts', () =>
            expect(placeEscrowBatch(idv, scopeRequestIdBatch, batchAmount + 1, credentialItemIds, { from: idr })).to.be
              .rejected);
        });
      });
    });
  });

  describe('Verify', () => {
    describe('when escrow is not placed', () => {
      it('verifies empty escrow', async () => {
        const result = await escrow.verify(idr, idv, scopeRequestId);
        assertVerify(result, 0, 0, [], 0, false);
      });
    });

    describe('when escrow was placed', () => {
      beforeEach('Place escrow', () => placeEscrow(idv, scopeRequestId, amount, credentialItemIds, { from: idr }));

      it('verifies placed escrow state', async () => {
        const result = await escrow.verify(idr, idv, scopeRequestId);
        assertVerify(result, amount, 1, credentialItemIds, 1, false);
      });

      describe('before escrow timeout', () => {
        it('verifies cannot refund', async () => {
          const result = await escrow.verify(idr, idv, scopeRequestId);
          assertVerify(result, amount, 1, credentialItemIds, 0, false);
        });

        describe('when escrow was released', () => {
          beforeEach('Release escrow', () => escrow.release(idr, idv, scopeRequestId, { from: platform }));
          it('verifies released escrow state', async () => {
            const result = await escrow.verify(idr, idv, scopeRequestId);
            assertVerify(result, 0, 2, credentialItemIds, 1, false);
          });
        });
      });

      describe('after escrow timeout', () => {
        beforeEach('Simulate timeout', async () => {
          await escrow.setTimeoutThreshold(1);
          await mineBlock();
        });

        it('verifies can refund', async () => {
          const result = await escrow.verify(idr, idv, scopeRequestId);
          assertVerify(result, amount, 1, credentialItemIds, 1, true);
        });

        describe('when escrow was refunded', () => {
          beforeEach('Refund escrow', () => escrow.refund(idr, idv, scopeRequestId, { from: platform }));
          it('verifies refunded escrow state', async () => {
            const result = await escrow.verify(idr, idv, scopeRequestId);
            assertVerify(result, 0, 3, credentialItemIds, 1, false);
          });
        });
      });
    });
  });

  describe('Verify Batch', () => {
    describe('when escrow is not placed', () => {
      it('verifies empty escrow', async () => {
        const result = await escrow.verifyBatch(idr, idv, scopeRequestIdBatch);
        assertVerify(result, 0, 0, [], 0, false);
      });
    });

    describe('when escrow was placed', () => {
      beforeEach('Place escrow', () =>
        placeEscrowBatch(idv, scopeRequestIdBatch, batchAmount, credentialItemIds, { from: idr })
      );

      it('verifies placed escrow state', async () => {
        const result = await escrow.verifyBatch(idr, idv, scopeRequestIdBatch);
        assertVerify(result, batchAmount, 1, credentialItemIds, 1, false);
      });

      describe('before escrow timeout', () => {
        it('verifies cannot refund', async () => {
          const result = await escrow.verifyBatch(idr, idv, scopeRequestIdBatch);
          assertVerify(result, batchAmount, 1, credentialItemIds, 0, false);
        });

        describe('when escrow was released', () => {
          beforeEach('Release escrow batch', () =>
            escrow.releaseBatch(idr, idv, scopeRequestIdBatch, [], { from: platform })
          );
          it('verifies released escrow state', async () => {
            const result = await escrow.verifyBatch(idr, idv, scopeRequestIdBatch);
            assertVerify(result, 0, 2, credentialItemIds, 1, false);
          });
        });
      });

      describe('after escrow timeout', () => {
        beforeEach('Simulate timeout', async () => {
          await escrow.setTimeoutThreshold(1);
          await mineBlock();
        });

        it('verifies can refund', async () => {
          const result = await escrow.verifyBatch(idr, idv, scopeRequestIdBatch);
          assertVerify(result, batchAmount, 1, credentialItemIds, 1, true);
        });

        describe('when escrow was refunded', () => {
          beforeEach('Refund escrow', () => escrow.refundBatch(idr, idv, scopeRequestIdBatch, { from: platform }));
          it('verifies refunded escrow state', async () => {
            const result = await escrow.verifyBatch(idr, idv, scopeRequestIdBatch);
            assertVerify(result, 0, 3, credentialItemIds, 1, false);
          });
        });
      });
    });
  });

  describe('Verify Placement', () => {
    const placementId = calculatePlacementId(idr, idv, scopeRequestIdBatch);
    describe('when escrow is not placed', () => {
      it('verifies empty escrow', async () => {
        const result = await escrow.verifyPlacement(placementId);
        assertVerify(result, 0, 0, [], 0, false);
      });
    });

    describe('when escrow was placed', () => {
      beforeEach('Place escrow', () =>
        placeEscrowBatch(idv, scopeRequestIdBatch, batchAmount, credentialItemIds, { from: idr })
      );

      it('verifies placed escrow state', async () => {
        const result = await escrow.verifyPlacement(placementId);
        assertVerify(result, batchAmount, 1, credentialItemIds, 1, false);
      });

      describe('before escrow timeout', () => {
        it('verifies cannot refund', async () => {
          const result = await escrow.verifyPlacement(placementId);
          assertVerify(result, batchAmount, 1, credentialItemIds, 0, false);
        });

        describe('when escrow was released', () => {
          beforeEach('Release escrow', () =>
            escrow.releaseBatch(idr, idv, scopeRequestIdBatch, [], { from: platform })
          );
          it('verifies released escrow state', async () => {
            const result = await escrow.verifyPlacement(placementId);
            assertVerify(result, 0, 2, credentialItemIds, 1, false);
          });
        });
      });

      describe('after escrow timeout', () => {
        beforeEach('Simulate timeout', async () => {
          await escrow.setTimeoutThreshold(1);
          await mineBlock();
        });

        it('verifies can refund', async () => {
          const result = await escrow.verifyPlacement(placementId);
          assertVerify(result, batchAmount, 1, credentialItemIds, 1, true);
        });

        describe('when escrow was refunded', () => {
          beforeEach('Refund escrow', () => escrow.refundBatch(idr, idv, scopeRequestIdBatch, { from: platform }));
          it('verifies refunded escrow state', async () => {
            const result = await escrow.verifyPlacement(placementId);
            assertVerify(result, 0, 3, credentialItemIds, 1, false);
          });
        });
      });
    });
  });

  describe('Release', () => {
    const placementId = calculatePlacementId(idr, idv, [scopeRequestId]);
    describe('when escrow is not placed', () => {
      it('reverts', () => expect(escrow.release(idr, idv, scopeRequestId, { from: platform })).to.be.rejected);
    });

    describe('when escrow was placed', async () => {
      beforeEach('Place escrow', () => placeEscrow(idv, scopeRequestId, amount, credentialItemIds, { from: idr }));

      describe('when the contract is paused', () => {
        beforeEach('Pause contract', () => escrow.pause({ from: platform }));
        it('reverts', () => expect(escrow.release(idr, idv, scopeRequestId, { from: platform })).to.be.rejected);
      });

      describe('before escrow timeout', () => {
        // Test release with different platform fee rates applied.
        const rates = [
          { name: '0', rate: 0 },
          { name: '25', rate: 2.5e7 },
          { name: '33.(3)', rate: 3.3333333e7 },
          { name: '100', rate: 1e8 }
        ];

        rates.forEach(({ name, rate }) => {
          describe(`when platform fee rate is ${name}%`, () => {
            let balanceChanges;
            let releaseLogs;
            let platformFee;
            let idvFee;

            beforeEach(`Set platform fee rate ${name}%`, async () => {
              await escrow.setFeeRate(rate);
              // verify rate changed
              expect((await escrow.platformFeeRate()).toNumber()).to.equal(rate);
              // calculate fees
              platformFee = (await escrow.calculatePlatformFee(amount)).toNumber();
              idvFee = amount - platformFee;
            });

            beforeEach('Release escrow & get balance changes', async () => {
              const balances = await getBalances([idr, escrow.address, platform, idv]);
              releaseLogs = (await escrow.release(idr, idv, scopeRequestId, { from: platform })).logs;
              balanceChanges = await getBalanceChanges(balances);
            });

            it('correctly updates balances', async () => {
              assertBalanceChange(balanceChanges, idr, 0);
              assertBalanceChange(balanceChanges, escrow.address, -amount);
              assertBalanceChange(balanceChanges, idv, +idvFee);
              assertBalanceChange(balanceChanges, platform, +platformFee);
            });

            it(`emits ${EVENT_ESCROW_RELEASED} event`, async () => {
              const events = releaseLogs.filter(e => e.event === EVENT_ESCROW_RELEASED);
              expect(events).to.be.lengthOf(1);
              const [event] = events;
              expect(event.args.idr).to.equal(idr, 'Requestor address does not match');
              expect(event.args.idv).to.equal(idv, 'IDV address does not match');
              expect(event.args.scopeRequestId).to.equal(scopeRequestId, 'ScopeRequest ID does not match');
              expect(event.args.credentialItemIds).to.deep.equal(credentialItemIds, 'CredentialItems does not match');
              expect(event.args.platformFee.toNumber()).to.equal(platformFee, 'Platform Fee does not match');
              expect(event.args.idvFee.toNumber()).to.equal(idvFee, 'IDV Fee does not match');
              expect(event.args.placementId).to.equal(placementId, 'Escrow placement ID does not match');
            });

            it('prevents double release', () =>
              expect(escrow.release(idr, idv, scopeRequestId, { from: platform })).to.be.rejected);
          });
        });
      });

      describe('after escrow timeout', () => {
        beforeEach('Simulate timeout', async () => {
          await escrow.setTimeoutThreshold(1);
          await mineBlock();
        });

        it('reverts', () => expect(escrow.release(idr, idv, scopeRequestId, { from: platform })).to.be.rejected);

        describe('when escrow was refunded', () => {
          beforeEach('Refund escrow', () => escrow.refund(idr, idv, scopeRequestId, { from: platform }));
          it('reverts', () => expect(escrow.release(idr, idv, scopeRequestId, { from: platform })).to.be.rejected);
        });
      });
    });
  });

  describe('Release Batch', () => {
    const placementId = calculatePlacementId(idr, idv, scopeRequestIdBatch);
    describe('when escrow batch is not placed', () => {
      it('reverts', () =>
        expect(escrow.releaseBatch(idr, idv, scopeRequestIdBatch, [], { from: platform })).to.be.rejected);
    });

    describe('when escrow batch was placed', async () => {
      beforeEach('Place escrow batch ', () =>
        placeEscrowBatch(idv, scopeRequestIdBatch, batchAmount, credentialItemIds, { from: idr })
      );

      describe('when the contract is paused', () => {
        beforeEach('Pause contract', () => escrow.pause({ from: platform }));
        it('reverts', () =>
          expect(escrow.releaseBatch(idr, idv, scopeRequestIdBatch, [], { from: platform })).to.be.rejected);
      });

      describe('before escrow timeout', () => {
        // Test release with different platform fee rates applied.
        const rates = [
          { name: '0', rate: 0 },
          { name: '25', rate: 2.5e7 },
          { name: '33.(3)', rate: 3.3333333e7 },
          { name: '100', rate: 1e8 }
        ];

        rates.forEach(({ name, rate }) => {
          describe(`when platform fee rate is ${name}%`, () => {
            let balanceChanges;
            let releaseLogs;

            beforeEach(`Set platform fee rate ${name}%`, async () => {
              await escrow.setFeeRate(rate);
              // verify rate changed
              expect((await escrow.platformFeeRate()).toNumber()).to.equal(rate);
            });

            describe('full release', () => {
              let platformFee;
              let idvFee;
              beforeEach('Calculate fees', async () => {
                platformFee = (await escrow.calculatePlatformFee(batchAmount)).toNumber();
                idvFee = batchAmount - platformFee;
              });

              beforeEach('Release escrow batch & get balance changes', async () => {
                const balances = await getBalances([idr, escrow.address, platform, idv]);
                releaseLogs = (await escrow.releaseBatch(idr, idv, scopeRequestIdBatch, [], { from: platform })).logs;
                balanceChanges = await getBalanceChanges(balances);
              });

              it('correctly updates balances', async () => {
                assertBalanceChange(balanceChanges, idr, 0);
                assertBalanceChange(balanceChanges, escrow.address, -batchAmount);
                assertBalanceChange(balanceChanges, idv, +idvFee);
                assertBalanceChange(balanceChanges, platform, +platformFee);
              });

              it(`emits ${EVENT_ESCROW_RELEASED} event`, async () => {
                const events = releaseLogs.filter(e => e.event === EVENT_ESCROW_RELEASED);
                expect(events).to.be.lengthOf(batchSize);
                const platformFeePerItem = new Bn(platformFee)
                  .div(batchSize)
                  .floor()
                  .toNumber();
                const idvFeePerItem = new Bn(idvFee)
                  .div(batchSize)
                  .floor()
                  .toNumber();

                events.forEach((event, i) => {
                  expect(event.args.idr).to.equal(idr, 'Requestor address does not match');
                  expect(event.args.idv).to.equal(idv, 'IDV address does not match');
                  expect(event.args.scopeRequestId).to.equal(scopeRequestIdBatch[i], 'ScopeRequest ID does not match');
                  expect(event.args.credentialItemIds).to.deep.equal(
                    credentialItemIds,
                    'CredentialItems does not match'
                  );
                  expect(event.args.platformFee.toNumber()).to.equal(platformFeePerItem, 'Platform Fee does not match');
                  expect(event.args.idvFee.toNumber()).to.equal(idvFeePerItem, 'IDV Fee does not match');
                  expect(event.args.placementId).to.equal(placementId, 'Escrow placement ID does not match');
                });
              });

              it(`does not emits ${EVENT_ESCROW_MOVED} event`, async () => {
                const events = releaseLogs.filter(e => e.event === EVENT_ESCROW_MOVED);
                expect(events).to.be.lengthOf(0);
              });

              it('prevents double release', () =>
                expect(escrow.releaseBatch(idr, idv, scopeRequestIdBatch, [], { from: platform })).to.be.rejected);
            });

            describe('partial release', () => {
              const batchHalf = _.sampleSize(scopeRequestIdBatch, Math.floor(batchSize / 2));
              const partials = [
                {
                  name: `half of the batch in random order`,
                  itemsToRelease: batchHalf,
                  itemsToKeep: _.difference(scopeRequestIdBatch, batchHalf)
                },
                {
                  name: 'first item',
                  itemsToRelease: scopeRequestIdBatch.slice(0, 1),
                  itemsToKeep: scopeRequestIdBatch.slice(1)
                },
                {
                  name: 'last item',
                  itemsToRelease: scopeRequestIdBatch.slice(batchSize - 1),
                  itemsToKeep: scopeRequestIdBatch.slice(0, batchSize - 1)
                }
              ];
              // eslint-disable-next-line no-shadow
              partials.forEach(({ name, itemsToRelease, itemsToKeep }) => {
                let releasedAmount;
                let platformFee;
                let idvFee;

                beforeEach('Calculate fees', async () => {
                  releasedAmount = new Bn(amount).mul(itemsToRelease.length).toNumber();
                  platformFee = (await escrow.calculatePlatformFee(releasedAmount)).toNumber();
                  idvFee = releasedAmount - platformFee;
                });

                describe(`when ${name} released`, () => {
                  beforeEach(`Release ${name} & get balance changes`, async () => {
                    const balances = await getBalances([idr, escrow.address, platform, idv]);
                    releaseLogs = (await escrow.releaseBatch(idr, idv, itemsToRelease, itemsToKeep, {
                      from: platform
                    })).logs;
                    balanceChanges = await getBalanceChanges(balances);
                  });

                  it('correctly updates balances', async () => {
                    assertBalanceChange(balanceChanges, idr, 0);
                    assertBalanceChange(balanceChanges, escrow.address, -releasedAmount);
                    assertBalanceChange(balanceChanges, idv, +idvFee);
                    assertBalanceChange(balanceChanges, platform, +platformFee);
                  });

                  it(`emits ${EVENT_ESCROW_RELEASED} event`, async () => {
                    const events = releaseLogs.filter(e => e.event === EVENT_ESCROW_RELEASED);
                    expect(events).to.be.lengthOf(itemsToRelease.length);
                    const platformFeePerItem = new Bn(platformFee)
                      .div(itemsToRelease.length)
                      .floor()
                      .toNumber();
                    const idvFeePerItem = new Bn(idvFee)
                      .div(itemsToRelease.length)
                      .floor()
                      .toNumber();

                    events.forEach((event, i) => {
                      expect(event.args.idr).to.equal(idr, 'Requestor address does not match');
                      expect(event.args.idv).to.equal(idv, 'IDV address does not match');
                      expect(event.args.scopeRequestId).to.equal(itemsToRelease[i], 'ScopeRequest ID does not match');
                      expect(event.args.credentialItemIds).to.deep.equal(
                        credentialItemIds,
                        'CredentialItems does not match'
                      );
                      expect(event.args.platformFee.toNumber()).to.equal(
                        platformFeePerItem,
                        'Platform Fee does not match'
                      );
                      expect(event.args.idvFee.toNumber()).to.equal(idvFeePerItem, 'IDV Fee does not match');
                      expect(event.args.placementId).to.equal(placementId, 'Escrow placement ID does not match');
                    });
                  });

                  it(`emits ${EVENT_ESCROW_MOVED} event`, async () => {
                    const newPlacementId = calculatePlacementId(idr, idv, itemsToKeep);
                    const events = releaseLogs.filter(e => e.event === EVENT_ESCROW_MOVED);
                    expect(events).to.be.lengthOf(itemsToKeep.length);
                    events.forEach((event, i) => {
                      expect(event.args.idr).to.equal(idr, 'Requestor address does not match');
                      expect(event.args.idv).to.equal(idv, 'IDV address does not match');
                      expect(event.args.scopeRequestId).to.equal(itemsToKeep[i], 'ScopeRequest ID does not match');
                      expect(event.args.credentialItemIds).to.deep.equal(
                        credentialItemIds,
                        'CredentialItems does not match'
                      );
                      expect(event.args.amount.toNumber()).to.equal(amount, 'Escrow amount does not match');
                      expect(event.args.oldPlacementId).to.equal(placementId, 'Escrow old placement ID does not match');
                      expect(event.args.placementId).to.equal(newPlacementId, 'Escrow placement ID does not match');
                    });
                  });
                });
              });
            });
          });
        });
      });

      describe('after escrow timeout', () => {
        beforeEach('Simulate timeout', async () => {
          await escrow.setTimeoutThreshold(1);
          await mineBlock();
        });

        it('reverts', () =>
          expect(escrow.releaseBatch(idr, idv, scopeRequestIdBatch, [], { from: platform })).to.be.rejected);

        describe('when escrow batch was refunded', () => {
          beforeEach('Refund escrow batch', () =>
            escrow.refundBatch(idr, idv, scopeRequestIdBatch, { from: platform })
          );
          it('reverts', () =>
            expect(escrow.releaseBatch(idr, idv, scopeRequestIdBatch, [], { from: platform })).to.be.rejected);
        });
      });
    });
  });

  describe('Refund', () => {
    const placementId = calculatePlacementId(idr, idv, [scopeRequestId]);
    describe('when escrow is not placed', () => {
      it('reverts', () => expect(escrow.refund(idr, idv, scopeRequestId, { from: platform })).to.be.rejected);
    });

    describe('when escrow was placed', async () => {
      beforeEach('Place escrow', () => placeEscrow(idv, scopeRequestId, amount, credentialItemIds, { from: idr }));

      describe('when the contract is paused', () => {
        beforeEach('Pause contract', () => escrow.pause({ from: platform }));
        it('reverts', () => expect(escrow.refund(idr, idv, scopeRequestId, { from: platform })).to.be.rejected);
      });

      describe('before escrow timeout', () => {
        it('reverts', () => expect(escrow.refund(idr, idv, scopeRequestId, { from: platform })).to.be.rejected);

        describe('when escrow was released', () => {
          beforeEach('Release escrow', () => escrow.release(idr, idv, scopeRequestId, { from: platform }));
          it('reverts', () => expect(escrow.refund(idr, idv, scopeRequestId, { from: platform })).to.be.rejected);
        });
      });

      describe('after escrow timeout', () => {
        let balanceChanges;
        let refundLogs;
        const initiators = [{ name: 'IDR', address: idr }, { name: 'Platform', address: platform }];

        beforeEach('Simulate timeout', async () => {
          await escrow.setTimeoutThreshold(1);
          await mineBlock();
        });

        initiators.forEach(({ name, address }) => {
          const from = address;
          describe(`when refund initiated by ${name}`, () => {
            beforeEach('Refund escrow & and get balance changes', async () => {
              const balances = await getBalances([idr, escrow.address, platform, idv]);
              refundLogs = (await escrow.refund(idr, idv, scopeRequestId, { from })).logs;
              balanceChanges = await getBalanceChanges(balances);
            });

            it('correctly updates balances', async () => {
              assertBalanceChange(balanceChanges, idr, +amount);
              assertBalanceChange(balanceChanges, escrow.address, -amount);
              assertBalanceChange(balanceChanges, idv, 0);
              assertBalanceChange(balanceChanges, platform, 0);
            });

            it(`emits ${EVENT_ESCROW_REFUNDED} event`, async () => {
              const events = refundLogs.filter(e => e.event === EVENT_ESCROW_REFUNDED);
              expect(events).to.be.lengthOf(1);
              const [event] = events;
              expect(event.args.idr).to.equal(idr, 'Requestor address does not match');
              expect(event.args.idv).to.equal(idv, 'IDV address does not match');
              expect(event.args.scopeRequestId).to.equal(scopeRequestId, 'ScopeRequest ID does not match');
              expect(event.args.credentialItemIds).to.deep.equal(credentialItemIds, 'CredentialItems does not match');
              expect(event.args.amount.toNumber()).to.equal(amount, 'Escrow amount does not match');
              expect(event.args.placementId).to.equal(placementId, 'Escrow placement ID does not match');
            });

            it('prevents double refund', () =>
              expect(escrow.refund(idr, idv, scopeRequestId, { from })).to.be.rejected);
          });
        });
      });
    });
  });

  describe('Refund Batch', () => {
    const placementId = calculatePlacementId(idr, idv, scopeRequestIdBatch);
    describe('when escrow batch is not placed', () => {
      it('reverts', () => expect(escrow.refundBatch(idr, idv, scopeRequestIdBatch, { from: platform })).to.be.rejected);
    });

    describe('when escrow batch was placed', async () => {
      beforeEach('Place escrow batch', () =>
        placeEscrowBatch(idv, scopeRequestIdBatch, batchAmount, credentialItemIds, { from: idr })
      );

      describe('when the contract is paused', () => {
        beforeEach('Pause contract', () => escrow.pause({ from: platform }));
        it('reverts', () =>
          expect(escrow.refundBatch(idr, idv, scopeRequestIdBatch, { from: platform })).to.be.rejected);
      });

      describe('before escrow timeout', () => {
        it('reverts', () =>
          expect(escrow.refundBatch(idr, idv, scopeRequestIdBatch, { from: platform })).to.be.rejected);

        describe('when escrow batch was released', () => {
          beforeEach('Release escrow batch', () =>
            escrow.releaseBatch(idr, idv, scopeRequestIdBatch, [], { from: platform })
          );
          it('reverts', () =>
            expect(escrow.refundBatch(idr, idv, scopeRequestIdBatch, { from: platform })).to.be.rejected);
        });
      });

      describe('after escrow timeout', () => {
        let balanceChanges;
        let refundLogs;
        const initiators = [{ name: 'IDR', address: idr }, { name: 'Platform', address: platform }];

        beforeEach('Simulate timeout', async () => {
          await escrow.setTimeoutThreshold(1);
          await mineBlock();
        });

        initiators.forEach(({ name, address }) => {
          const from = address;
          describe(`when refund initiated by ${name}`, () => {
            beforeEach('Refund escrow & and get balance changes', async () => {
              const balances = await getBalances([idr, escrow.address, platform, idv]);
              refundLogs = (await escrow.refundBatch(idr, idv, scopeRequestIdBatch, { from })).logs;
              balanceChanges = await getBalanceChanges(balances);
            });

            it('correctly updates balances', async () => {
              assertBalanceChange(balanceChanges, idr, +batchAmount);
              assertBalanceChange(balanceChanges, escrow.address, -batchAmount);
              assertBalanceChange(balanceChanges, idv, 0);
              assertBalanceChange(balanceChanges, platform, 0);
            });

            it(`emits ${EVENT_ESCROW_REFUNDED} event`, async () => {
              const events = refundLogs.filter(e => e.event === EVENT_ESCROW_REFUNDED);
              expect(events).to.be.lengthOf(batchSize);
              events.forEach((event, i) => {
                expect(event.args.idr).to.equal(idr, 'Requestor address does not match');
                expect(event.args.idv).to.equal(idv, 'IDV address does not match');
                expect(event.args.scopeRequestId).to.equal(scopeRequestIdBatch[i], 'ScopeRequest ID does not match');
                expect(event.args.credentialItemIds).to.deep.equal(credentialItemIds, 'CredentialItems does not match');
                expect(event.args.amount.toNumber()).to.equal(amount, 'Escrow amount does not match');
                expect(event.args.placementId).to.equal(placementId, 'Escrow placement ID does not match');
              });
            });

            it('prevents double refund', () =>
              expect(escrow.refundBatch(idr, idv, scopeRequestIdBatch, { from })).to.be.rejected);
          });
        });
      });
    });
  });

  describe('Timeout threshold', () => {
    const [owner, stranger] = accounts;
    const defaultEscrowTimeout = 5800;
    const newTimeout = 500;

    it('should have default timeout threshold', async () => {
      const timeout = await escrow.timeoutThreshold();
      expect(timeout.toNumber()).to.equal(defaultEscrowTimeout);
    });

    describe('when timeout setter called by owner', () => {
      it('updates timeout threshold', async () => {
        await escrow.setTimeoutThreshold(newTimeout, { from: owner });
        const timeout = await escrow.timeoutThreshold();
        expect(timeout.toNumber()).to.equal(newTimeout);
      });
    });

    describe('when timeout setter called by stranger', () => {
      it('reverts', async () => {
        await expect(escrow.setTimeoutThreshold(newTimeout, { from: stranger })).to.be.rejected;
        const timeout = await escrow.timeoutThreshold();
        expect(timeout.toNumber()).to.equal(defaultEscrowTimeout);
      });
    });
  });

  describe('Platform Fee Rate', async () => {
    const [owner, stranger] = accounts;
    const defaultFeeRate = 1e7;
    const ratePrecision = 1e8;

    it('has default fee rate', async () => {
      const platformFeeRate = await escrow.platformFeeRate();
      const feeRatePrecision = await escrow.RATE_PRECISION();
      expect(platformFeeRate.toNumber()).to.equal(defaultFeeRate);
      expect(feeRatePrecision.toNumber()).to.equal(ratePrecision);

      const expectedRate = new Bn(0.1); // 10%
      expect(platformFeeRate.div(feeRatePrecision).eq(expectedRate)).to.equal(true);
      expect((await escrow.calculatePlatformFee(100)).toNumber()).to.equal(10);
    });

    describe('when platform fee rate setter called by stranger', () => {
      it('reverts', async () => {
        await expect(escrow.setFeeRate(2e7, { from: stranger })).to.be.rejected;
        expect((await escrow.platformFeeRate()).toNumber()).to.equal(1e7);
      });
    });

    describe('when fee rate setter called by owner', () => {
      // Dynamic conditions:
      const tests = [
        { name: '33.(3)', rate: 3.3333333e7, amount: 100000, fee: 33333 },
        { name: '0', rate: 0, amount: 100000, fee: 0 },
        { name: '100', rate: 1e8, amount: 100000, fee: 100000 }
      ];
      // eslint-disable-next-line no-shadow
      tests.forEach(({ name, rate, amount, fee }) => {
        it(`sets ${name}% fee rate`, async () => {
          await escrow.setFeeRate(rate, { from: owner });
          expect((await escrow.platformFeeRate()).toNumber()).to.equal(rate);
          expect((await escrow.calculatePlatformFee(amount)).toNumber()).to.equal(fee);
        });
      });

      describe('when fee rate outside of 0-100% range', () => {
        it('reverts ', async () => {
          // Try to set platform fee rate above 100%.
          await expect(escrow.setFeeRate(1e9, { from: owner })).to.be.rejected;
          // Try to set negative platform fee rate.
          await expect(escrow.setFeeRate(-1, { from: owner })).to.be.rejected;
        });
      });
    });
  });

  describe('Pausable', () => {
    const [owner, stranger] = accounts;

    it('is not paused by default', async () => expect(await escrow.paused()).to.be.false);

    describe('when pause called by stranger', () => {
      it('reverts', async () => {
        await expect(escrow.pause({ from: stranger })).to.be.rejected;
        expect(await escrow.paused()).to.be.false; // eslint-disable-line no-unused-expressions
      });
    });

    describe('when pause called by owner', () => {
      beforeEach('pause contract', async () => {
        await escrow.pause({ from: owner });
      });

      it('pauses contract', async () => expect(await escrow.paused()).to.be.true);

      describe('when paused', () => {
        describe('when unpause called by owner', () => {
          beforeEach('unpause contract', async () => {
            await escrow.unpause({ from: owner });
          });
          it('unpauses contract', async () => expect(await escrow.paused()).to.be.false);
        });

        describe('when unpause called by stranger', () => {
          it('reverts', async () => {
            await expect(escrow.unpause({ from: stranger })).to.be.rejected;
            expect(await escrow.paused()).to.be.true; // eslint-disable-line no-unused-expressions
          });
        });
      });
    });
  });

  describe('Placement ID', async () => {
    describe('when single scope request ID', () => {
      it('calculates correct placement ID', async () => {
        const placementId = await escrow.calculatePlacementId(idr, idv, [scopeRequestId]);
        expect(placementId).to.equal(calculatePlacementId(idr, idv, [scopeRequestId]));
      });
    });

    describe('when multiple scope request IDs', () => {
      it('calculates correct placement ID', async () => {
        const placementId = await escrow.calculatePlacementId(idr, idv, scopeRequestIdBatch);
        expect(placementId).to.equal(calculatePlacementId(idr, idv, scopeRequestIdBatch));
      });
    });
  });
});

// todo: consider implementing helpers for every state e.g. 'assertPlaced', 'assertReleased', 'assertRefunded'
function assertVerify(
  verify,
  expectedAmount,
  expectedState,
  expectedCredentialItems,
  expectedBlockConfirmations,
  expectedCanRefund
) {
  expect(verify)
    .to.be.an('array')
    .with.lengthOf(5);
  const [amount, state, credentialItems, blockConfirmations, canRefund] = verify;

  // assert escrow data
  expect(amount.toNumber()).to.equal(expectedAmount, 'Amount does not match');
  expect(state.toNumber()).to.equal(expectedState, 'State does not match');
  expect(credentialItems)
    .to.be.an('array')
    .with.lengthOf(expectedCredentialItems.length)
    .deep.equal(expectedCredentialItems);
  expect(blockConfirmations.toNumber()).to.be.at.least(expectedBlockConfirmations, 'Block confirmations do not match');
  expect(canRefund).to.equal(expectedCanRefund, 'Can refund does not match');
}

async function getBalances(addressList) {
  const balanceList = await Promise.all(addressList.map(address => token.balanceOf(address)));
  return _.zipObject(addressList, balanceList);
}

async function getBalanceChanges(balances) {
  const freshBalances = await getBalances(_.keys(balances));
  return _.mapValues(balances, (oldBalance, address) => freshBalances[address].sub(oldBalance).toNumber());
}

function assertBalanceChange(balances, address, delta) {
  expect(balances).to.have.own.property(address, delta, `Balance change for ${delta} at ${address} doesn't match`);
}

function generateScopeRequestId() {
  return `0x${crypto.randomBytes(32).toString('hex')}`;
}

function generateScopeRequestBatch(batchSize) {
  return _.range(batchSize).map(generateScopeRequestId);
}

function calculatePlacementId(idr, idv, scopeRequestIds) {
  const hexToBuffer = hex => Buffer.from(hex.substring(2), 'hex');
  const xor = (a, b) => Buffer.from(a.map((x, i) => x ^ b[i]));
  const batchRef = scopeRequestIds
    .map(x => web3.sha3(x, { encoding: 'hex' }))
    .map(hexToBuffer)
    .reduce(xor)
    .toString('hex');

  return web3.sha3(idr.substring(2) + idv.substring(2) + batchRef, { encoding: 'hex' });
}
