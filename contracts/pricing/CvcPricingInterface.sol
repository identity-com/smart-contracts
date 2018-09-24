pragma solidity ^0.4.24;
pragma experimental ABIEncoderV2;


/**
 * @title CvcPricingInterface
 * @dev This contract defines the pricing service interface.
 */
contract CvcPricingInterface {

    struct CredentialItemPrice {
        bytes32 id;
        uint256 price;
        address idv;
        string credentialItemType;
        string credentialItemName;
        string credentialItemVersion;
        bool deprecated;
    }

    /**
     * @dev The CredentialItemPriceSet event is emitted when Identity Validator sets new price for specific credential item.
     *
     * @param id Price record identifier.
     * @param price Credential Item price in CVC.
     * @param idv The address of Identity Validator who offers Credential Item for sale.
     * @param credentialItemType Credential Item Type.
     * @param credentialItemName Credential Item Name.
     * @param credentialItemVersion Credential Item Version.
     * @param credentialItemId Credential Item ID.
     */
    event CredentialItemPriceSet(
        bytes32 indexed id,
        uint256 price,
        address indexed idv,
        string credentialItemType,
        string credentialItemName,
        string credentialItemVersion,
        bytes32 indexed credentialItemId
    );

    /**
     * @dev The CredentialItemPriceDeleted event is emitted when Identity Validator deletes the price for specific credential item.
     *
     * @param id Price record identifier.
     * @param idv The address of Identity Validator who offers Credential Item for sale
     * @param credentialItemType Credential Item Type.
     * @param credentialItemName Credential Item Name.
     * @param credentialItemVersion Credential Item Version.
     * @param credentialItemId Credential Item ID.
     */
    event CredentialItemPriceDeleted(
        bytes32 indexed id,
        address indexed idv,
        string credentialItemType,
        string credentialItemName,
        string credentialItemVersion,
        bytes32 indexed credentialItemId
    );

    /**
    * @dev Sets the price for Credential Item of specific type, name and version.
    * The price is associated with IDV address (sender).
    * @param _credentialItemType Credential Item type.
    * @param _credentialItemName Credential Item name.
    * @param _credentialItemVersion Credential Item version.
    * @param _price Credential Item price.
    */
    function setPrice(
        string _credentialItemType,
        string _credentialItemName,
        string _credentialItemVersion,
        uint256 _price
        ) external;

    /**
    * @dev Deletes the price for Credential Item of specific type, name and version.
    * @param _credentialItemType Credential Item type.
    * @param _credentialItemName Credential Item name.
    * @param _credentialItemVersion Credential Item version.
    */
    function deletePrice(
        string _credentialItemType,
        string _credentialItemName,
        string _credentialItemVersion
        ) external;

    /**
    * @dev Returns the price set by IDV for Credential Item of specific type, name and version.
    * @param _idv IDV address.
    * @param _credentialItemType Credential Item type.
    * @param _credentialItemName Credential Item name.
    * @param _credentialItemVersion Credential Item version.
    * @return bytes32 Price ID.
    * @return uint256 Price value.
    * @return address IDV address.
    * @return string Credential Item type.
    * @return string Credential Item name.
    * @return string Credential Item version.
    */
    function getPrice(
        address _idv,
        string _credentialItemType,
        string _credentialItemName,
        string _credentialItemVersion
        ) external view returns (
            bytes32 id,
            uint256 price,
            address idv,
            string credentialItemType,
            string credentialItemName,
            string credentialItemVersion,
            bool deprecated
        );

    /**
    * @dev Returns the price by Credential Item ID.
    * @param _idv IDV address.
    * @param _credentialItemId Credential Item ID.
    * @return bytes32 Price ID.
    * @return uint256 Price value.
    * @return address IDV address.
    * @return string Credential Item type.
    * @return string Credential Item name.
    * @return string Credential Item version.
    */
    function getPriceByCredentialItemId(
        address _idv,
        bytes32 _credentialItemId
        ) external view returns (
            bytes32 id,
            uint256 price,
            address idv,
            string credentialItemType,
            string credentialItemName,
            string credentialItemVersion,
            bool deprecated
        );

    /**
    * @dev Returns all Credential Item prices.
    * @return CredentialItemPrice[]
    */
    function getAllPrices() external view returns (CredentialItemPrice[]);

    /**
     * @dev Returns all IDs of registered Credential Item prices.
     * @return bytes32[]
     */
    function getAllIds() external view returns (bytes32[]);

    /**
    * @dev Returns the price by ID.
    * @param _id Price ID
    * @return bytes32 Price ID.
    * @return uint256 Price value.
    * @return address IDV address.
    * @return string Credential Item type.
    * @return string Credential Item name.
    * @return string Credential Item version.
    */
    function getPriceById(
        bytes32 _id
        ) public view returns (
            bytes32 id,
            uint256 price,
            address idv,
            string credentialItemType,
            string credentialItemName,
            string credentialItemVersion,
            bool deprecated
        );
}
