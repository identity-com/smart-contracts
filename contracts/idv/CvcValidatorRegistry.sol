pragma solidity ^0.4.24;

import "./CvcValidatorRegistryInterface.sol";
import "../upgradeability/Initializable.sol";
import "../upgradeability/EternalStorage.sol";
import "../upgradeability/Ownable.sol";


/**
 * @title CvcValidatorRegistry
 * @dev This contract is a registry for Identity Validators (IDV). It is part of the marketplace access control mechanism.
 * Only registered and authorized Identity Validators can perform certain actions on marketplace.
 */
contract CvcValidatorRegistry is EternalStorage, Initializable, Ownable, CvcValidatorRegistryInterface {

    /**
    Data structures and storage layout:
    struct Validator {
        string name;
        string description;
    }
    mapping(address => Validator) validators;
    **/

    /**
    * @dev Constructor: invokes initialization function
    */
    constructor() public {
        initialize(msg.sender);
    }

    /**
    * @dev Registers a new Validator or updates the existing one.
    * @param _idv Validator address.
    * @param _name Validator name.
    * @param _description Validator description.
    */
    function set(address _idv, string _name, string _description) external onlyInitialized onlyOwner {
        require(_idv != address(0), "Cannot register IDV with zero address");
        require(bytes(_name).length > 0, "Cannot register IDV with empty name");

        setValidatorName(_idv, _name);
        setValidatorDescription(_idv, _description);
    }

    /**
    * @dev Returns Validator data.
    * @param _idv Validator address.
    * @return name Validator name.
    * @return description Validator description.
    */
    function get(address _idv) external view onlyInitialized returns (string name, string description) {
        name = getValidatorName(_idv);
        description = getValidatorDescription(_idv);
    }

    /**
    * @dev Verifies whether Validator is registered.
    * @param _idv Validator address.
    * @return bool
    */
    function exists(address _idv) external view onlyInitialized returns (bool) {
        return bytes(getValidatorName(_idv)).length > 0;
    }

    /**
    * @dev Contract initialization method.
    * @param _owner Owner address
    */
    function initialize(address _owner) public initializes {
        setOwner(_owner);
    }

    /**
    * @dev Returns Validator name.
    * @param _idv Validator address.
    * @return string
    */
    function getValidatorName(address _idv) private view returns (string) {
        // return validators[_idv].name;
        return stringStorage[keccak256(abi.encodePacked("validators.", _idv, ".name"))];
    }

    /**
    * @dev Saves Validator name.
    * @param _idv Validator address.
    * @param _name Validator name.
    */
    function setValidatorName(address _idv, string _name) private {
        // validators[_idv].name = _name;
        stringStorage[keccak256(abi.encodePacked("validators.", _idv, ".name"))] = _name;
    }

    /**
    * @dev Returns Validator description.
    * @param _idv Validator address.
    * @return string
    */
    function getValidatorDescription(address _idv) private view returns (string) {
        // return validators[_idv].description;
        return stringStorage[keccak256(abi.encodePacked("validators.", _idv, ".description"))];
    }

    /**
    * @dev Saves Validator description.
    * @param _idv Validator address.
    * @param _description Validator description.
    */
    function setValidatorDescription(address _idv, string _description) private {
        // validators[_idv].description = _description;
        stringStorage[keccak256(abi.encodePacked("validators.", _idv, ".description"))] = _description;
    }

}
