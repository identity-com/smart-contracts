pragma solidity ^0.4.24;


/**
 * @title CvcValidatorRegistryInterface
 * @dev This contract defines Validator Registry interface.
 */
contract CvcValidatorRegistryInterface {

    /**
    * @dev Adds a new Validator record or updates the existing one.
    * @param _name Validator name.
    * @param _description Validator description.
    */
    function set(address _idv, string _name, string _description) external;

    /**
    * @dev Returns Validator entry.
    * @param _idv Validator address.
    * @return name Validator name.
    * @return description Validator description.
    */
    function get(address _idv) external view returns (string name, string description);

    /**
    * @dev Verifies whether Validator is registered.
    * @param _idv Validator address.
    * @return bool
    */
    function exists(address _idv) external view returns (bool);
}
