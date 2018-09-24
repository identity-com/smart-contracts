pragma solidity ^0.4.24;

import "./CvcProxy.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/AddressUtils.sol";

/**
* @title CvcMigrator
* @dev This is a system contract which provides transactional upgrade functionality.
* It allows the ability to add 'upgrade transactions' for multiple proxy contracts and execute all of them in single transaction.
*/
contract CvcMigrator is Ownable {

    /**
    * @dev The ProxyCreated event is emitted when new instance of CvcProxy contract is deployed.
    * @param proxyAddress New proxy contract instance address.
    */
    event ProxyCreated(address indexed proxyAddress);

    struct Migration {
        address proxy;
        address implementation;
        bytes data;
    }

    /// List of registered upgrades.
    Migration[] public migrations;

    /**
    * @dev Store migration record for the next migration
    * @param _proxy Proxy address
    * @param _implementation Implementation address
    * @param _data Pass-through to proxy's updateToAndCall
    */
    function addUpgrade(address _proxy, address _implementation, bytes _data) external onlyOwner {
        require(AddressUtils.isContract(_implementation), "Migrator error: no contract code at new implementation address");
        require(CvcProxy(_proxy).implementation() != _implementation, "Migrator error: proxy contract already uses specified implementation");
        migrations.push(Migration(_proxy, _implementation, _data));
    }

    /**
    * @dev Applies stored upgrades to proxies. Flushes the list of migration records
    */
    function migrate() external onlyOwner {
        for (uint256 i = 0; i < migrations.length; i++) {
            Migration storage migration = migrations[i];
            if (migration.data.length > 0) {
                CvcProxy(migration.proxy).upgradeToAndCall(migration.implementation, migration.data);
            } else {
                CvcProxy(migration.proxy).upgradeTo(migration.implementation);
            }
        }
        delete migrations;
    }

    /**
    * @dev Flushes the migration list without applying them. Can be used in case wrong migration added to the list.
    */
    function reset() external onlyOwner {
        delete migrations;
    }

    /**
    * @dev Transfers ownership from the migrator to a new address
    * @param _target Proxy address
    * @param _newOwner New proxy owner address
    */
    function changeProxyAdmin(address _target, address _newOwner) external onlyOwner {
        CvcProxy(_target).changeAdmin(_newOwner);
    }

    /**
    * @dev Proxy factory
    * @return CvcProxy
    */
    function createProxy() external onlyOwner returns (CvcProxy) {
        CvcProxy proxy = new CvcProxy();
        // We emit event here to retrieve contract address later in the tx receipt
        emit ProxyCreated(address(proxy));
        return proxy;
    }

    /**
    * @dev Returns migration record by index. Will become obsolete as soon as migrations() will be usable via web3.js
    * @param _index 0-based index
    * @return address Proxy address
    * @return address Implementation address
    * @return bytes Pass-through to proxy's updateToAndCall
    */
    function getMigration(uint256 _index) external view returns (address, address, bytes) {
        return (migrations[_index].proxy, migrations[_index].implementation, migrations[_index].data);
    }

    /**
    * @dev Returns current stored migration count
    * @return uint256 Count
    */
    function getMigrationCount() external view returns (uint256) {
        return migrations.length;
    }

}
