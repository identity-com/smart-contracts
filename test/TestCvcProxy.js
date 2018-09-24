/* eslint-disable no-unused-expressions */
const chai = require('chai');
chai.use(require('chai-as-promised'));
chai.use(require('chai-bignumber')());
const ethUtil = require('ethereumjs-util');
const Web3 = require('web3');
const encodeCall = require('./helpers/encodeCall');

const CvcProxy = artifacts.require('CvcProxy');
const DummyImplementation = artifacts.require('stubs/DummyImplementation');
const DummyImplementationV2 = artifacts.require('stubs/DummyImplementationV2');
const DummyImplementationV3 = artifacts.require('stubs/DummyImplementationV3');
const ClashingImplementation = artifacts.require('stubs/ClashingImplementation');

const { expect } = chai;

contract('CvcProxy', accounts => {
  const [proxyAdmin, anotherAccount] = accounts;
  let proxy;
  let implementationV1;
  let implementationV2;
  let implementationV3;

  const url = process.env.RSK_NODE_URL;
  const web3 = new Web3(new Web3.providers.HttpProvider(url));

  beforeEach('Deploy proxy', async () => {
    proxy = await CvcProxy.new({ from: proxyAdmin });
    implementationV1 = (await DummyImplementation.new()).address;
    await proxy.upgradeTo(implementationV1, { from: proxyAdmin });
  });

  it('has an admin', async () => expect(await proxy.admin()).equal(proxyAdmin));

  describe('changing admin', () => {
    describe('when the new proposed admin is the zero address', () => {
      it('reverts', async () => expect(proxy.changeAdmin(ethUtil.zeroAddress(), { from: proxyAdmin })).to.be.rejected);
    });

    describe('when the new proposed admin is not the zero address', () => {
      const newAdmin = anotherAccount;

      describe('when the sender is not admin', () => {
        it('reverts', async () => expect(proxy.changeAdmin(newAdmin, { from: anotherAccount })).to.be.rejected);
      });

      describe('when the sender is the admin', () => {
        it('stores the admin address in specified location', async () => {
          await proxy.changeAdmin(newAdmin, { from: proxyAdmin });
          const slot = web3.sha3('cvc.proxy.admin');
          const admin = await web3.eth.getStorageAt(proxy.address, slot);
          expect(admin).to.equal(newAdmin);
        });

        it('sets new admin', async () => {
          await proxy.changeAdmin(newAdmin, { from: proxyAdmin });
          expect(await proxy.admin({ from: newAdmin })).equal(newAdmin);
        });

        it('emits an event', async () => {
          const { logs } = await proxy.changeAdmin(newAdmin, { from: proxyAdmin });
          expect(logs).to.have.lengthOf(1);
          expect(logs[0].event).to.equal('AdminChanged');
          expect(logs[0].args.previousAdmin).to.equal(proxyAdmin);
          expect(logs[0].args.newAdmin).to.equal(newAdmin);
        });
      });
    });
  });

  describe('implementation', () => {
    it('stores the implementation address in specified location', async () => {
      const slot = web3.sha3('cvc.proxy.implementation');
      const implementation = (await web3.eth.getStorageAt(proxy.address, slot)).substr(2);
      expect(`0x${_.padStart(implementation, 40, '0')}`).to.equal(implementationV1);
    });

    it('returns current implementation', async () => {
      expect(await proxy.implementation()).to.equal(implementationV1);
    });

    it('delegates to the implementation', async () => {
      const implementation = DummyImplementation.at(proxy.address);
      const version = await implementation.version({ from: anotherAccount });
      expect(version).to.equal('V1');
    });
  });

  describe('upgradeTo', () => {
    beforeEach('Deploy new implementation', async () => {
      implementationV2 = (await DummyImplementationV2.new()).address;
    });

    describe('when the new implementation is not contract', () => {
      it('reverts', async () => expect(proxy.upgradeTo(anotherAccount, { from: proxyAdmin })).to.be.rejected);
    });

    describe('when the new implementation is zero address', () => {
      it('reverts', async () => expect(proxy.upgradeTo(ethUtil.zeroAddress(), { from: proxyAdmin })).to.be.rejected);
    });

    describe('when the new implementation has the same address', () => {
      it('reverts', async () => expect(proxy.upgradeTo(implementationV1, { from: proxyAdmin })).to.be.rejected);
    });

    describe('when the sender is not the proxy admin', () => {
      it('reverts', async () => expect(proxy.upgradeTo(implementationV2, { from: anotherAccount })).to.be.rejected);
    });

    describe('when the sender is the proxy admin', () => {
      const from = proxyAdmin;

      it('upgrades to the new implementation', async () => {
        await proxy.upgradeTo(implementationV2, { from });
        expect(await proxy.implementation()).to.equal(implementationV2);
        const implementation = DummyImplementationV2.at(proxy.address);
        const version = await implementation.version({ from: anotherAccount });
        expect(version).to.equal('V2');
      });

      it('emits an event', async () => {
        const { logs } = await proxy.upgradeTo(implementationV2, { from });
        expect(logs).to.have.lengthOf(1);
        expect(logs[0].event).to.equal('Upgraded');
        expect(logs[0].args.implementation).to.equal(implementationV2);
      });
    });
  });

  describe('upgradeToAndCall', () => {
    beforeEach('Deploy new implementation', async () => {
      implementationV2 = (await DummyImplementationV2.new()).address;
    });

    describe('when the call does fail', () => {
      const v2InitializeData = encodeCall('fail');
      it('reverts', async () =>
        expect(proxy.upgradeToAndCall(implementationV2, v2InitializeData, { from: proxyAdmin })).to.be.rejected);
    });

    describe('when the call does not fail', () => {
      const v2InitializeData = encodeCall('initialize', ['uint256'], [42]);
      describe('when the sender is not proxy admin', () => {
        it('reverts', async () =>
          expect(proxy.upgradeToAndCall(implementationV2, v2InitializeData, { from: anotherAccount })).to.be.rejected);
      });

      describe('when the sender is the proxy admin', () => {
        const from = proxyAdmin;

        describe('when the new implementation is not contract', () => {
          it('reverts', async () =>
            expect(proxy.upgradeToAndCall(anotherAccount, v2InitializeData, { from: proxyAdmin })).to.be.rejected);
        });

        describe('when the new implementation is zero address', () => {
          it('reverts', async () =>
            expect(proxy.upgradeToAndCall(ethUtil.zeroAddress(), v2InitializeData, { from: proxyAdmin })).to.be
              .rejected);
        });

        describe('when the new implementation has the same address', () => {
          it('reverts', async () =>
            expect(proxy.upgradeToAndCall(implementationV1, v2InitializeData, { from: proxyAdmin })).to.be.rejected);
        });

        describe('when upgrading to V2', () => {
          it('upgrades to the new implementation', async () => {
            await proxy.upgradeToAndCall(implementationV2, v2InitializeData, { from });
            expect(await proxy.implementation()).to.equal(implementationV2);
            const implementation = DummyImplementationV2.at(proxy.address);
            const version = await implementation.version({ from: anotherAccount });
            expect(version).to.equal('V2');
          });

          it('emits an event', async () => {
            const { logs } = await proxy.upgradeToAndCall(implementationV2, v2InitializeData, { from });
            expect(logs).to.have.lengthOf(1);
            expect(logs[0].event).to.equal('Upgraded');
            expect(logs[0].args.implementation).to.equal(implementationV2);
          });

          it('calls the "initialize" function', async () => {
            await proxy.upgradeToAndCall(implementationV2, v2InitializeData, { from });
            const implementation = DummyImplementationV2.at(proxy.address);
            const value = await implementation.value({ from: anotherAccount });
            expect(value).to.bignumber.equal(42);
          });

          it('sends given value to the proxy balance', async () => {
            const value = 1e8;
            await proxy.upgradeToAndCall(implementationV2, v2InitializeData, { from, value });
            const balance = await web3.eth.getBalance(proxy.address);
            expect(balance).to.bignumber.equal(value);
          });

          it('stores data in proxy context', async () => {
            await proxy.upgradeToAndCall(implementationV2, v2InitializeData, { from });
            const value = await web3.eth.getStorageAt(proxy.address, 0);
            expect(value).to.bignumber.equal(42);
          });
        });

        describe('when upgrading to V3', () => {
          const v3InitializeData = encodeCall('initialize', ['uint256'], [84]);
          beforeEach('Deploy new implementation', async () => {
            implementationV3 = (await DummyImplementationV3.new()).address;
          });

          it('upgrades to the new implementation', async () => {
            await proxy.upgradeToAndCall(implementationV3, v3InitializeData, { from });
            expect(await proxy.implementation()).to.equal(implementationV3);
            const implementation = DummyImplementationV3.at(proxy.address);
            const version = await implementation.version({ from: anotherAccount });
            expect(version).to.equal('V3');
          });

          it('emits an event', async () => {
            const { logs } = await proxy.upgradeToAndCall(implementationV3, v3InitializeData, { from });
            expect(logs).to.have.lengthOf(1);
            expect(logs[0].event).to.equal('Upgraded');
            expect(logs[0].args.implementation).to.equal(implementationV3);
          });

          it('calls the "initialize" function', async () => {
            await proxy.upgradeToAndCall(implementationV3, v3InitializeData, { from });
            const implementation = DummyImplementationV3.at(proxy.address);
            const value = await implementation.value({ from: anotherAccount });
            expect(value).to.bignumber.equal(84);
          });
        });
      });
    });
  });

  describe('transparent proxy', () => {
    let transparentProxy;
    let clashing;
    beforeEach('Deploy proxy with clashing implementation', async () => {
      transparentProxy = await CvcProxy.new({ from: proxyAdmin });
      const implementation = (await ClashingImplementation.new()).address;
      await transparentProxy.upgradeTo(implementation, { from: proxyAdmin });
      clashing = ClashingImplementation.at(transparentProxy.address);
    });

    describe('when proxy admin calls delegated function', async () => {
      it('reverts', async () => expect(clashing.delegatedFunction({ from: proxyAdmin })).to.be.rejected);
    });

    describe('when function names clash', () => {
      describe('when sender is proxy admin', () => {
        it('calls the proxy function', async () => {
          const value = await transparentProxy.admin({ from: proxyAdmin });
          expect(value).to.equal(proxyAdmin);
        });
      });

      describe('when sender is not proxy admin', () => {
        it('delegates to implementation', async () => {
          const value = await transparentProxy.admin({ from: anotherAccount });
          expect(value).to.equal('0x1111111111111111111111111111111111111111');
        });
      });
    });
  });
});
