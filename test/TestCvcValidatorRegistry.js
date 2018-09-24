// `artifacts.require` helper introduced by Truffle
const CvcValidatorRegistry = artifacts.require('CvcValidatorRegistry');
const chai = require('chai');
const ethUtil = require('ethereumjs-util');

const { expect } = chai;

// Disabling no-undef because of `contract` helper introduced by Truffle
// eslint-disable-next-line no-undef
contract('CvcValidatorRegistry', accounts => {
  const [admin, idv, anotherAccount] = accounts;

  const name = 'Test IDV';
  const description = 'IDV for testing';

  let registry;
  beforeEach('Get the Validator Registry contract deployed instance', async () => {
    registry = await CvcValidatorRegistry.new({ from: admin });
  });

  describe('Setting IDV entry data:', () => {
    describe('when the sender is not the registry owner', () => {
      const from = anotherAccount;
      it('reverts', () => expect(registry.set(idv, name, description, { from })).to.be.rejected);
    });

    describe('when the sender is the registry owner', () => {
      const from = admin;

      describe('when entry is new', () => {
        beforeEach(async () => expect(await registry.exists(idv)).to.be.false);

        it('adds new entry', async () => {
          await registry.set(idv, name, description, { from });
          const record = await registry.get(idv);
          assertRecord(record, name, description);
        });
      });

      describe('when existing entry', () => {
        beforeEach(() => registry.set(idv, name, description, { from }));

        it('updates the existing entry', async () => {
          const newName = `${name} Updated`;
          const newDescription = `${description} Updated`;
          await registry.set(idv, newName, newDescription, { from });
          const record = await registry.get(idv);
          assertRecord(record, newName, newDescription);
        });
      });

      describe('when IDV address is empty', () => {
        it('reverts', () => expect(registry.set(ethUtil.zeroAddress(), name, description, { from })).to.be.rejected);
      });

      describe('when IDV Name is empty', () => {
        it('reverts', () => expect(registry.set(idv, '', description, { from })).to.be.rejected);
      });
    });
  });

  describe('Getting IDV entry data:', () => {
    const from = admin;
    describe('when entry exists', () => {
      beforeEach(() => registry.set(idv, name, description, { from }));

      it('returns entry data', async () => {
        const record = await registry.get(idv);
        assertRecord(record, name, description);
      });
    });

    describe('when entry does not exist', () => {
      it('returns empty result', async () => {
        const record = await registry.get(ethUtil.zeroAddress());
        assertRecord(record, '', '');
      });
    });
  });

  describe('Verifying IDV entry existence:', () => {
    const from = admin;
    describe('when existing entry', () => {
      beforeEach(() => registry.set(idv, name, description, { from }));

      it('returns true', async () => expect(await registry.exists(idv)).to.be.true);
    });

    describe('when entry does not exist', () => {
      it('returns false', async () => expect(await registry.exists(idv)).to.be.false);
    });
  });
});

function assertRecord(record, expectedName, expectedDescription) {
  expect(record)
    .to.be.an('array')
    .with.lengthOf(2);
  const [name, description] = record;
  expect(name).to.equal(expectedName);
  expect(description).to.equal(expectedDescription);
}
