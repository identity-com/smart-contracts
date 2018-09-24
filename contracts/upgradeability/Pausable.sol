pragma solidity ^0.4.24;

import "./Ownable.sol";
import "./ImplementationStorage.sol";


/**
 * @title Pausable
 * @dev Base contract which allows children to implement an emergency stop mechanism.
 */
contract Pausable is Ownable, ImplementationStorage {

    /**
    Data structures and storage layout:
    mapping(bytes32 => bool) paused;
    **/

    event Pause();
    event Unpause();

    /**
     * @dev Modifier to make a function callable only when the contract is not paused.
     */
    modifier whenNotPaused() {
        require(!paused(), "Contract is paused");
        _;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is paused.
     */
    modifier whenPaused() {
        require(paused(), "Contract must be paused");
        _;
    }

    /**
     * @dev called by the owner to pause, triggers stopped state
     */
    function pause() public onlyOwner whenNotPaused {
        // paused[implementation()] = true;
        boolStorage[keccak256(abi.encodePacked(implementation(), "paused"))] = true;
        emit Pause();
    }

    /**
     * @dev called by the owner to unpause, returns to normal state
     */
    function unpause() public onlyOwner whenPaused {
        // paused[implementation()] = false;
        boolStorage[keccak256(abi.encodePacked(implementation(), "paused"))] = false;
        emit Unpause();
    }

    /**
     * @dev Returns true when the contract is paused.
     * @return bool
     */
    function paused() public view returns (bool) {
        // return paused[implementation()];
        return boolStorage[keccak256(abi.encodePacked(implementation(), "paused"))];
    }
}
