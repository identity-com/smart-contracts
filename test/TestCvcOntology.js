// `artifacts.require` helper introduced by Truffle
const CvcOntology = artifacts.require('CvcOntology');
const chai = require('chai');
chai.use(require('chai-as-promised'));

const OntologyAccessor = artifacts.require('stubs/OntologyAccessor');
const { expect } = chai;

// Disabling no-undef because of `contract` helper introduced by Truffle
// eslint-disable-next-line no-undef
contract('CvcOntology', accounts => {
  const [admin] = accounts;
  const gas = 6000000;
  let ontology;
  let ontologyAccessor;
  const type = 'credential';
  const name = 'proofOfIdentity';
  const version = 'v1.0';
  const reference = 'https://www.identity.com/';
  const referenceType = 'JSON-LD-Context';
  const referenceHash = '0x2cd9bf92c5e20b1b410f5ace94d963a96e89156fbe65b70365e8596b37f1f165';

  beforeEach('Get the fresh Ontology contract instance', async () => {
    ontology = await CvcOntology.new({ gas });
  });

  describe('get record', () => {
    beforeEach('add default proofOfIdentity', () =>
      ontology.add(type, name, version, reference, referenceType, referenceHash)
    );

    it('get by Type-Name-Version', async () => {
      const result = await ontology.getByTypeNameVersion(type, name, version);
      assertRecord(result, type, name, version);
    });

    it('get non existing', async () => {
      const result = await ontology.getById('0x0000000000000000000000000100000000000000000000000000000000000000');
      assertIsEmpty(result);
    });

    it('get all ids', async () => {
      const result = await ontology.getAllIds();
      expect(result)
        .to.be.an('array')
        .with.lengthOf(1);
      const [id] = result;
      assertNonEmptyHash(id);
    });

    it('get by id', async () => {
      const [id] = await ontology.getAllIds();
      const result = await ontology.getById(id);
      assertRecord(result, type, name, version);
    });

    describe('get all via stub contract', () => {
      beforeEach(async () => {
        ontologyAccessor = await OntologyAccessor.new(ontology.address, { from: admin });
      });

      it('returns all records', async () => {
        const ids = await ontology.getAllIds();
        await Promise.all(
          ids.map(async (id, i) => {
            const ontologyRecord = await ontologyAccessor.getOne(i);
            expect(ontologyRecord[0]).to.equal(id);
          })
        );
      });
    });
  });

  describe('add new records', () => {
    describe('denies empty parameters', () => {
      it('empty type', () =>
        expect(ontology.add('', name, version, reference, referenceType, referenceHash)).to.be.rejected);
      it('empty name', () =>
        expect(ontology.add(type, '', version, reference, referenceType, referenceHash)).to.be.rejected);
      it('empty version', () =>
        expect(ontology.add(type, name, '', reference, referenceType, referenceHash)).to.be.rejected);
      it('empty reference', () =>
        expect(ontology.add(type, name, version, '', referenceType, referenceHash)).to.be.rejected);
      it('empty referenceType', () =>
        expect(ontology.add(type, name, version, reference, '', referenceHash)).to.be.rejected);
      it('empty referenceHash', () =>
        expect(ontology.add(type, name, version, reference, referenceType, '')).to.be.rejected);
    });

    describe('accepts new claim', () => {
      beforeEach('add new claim', () => ontology.add('claim', 'age', 'v1.0', reference, referenceType, referenceHash));

      it('returns new claim', async () => {
        const record = await ontology.getByTypeNameVersion('claim', 'age', 'v1.0');
        assertRecord(record, 'claim', 'age', 'v1.0');
      });

      it('denies modifying existing record', () =>
        expect(ontology.add('claim', 'age', 'v1.0', reference, referenceType, referenceHash)).to.be.rejected);

      it('denies adding by stranger', () =>
        expect(
          ontology.add('claim', 'age', 'v1.0', reference, referenceType, referenceHash, {
            from: accounts[2]
          })
        ).to.be.rejected);
    });
  });

  describe('deprecate old records', () => {
    beforeEach('add default proofOfIdentity', () =>
      ontology.add(type, name, version, reference, referenceType, referenceHash)
    );

    describe('can deprecate', () => {
      before('assert it is not deprecated', async () => {
        const record = await ontology.getByTypeNameVersion(type, name, version);
        expect(record[7]).to.be.false; // eslint-disable-line no-unused-expressions
      });

      it('by external id', async () => {
        await ontology.deprecate(type, name, version);
        const record = await ontology.getByTypeNameVersion(type, name, version);
        assertRecord(record, type, name, version);
        expect(record[7]).to.be.true; // eslint-disable-line no-unused-expressions
      });

      it('by internal id', async () => {
        const freshRecord = await ontology.getByTypeNameVersion(type, name, version);
        await ontology.deprecateById(freshRecord[0]);
        const deprecatedRecord = await ontology.getByTypeNameVersion(type, name, version);
        assertRecord(deprecatedRecord, type, name, version);
        expect(deprecatedRecord[7]).to.be.true; // eslint-disable-line no-unused-expressions
      });
    });

    describe('denies deprecating', () => {
      describe('by stranger', () => {
        it('by external id', () =>
          expect(ontology.deprecate(type, name, version, { from: accounts[2] })).to.be.rejected);

        it('by internal id', async () => {
          const [id] = await ontology.getByTypeNameVersion(type, name, version);
          await expect(ontology.deprecateById(id, { from: accounts[2] })).to.be.rejected;
        });
      });

      describe('more than once', () => {
        beforeEach('deprecate default record', () => ontology.deprecate(type, name, version));

        it('fails to deprecate', () => expect(ontology.deprecate(type, name, version)).to.be.rejected);
      });

      describe('non-existing record', () => {
        it('fails to deprecate', () => expect(ontology.deprecate('some', 'random', 'record')).to.be.rejected);
      });
    });
  });
});

function assertIsEmpty(record) {
  expect(record)
    .to.be.an('array')
    .with.lengthOf(8);
  const [id, type, name, version, reference, referenceType, referenceHash, deprecated] = record;
  expect(id).to.match(/0x0{64}/);
  expect(type).to.equal('');
  expect(name).to.equal('');
  expect(version).to.equal('');
  expect(reference).to.equal('');
  expect(referenceType).to.equal('');
  expect(referenceHash).to.match(/0x0{64}/);
  expect(deprecated).to.be.false; // eslint-disable-line no-unused-expressions
}

function assertRecord(record, expectedType, expectedName, expectedVersion) {
  expect(record)
    .to.be.an('array')
    .with.lengthOf(8);
  const [id, type, name, version, reference, referenceType, referenceHash, deprecated] = record;
  assertNonEmptyHash(id);
  expect(type).to.equal(expectedType);
  expect(name).to.equal(expectedName);
  expect(version).to.equal(expectedVersion);
  expect(reference).to.equal('https://www.identity.com/');
  expect(referenceType).to.equal('JSON-LD-Context');
  assertNonEmptyHash(referenceHash);
  expect(deprecated).to.be.a('boolean');
}

function assertNonEmptyHash(bytes32string) {
  return expect(bytes32string)
    .to.match(/^0x[0-f]{64}$/, 'Value is not bytes32 hex string')
    .to.not.match(/0x0{64}/, 'Empty value');
}
