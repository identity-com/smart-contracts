pragma solidity ^0.4.24;
pragma experimental ABIEncoderV2;

import "openzeppelin-solidity/contracts/AddressUtils.sol";
import "./CvcPricingInterface.sol";
import "../idv/CvcValidatorRegistryInterface.sol";
import "../ontology/CvcOntologyInterface.sol";
import "../upgradeability/Initializable.sol";
import "../upgradeability/EternalStorage.sol";
import "../upgradeability/Pausable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";


/**
 * @title CvcPricing
 * @dev This contract stores actual prices for Credential Items available for sale.
 * It allows registered Identity Validators to set or delete prices for specific Credential Items.
 *
 * The pricing contract depends on other marketplace contracts, such as:
 * CvcOntology - to verify that Credential Item is available on the market and can be offered for sale.
 * CvcValidatorRegistry - to ensure that only registered Identity Validators can use pricing services.
 *                          Transactions from unknown accounts will be rejected.
 */
contract CvcPricing is EternalStorage, Initializable, Pausable, CvcPricingInterface {

    using SafeMath for uint256;

    /**
    Data structures and storage layout:
    struct Price {
        uint256 value;
        bytes32 credentialItemId;
        address idv;
    }

    address cvcOntology;
    address idvRegistry;
    uint256 pricesCount;
    bytes32[] pricesIds;
    mapping(bytes32 => uint256) pricesIndices;
    mapping(bytes32 => Price) prices;
    **/


    /// Total supply of CVC tokens.
    uint256 constant private CVC_TOTAL_SUPPLY = 1e17;

    /// The fallback price introduced to be returned when credential price is undefined.
    /// The number is greater than CVC total supply, so it makes it impossible to transact with (e.g. place to escrow).
    uint256 constant private FALLBACK_PRICE = CVC_TOTAL_SUPPLY + 1; // solium-disable-line zeppelin/no-arithmetic-operations

    /// As zero price and undefined price are virtually indistinguishable,
    /// a special value is introduced to represent zero price.
    /// It equals to max unsigned integer which makes it impossible to transact with, hence should never be returned.
    uint256 constant private ZERO_PRICE = ~uint256(0);

    /**
    * @dev Constructor
    * @param _ontology CvcOntology contract address.
    * @param _idvRegistry CvcValidatorRegistry contract address.
    */
    constructor(address _ontology, address _idvRegistry) public {
        initialize(_ontology, _idvRegistry, msg.sender);
    }

    /**
     * @dev Throws if called by unregistered IDV.
     */
    modifier onlyRegisteredValidator() {
        require(idvRegistry().exists(msg.sender), "Identity Validator is not registered");
        _;
    }

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
    )
        external
        onlyRegisteredValidator
        whenNotPaused
    {
        // Check price value upper bound.
        require(_price <= CVC_TOTAL_SUPPLY, "Price value cannot be more than token total supply");

        // Check Credential Item ID to verify existence.
        bytes32 credentialItemId;
        bool deprecated;
        (credentialItemId, , , , , , , deprecated) = ontology().getByTypeNameVersion(
            _credentialItemType,
            _credentialItemName,
            _credentialItemVersion
        );
        // Prevent setting price for unknown credential items.
        require(credentialItemId != 0x0, "Cannot set price for unknown credential item");
        require(deprecated == false, "Cannot set price for deprecated credential item");

        // Calculate price ID.
        bytes32 id = calculateId(msg.sender, credentialItemId);

        // Register new record (when price record has no associated Credential Item ID).
        if (getPriceCredentialItemId(id) == 0x0) {
            registerNewRecord(id);
        }

        // Save the price.
        setPriceIdv(id, msg.sender);
        setPriceCredentialItemId(id, credentialItemId);
        setPriceValue(id, _price);

        emit CredentialItemPriceSet(
            id,
            _price,
            msg.sender,
            _credentialItemType,
            _credentialItemName,
            _credentialItemVersion,
            credentialItemId
        );
    }

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
    )
        external
        whenNotPaused
    {
        // Lookup Credential Item.
        bytes32 credentialItemId;
        (credentialItemId, , , , , , ,) = ontology().getByTypeNameVersion(
            _credentialItemType,
            _credentialItemName,
            _credentialItemVersion
        );

        // Calculate Price ID to address individual data items.
        bytes32 id = calculateId(msg.sender, credentialItemId);

        // Ensure the price existence. Check whether Credential Item is associated.
        credentialItemId = getPriceCredentialItemId(id);
        require(credentialItemId != 0x0, "Cannot delete unknown price record");

        // Delete the price data.
        deletePriceIdv(id);
        deletePriceCredentialItemId(id);
        deletePriceValue(id);

        unregisterRecord(id);

        emit CredentialItemPriceDeleted(
            id,
            msg.sender,
            _credentialItemType,
            _credentialItemName,
            _credentialItemVersion,
            credentialItemId
        );
    }

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
    )
        external
        view
        onlyInitialized
        returns (
            bytes32 id,
            uint256 price,
            address idv,
            string credentialItemType,
            string credentialItemName,
            string credentialItemVersion,
            bool deprecated
        )
    {
        // Lookup Credential Item.
        bytes32 credentialItemId;
        (credentialItemId, credentialItemType, credentialItemName, credentialItemVersion, , , , deprecated) = ontology().getByTypeNameVersion(
            _credentialItemType,
            _credentialItemName,
            _credentialItemVersion
        );
        idv = _idv;
        id = calculateId(idv, credentialItemId);
        price = getPriceValue(id);
        if (price == FALLBACK_PRICE) {
            return (0x0, price, 0x0, "", "", "", false);
        }
    }

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
    function getPriceByCredentialItemId(address _idv, bytes32 _credentialItemId) external view returns (
        bytes32 id,
        uint256 price,
        address idv,
        string credentialItemType,
        string credentialItemName,
        string credentialItemVersion,
        bool deprecated
    ) {
        return getPriceById(calculateId(_idv, _credentialItemId));
    }

    /**
    * @dev Returns all Credential Item prices.
    * @return CredentialItemPrice[]
    */
    function getAllPrices() external view onlyInitialized returns (CredentialItemPrice[]) {
        uint256 count = getCount();
        CredentialItemPrice[] memory prices = new CredentialItemPrice[](count);
        for (uint256 i = 0; i < count; i++) {
            bytes32 id = getRecordId(i);
            bytes32 credentialItemId = getPriceCredentialItemId(id);
            string memory credentialItemType;
            string memory credentialItemName;
            string memory credentialItemVersion;
            bool deprecated;

            (, credentialItemType, credentialItemName, credentialItemVersion, , , , deprecated) = ontology().getById(credentialItemId);

            prices[i] = CredentialItemPrice(
                id,
                getPriceValue(id),
                getPriceIdv(id),
                credentialItemType,
                credentialItemName,
                credentialItemVersion,
                deprecated
            );
        }

        return prices;
    }

    /**
     * @dev Returns all IDs of registered Credential Item prices.
     * @return bytes32[]
     */
    function getAllIds() external view onlyInitialized returns(bytes32[]) {
        uint256 count = getCount();
        bytes32[] memory ids = new bytes32[](count);
        for (uint256 i = 0; i < count; i++) {
            ids[i] = getRecordId(i);
        }

        return ids;
    }

    /**
    * @dev Contract initialization method.
    * @param _ontology CvcOntology contract address.
    * @param _idvRegistry CvcValidatorRegistry contract address.
    * @param _owner Owner address
    */
    function initialize(address _ontology, address _idvRegistry, address _owner) public initializes {
        require(AddressUtils.isContract(_ontology), "Initialization error: no contract code at ontology contract address");
        require(AddressUtils.isContract(_idvRegistry), "Initialization error: no contract code at IDV registry contract address");
        // cvcOntology = _ontology;
        addressStorage[keccak256("cvc.ontology")] = _ontology;
        // idvRegistry = _idvRegistry;
        addressStorage[keccak256("cvc.idv.registry")] = _idvRegistry;
        // Initialize current implementation owner address.
        setOwner(_owner);
    }

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
    function getPriceById(bytes32 _id) public view onlyInitialized returns (
        bytes32 id,
        uint256 price,
        address idv,
        string credentialItemType,
        string credentialItemName,
        string credentialItemVersion,
        bool deprecated
    ) {
        // Always return price (could be a fallback price when not set).
        price = getPriceValue(_id);
        // Check whether Credential Item is associated. This is mandatory requirement for all existing prices.
        bytes32 credentialItemId = getPriceCredentialItemId(_id);
        if (credentialItemId != 0x0) {
            // Return ID and IDV address for existing entry only.
            id = _id;
            idv = getPriceIdv(_id);

            (, credentialItemType, credentialItemName, credentialItemVersion, , , , deprecated) = ontology().getById(credentialItemId);
        }
    }

    /**
    * @dev Returns instance of CvcOntologyInterface.
    * @return CvcOntologyInterface
    */
    function ontology() public view returns (CvcOntologyInterface) {
        // return CvcOntologyInterface(cvcOntology);
        return CvcOntologyInterface(addressStorage[keccak256("cvc.ontology")]);
    }

    /**
    * @dev Returns instance of CvcValidatorRegistryInterface.
    * @return CvcValidatorRegistryInterface
    */
    function idvRegistry() public view returns (CvcValidatorRegistryInterface) {
        // return CvcValidatorRegistryInterface(idvRegistry);
        return CvcValidatorRegistryInterface(addressStorage[keccak256("cvc.idv.registry")]);
    }

    /**
    * @dev Returns price record count.
    * @return uint256
    */
    function getCount() internal view returns (uint256) {
        // return pricesCount;
        return uintStorage[keccak256("prices.count")];
    }

    /**
    * @dev Increments price record counter.
    */
    function incrementCount() internal {
        // pricesCount = getCount().add(1);
        uintStorage[keccak256("prices.count")] = getCount().add(1);
    }

    /**
    * @dev Decrements price record counter.
    */
    function decrementCount() internal {
        // pricesCount = getCount().sub(1);
        uintStorage[keccak256("prices.count")] = getCount().sub(1);
    }

    /**
    * @dev Returns price ID by index.
    * @param _index Price record index.
    * @return bytes32
    */
    function getRecordId(uint256 _index) internal view returns (bytes32) {
        // return pricesIds[_index];
        return bytes32Storage[keccak256(abi.encodePacked("prices.ids.", _index))];
    }

    /**
    * @dev Index new price record.
    * @param _id The price ID.
    */
    function registerNewRecord(bytes32 _id) internal {
        bytes32 indexSlot = keccak256(abi.encodePacked("prices.indices.", _id));
        // Prevent from registering same ID twice.
        // require(pricesIndices[_id] == 0);
        require(uintStorage[indexSlot] == 0, "Integrity error: price with the same ID is already registered");

        uint256 index = getCount();
        // Store record ID against index.
        // pricesIds[index] = _id;
        bytes32Storage[keccak256(abi.encodePacked("prices.ids.", index))] = _id;
        // Maintain reversed index to ID mapping to ensure O(1) deletion.
        // Store n+1 value and reserve zero value for not indexed records.
        uintStorage[indexSlot] = index.add(1);
        incrementCount();
    }

    /**
    * @dev Deletes price record from index.
    * @param _id The price ID.
    */
    function unregisterRecord(bytes32 _id) internal {
        // Since the order of price records is not guaranteed, we can make deletion more efficient
        // by replacing record we want to delete with the last record, hence avoid reindex.

        // Calculate deletion record ID slot.
        bytes32 deletionIndexSlot = keccak256(abi.encodePacked("prices.indices.", _id));
        // uint256 deletionIndex = pricesIndices[_id].sub(1);
        uint256 deletionIndex = uintStorage[deletionIndexSlot].sub(1);
        bytes32 deletionIdSlot = keccak256(abi.encodePacked("prices.ids.", deletionIndex));

        // Calculate last record ID slot.
        uint256 lastIndex = getCount().sub(1);
        bytes32 lastIdSlot = keccak256(abi.encodePacked("prices.ids.", lastIndex));

        // Calculate last record index slot.
        bytes32 lastIndexSlot = keccak256(abi.encodePacked("prices.indices.", bytes32Storage[lastIdSlot]));

        // Copy last record ID into the empty slot.
        // pricesIds[deletionIdSlot] = pricesIds[lastIdSlot];
        bytes32Storage[deletionIdSlot] = bytes32Storage[lastIdSlot];
        // Make moved ID index point to the the correct record.
        // pricesIndices[lastIndexSlot] = pricesIndices[deletionIndexSlot];
        uintStorage[lastIndexSlot] = uintStorage[deletionIndexSlot];
        // Delete last record ID.
        // delete pricesIds[lastIndex];
        delete bytes32Storage[lastIdSlot];
        // Delete reversed index.
        // delete pricesIndices[_id];
        delete uintStorage[deletionIndexSlot];
        decrementCount();
    }
    /**
    * @dev Returns price value.
    * @param _id The price ID.
    * @return uint256
    */
    function getPriceValue(bytes32 _id) internal view returns (uint256) {
        // uint256 value = prices[_id].value;
        uint256 value = uintStorage[keccak256(abi.encodePacked("prices.", _id, ".value"))];
        // Return fallback price if price is not set for existing Credential Item.
        // Since we use special (non-zero) value for zero price, actual '0' means the price was never set.
        if (value == 0) {
            return FALLBACK_PRICE;
        }
        // Convert from special zero representation value.
        if (value == ZERO_PRICE) {
            return 0;
        }

        return value;
    }

    /**
    * @dev Saves price value.
    * @param _id The price ID.
    * @param _value The price value.
    */
    function setPriceValue(bytes32 _id, uint256 _value) internal {
        // Save the price (convert to special zero representation value if necessary).
        // prices[_id].value = (_value == 0) ? ZERO_PRICE : _value;
        uintStorage[keccak256(abi.encodePacked("prices.", _id, ".value"))] = (_value == 0) ? ZERO_PRICE : _value;
    }

    /**
    * @dev Deletes price value.
    * @param _id The price ID.
    */
    function deletePriceValue(bytes32 _id) internal {
        // delete prices[_id].value;
        delete uintStorage[keccak256(abi.encodePacked("prices.", _id, ".value"))];
    }

    /**
    * @dev Returns Credential Item ID the price is set for.
    * @param _id The price ID.
    * @return bytes32
    */
    function getPriceCredentialItemId(bytes32 _id) internal view returns (bytes32) {
        // return prices[_id].credentialItemId;
        return bytes32Storage[keccak256(abi.encodePacked("prices.", _id, ".credentialItemId"))];
    }

    /**
    * @dev Saves price Credential Item ID
    * @param _id The price ID.
    * @param _credentialItemId Associated Credential Item ID.
    */
    function setPriceCredentialItemId(bytes32 _id, bytes32 _credentialItemId) internal {
        // prices[_id].credentialItemId = _credentialItemId;
        bytes32Storage[keccak256(abi.encodePacked("prices.", _id, ".credentialItemId"))] = _credentialItemId;
    }

    /**
    * @dev Deletes price Credential Item ID.
    * @param _id The price ID.
    */
    function deletePriceCredentialItemId(bytes32 _id) internal {
        // delete prices[_id].credentialItemId;
        delete bytes32Storage[keccak256(abi.encodePacked("prices.", _id, ".credentialItemId"))];
    }

    /**
    * @dev Returns price IDV address.
    * @param _id The price ID.
    * @return address
    */
    function getPriceIdv(bytes32 _id) internal view returns (address) {
        // return prices[_id].idv;
        return addressStorage[keccak256(abi.encodePacked("prices.", _id, ".idv"))];
    }

    /**
    * @dev Saves price IDV address.
    * @param _id The price ID.
    * @param _idv IDV address.
    */
    function setPriceIdv(bytes32 _id, address _idv) internal {
        // prices[_id].idv = _idv;
        addressStorage[keccak256(abi.encodePacked("prices.", _id, ".idv"))] = _idv;
    }

    /**
    * @dev Deletes price IDV address.
    * @param _id The price ID.
    */
    function deletePriceIdv(bytes32 _id) internal {
        // delete prices[_id].idv;
        delete addressStorage[keccak256(abi.encodePacked("prices.", _id, ".idv"))];
    }

    /**
    * @dev Calculates price ID.
    * @param _idv IDV address.
    * @param _credentialItemId Credential Item ID.
    * @return bytes32
    */
    function calculateId(address _idv, bytes32 _credentialItemId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_idv, ".", _credentialItemId));
    }
}
