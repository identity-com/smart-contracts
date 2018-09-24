pragma solidity ^0.4.24;

import "./ImplementationStorage.sol";
import "openzeppelin-solidity/contracts/AddressUtils.sol";


/**
 * @title CvcProxy
 * @dev Transparent proxy with upgradeability functions and authorization control.
 */
contract CvcProxy is ImplementationStorage {

    /**
     * @dev Emitted when the implementation is upgraded.
     * @param implementation Address of the new implementation.
     */
    event Upgraded(address implementation);

    /**
     * @dev Emitted when the administration has been transferred.
     * @param previousAdmin Address of the previous admin.
     * @param newAdmin Address of the new admin.
     */
    event AdminChanged(address previousAdmin, address newAdmin);

    /**
     * @dev Storage slot with the admin of the contract.
     * This is the keccak-256 hash of "cvc.proxy.admin", and is validated in the constructor.
     */
    bytes32 private constant ADMIN_SLOT = 0x2bbac3e52eee27be250d682577104e2abe776c40160cd3167b24633933100433;

    /**
     * @dev Modifier to check whether the `msg.sender` is the admin.
     * It executes the function if called by admin. Otherwise, it will delegate the call to the implementation.
     */
    modifier ifAdmin() {
        if (msg.sender == currentAdmin()) {
            _;
        } else {
            delegate(implementation());
        }
    }

    /**
     * Contract constructor.
     * It sets the `msg.sender` as the proxy admin.
     */
    constructor() public {
        assert(ADMIN_SLOT == keccak256("cvc.proxy.admin"));
        setAdmin(msg.sender);
    }

    /**
     * @dev Fallback function.
     */
    function() external payable {
        require(msg.sender != currentAdmin(), "Message sender is not contract admin");
        delegate(implementation());
    }

    /**
     * @dev Changes the admin of the proxy.
     * Only the current admin can call this function.
     * @param _newAdmin Address to transfer proxy administration to.
     */
    function changeAdmin(address _newAdmin) external ifAdmin {
        require(_newAdmin != address(0), "Cannot change contract admin to zero address");
        emit AdminChanged(currentAdmin(), _newAdmin);
        setAdmin(_newAdmin);
    }

    /**
     * @dev Allows the proxy owner to upgrade the current version of the proxy.
     * @param _implementation the address of the new implementation to be set.
     */
    function upgradeTo(address _implementation) external ifAdmin {
        upgradeImplementation(_implementation);
    }

    /**
     * @dev Allows the proxy owner to upgrade and call the new implementation
     * to initialize whatever is needed through a low level call.
     * @param _implementation the address of the new implementation to be set.
     * @param _data the msg.data to bet sent in the low level call. This parameter may include the function
     * signature of the implementation to be called with the needed payload.
     */
    function upgradeToAndCall(address _implementation, bytes _data) external payable ifAdmin {
        upgradeImplementation(_implementation);
        //solium-disable-next-line security/no-call-value
        require(address(this).call.value(msg.value)(_data), "Upgrade error: initialization method call failed");
    }

    /**
     * @dev Returns the Address of the proxy admin.
     * @return address
     */
    function admin() external view ifAdmin returns (address) {
        return currentAdmin();
    }

    /**
     * @dev Upgrades the implementation address.
     * @param _newImplementation the address of the new implementation to be set
     */
    function upgradeImplementation(address _newImplementation) private {
        address currentImplementation = implementation();
        require(currentImplementation != _newImplementation, "Upgrade error: proxy contract already uses specified implementation");
        setImplementation(_newImplementation);
        emit Upgraded(_newImplementation);
    }

    /**
     * @dev Delegates execution to an implementation contract.
     * This is a low level function that doesn't return to its internal call site.
     * It will return to the external caller whatever the implementation returns.
     * @param _implementation Address to delegate.
     */
    function delegate(address _implementation) private {
        assembly {
            // Copy msg.data.
            calldatacopy(0, 0, calldatasize)

            // Call current implementation passing proxy calldata.
            let result := delegatecall(gas, _implementation, 0, calldatasize, 0, 0)

            // Copy the returned data.
            returndatacopy(0, 0, returndatasize)

            // Propagate result (delegatecall returns 0 on error).
            switch result
            case 0 {revert(0, returndatasize)}
            default {return (0, returndatasize)}
        }
    }

    /**
     * @return The admin slot.
     */
    function currentAdmin() private view returns (address proxyAdmin) {
        bytes32 slot = ADMIN_SLOT;
        assembly {
            proxyAdmin := sload(slot)
        }
    }

    /**
     * @dev Sets the address of the proxy admin.
     * @param _newAdmin Address of the new proxy admin.
     */
    function setAdmin(address _newAdmin) private {
        bytes32 slot = ADMIN_SLOT;
        assembly {
            sstore(slot, _newAdmin)
        }
    }

    /**
     * @dev Sets the implementation address of the proxy.
     * @param _newImplementation Address of the new implementation.
     */
    function setImplementation(address _newImplementation) private {
        require(
            AddressUtils.isContract(_newImplementation),
            "Cannot set new implementation: no contract code at contract address"
        );
        bytes32 slot = IMPLEMENTATION_SLOT;
        assembly {
            sstore(slot, _newImplementation)
        }
    }

}
