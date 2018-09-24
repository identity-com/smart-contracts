// `artifacts.require` helper introduced by Truffle
const MigratorContract = artifacts.require('CvcMigrator');
const ProxyContract = artifacts.require('CvcProxy');
const ImplementationContract = artifacts.require('stubs/TestProxyImplementationV0');
const chai = require('chai');
const ethUtil = require('ethereumjs-util');
const encodeCall = require('./helpers/encodeCall');

chai.use(require('chai-as-promised'));
chai.use(require('chai-bignumber')());

const { expect } = chai;

// Disabling no-undef because of `contract` helper introduced by Truffle
// eslint-disable-next-line no-undef
contract('CvcMigrator', accounts => {
  const [admin, stranger] = accounts;
  let migrator;
  let proxy;
  let implementation;

  beforeEach('Get fresh migrator instance', async () => {
    migrator = await MigratorContract.new({ from: admin });
    proxy = await ProxyContract.new({ from: admin });
    implementation = await ImplementationContract.new({ from: admin });
    await proxy.changeAdmin(migrator.address, { from: admin });
  });

  describe('can transfer ownership', () => {
    beforeEach('admin is the owner of the migrator', async () => expect(await migrator.owner()).to.equal(admin));
    beforeEach('migrator is the admin of the proxy', async () =>
      expect(await proxy.admin({ from: migrator.address })).to.equal(migrator.address)
    );

    describe('by admin', () => {
      it('should transfer ownership back to admin', async () => {
        await migrator.changeProxyAdmin(proxy.address, admin, { from: admin });
        expect(await proxy.admin({ from: admin })).to.equal(admin, 'oops');
      });
    });

    describe('denied from stranger', () => {
      it('should revert', () =>
        expect(migrator.changeProxyAdmin(proxy.address, stranger, { from: stranger })).to.be.rejected);

      afterEach('migrator is still the owner of the proxy', async () =>
        expect(await proxy.admin({ from: migrator.address })).to.equal(migrator.address)
      );
    });
  });

  describe('when migrating', () => {
    beforeEach('assert current implementation is empty', async () =>
      expect(await proxy.implementation()).to.equal(ethUtil.zeroAddress())
    );

    it('saves upgrade in the list', async () => {
      await migrator.addUpgrade(proxy.address, implementation.address, '0xabcdef', { from: admin });
      expect(await migrator.getMigrationCount()).to.bignumber.equal(1);
      expect(await migrator.getMigration(0)).to.deep.equal([proxy.address, implementation.address, '0xabcdef']);
    });

    describe('with migration list', () => {
      describe('does upgrade', () => {
        beforeEach('setup migration list', () =>
          migrator.addUpgrade(proxy.address, implementation.address, '0x', { from: admin })
        );

        it('can upgradeTo', async () => {
          await migrator.migrate();
          expect(await migrator.getMigrationCount()).to.bignumber.equal(0);
          expect(await proxy.implementation()).to.equal(implementation.address);
        });
      });
      describe('does upgrade and initialize', () => {
        beforeEach('setup migration list with initialize', async () => {
          const initializeData = encodeCall('initialize', ['address'], [admin]);
          await migrator.addUpgrade(proxy.address, implementation.address, initializeData, { from: admin });
        });

        it('can upgradeToAndCall', async () => {
          await migrator.migrate();
          expect(await migrator.getMigrationCount()).to.bignumber.equal(0);
          expect(await proxy.implementation()).to.equal(implementation.address);
        });
      });

      describe('can reset', () => {
        beforeEach('setup migration list', () =>
          migrator.addUpgrade(proxy.address, implementation.address, '0x', { from: admin })
        );

        it('cleans the list', async () => {
          await migrator.reset({ from: admin });
          expect(await proxy.implementation()).to.equal(ethUtil.zeroAddress());
          expect(await migrator.getMigrationCount()).to.bignumber.equal(0);
        });

        describe('when called by stranger', () => {
          it('reverts when reset by stranger', () => expect(migrator.reset({ from: stranger })).to.be.rejected);

          afterEach('current implementation is unchanged', async () =>
            expect(await proxy.implementation()).to.equal(ethUtil.zeroAddress())
          );

          afterEach('migrations list is not empty', async () =>
            expect(await migrator.getMigrationCount()).to.bignumber.be.above(0)
          );
        });
      });
    });
  });

  describe('can create proxies', () => {
    it('deploys proxy', async () => {
      const { logs } = await migrator.createProxy();
      expect(logs)
        .to.be.an('array')
        .with.lengthOf(1);
      const [event] = logs;
      expect(event).to.have.property('event', 'ProxyCreated');
      expect(event).to.have.nested.property('args.proxyAddress');
      const freshProxy = ProxyContract.at(event.args.proxyAddress);
      expect(await freshProxy.admin({ from: migrator.address })).to.equal(migrator.address);
    });
  });
});
