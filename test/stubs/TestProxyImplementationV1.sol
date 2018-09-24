pragma solidity ^0.4.24;

import "./TestProxyImplementationV0.sol";


/**
 * @title TestProxyImplementationV1
 * @dev Version 1 of a generic contract to show upgradeability.
 */
contract TestProxyImplementationV1 is TestProxyImplementationV0 {

    function addIntValue(uint256 value) public onlyOwner returns (uint256) {
        _intValue = _intValue.add(value);
        return _intValue;
    }

}
