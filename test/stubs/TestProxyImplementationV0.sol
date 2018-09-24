pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./Ownable.sol";


/**
 * @title TestProxyImplementationV0
 * @dev Version 0 of a generic contract to show upgradeability.
 */
contract TestProxyImplementationV0 is Ownable {

    using SafeMath for uint256;

    uint256 internal _intValue;
    bool internal _initialized;

    function initialize(address owner) public {
        require(!_initialized);
        setOwner(owner);
        _initialized = true;
    }

    function getIntValue() public view returns (uint256) {
        return _intValue;
    }

    function setIntValue(uint256 value) public onlyOwner returns (uint256) {
        _intValue = value;
        return _intValue;
    }
}
