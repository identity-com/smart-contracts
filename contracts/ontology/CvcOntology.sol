pragma solidity ^0.4.24;
pragma experimental ABIEncoderV2;

import "./CvcOntologyInterface.sol";
import "../upgradeability/Initializable.sol";
import "../upgradeability/Ownable.sol";
import "../upgradeability/EternalStorage.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

/**
 * @title CvcOntology
 * @dev This contract holds the list of all recognized Credential Items available for sale.
 */
contract CvcOntology is EternalStorage, Initializable, Ownable, CvcOntologyInterface {

    using SafeMath for uint256;

    /**
    Data structures and storage layout:
    struct CredentialItem {
        string type; // "claim" or "credential"
        string name; // e.g. "proofOfIdentity"
        string version; // e.g. "v1.2"
        string reference; // e.g. "https://example.com/credential-proofOfIdentity-v1_2.json"
        string referenceType; // e.g. "JSON-LD-Context"
        bytes32 referenceHash; // e.g. "0x2cd9bf92c5e20b1b410f5ace94d963a96e89156fbe65b70365e8596b37f1f165"
        bool deprecated; // e.g. false
    }
    uint256 recordsCount;
    bytes32[] recordsIds;
    mapping(bytes32 => CredentialItem) records;
    **/

    /**
     * Constructor to initialize with some default values
     */
    constructor() public {
        initialize(msg.sender);
    }

    /**
     * @dev Adds new Credential Item to the registry.
     * @param _recordType Credential Item type
     * @param _recordName Credential Item name
     * @param _recordVersion Credential Item version
     * @param _reference Credential Item reference URL
     * @param _referenceType Credential Item reference type
     * @param _referenceHash Credential Item reference hash
     */
    function add(
        string _recordType,
        string _recordName,
        string _recordVersion,
        string _reference,
        string _referenceType,
        bytes32 _referenceHash
    ) external onlyInitialized onlyOwner {
        require(bytes(_recordType).length > 0, "Empty credential item type");
        require(bytes(_recordName).length > 0, "Empty credential item name");
        require(bytes(_recordVersion).length > 0, "Empty credential item version");
        require(bytes(_reference).length > 0, "Empty credential item reference");
        require(bytes(_referenceType).length > 0, "Empty credential item type");
        require(_referenceHash != 0x0, "Empty credential item reference hash");

        bytes32 id = calculateId(_recordType, _recordName, _recordVersion);

        require(getReferenceHash(id) == 0x0, "Credential item record already exists");

        setType(id, _recordType);
        setName(id, _recordName);
        setVersion(id, _recordVersion);
        setReference(id, _reference);
        setReferenceType(id, _referenceType);
        setReferenceHash(id, _referenceHash);
        setRecordId(getCount(), id);
        incrementCount();
    }

    /**
     * @dev Contract initialization method.
     * @param _owner Contract owner address
     */
    function initialize(address _owner) public initializes {
        setOwner(_owner);
    }

    /**
    * @dev Deprecates single Credential Item of specific type, name and version.
    * @param _type Record type to deprecate
    * @param _name Record name to deprecate
    * @param _version Record version to deprecate
    */
    function deprecate(string _type, string _name, string _version) public onlyInitialized onlyOwner {
        deprecateById(calculateId(_type, _name, _version));
    }

    /**
    * @dev Deprecates single Credential Item by ontology record ID.
    * @param _id Ontology record ID
    */
    function deprecateById(bytes32 _id) public onlyInitialized onlyOwner {
        require(getReferenceHash(_id) != 0x0, "Cannot deprecate unknown credential item");
        require(getDeprecated(_id) == false, "Credential item is already deprecated");
        setDeprecated(_id);
    }

    /**
     * @dev Returns single Credential Item data up by ontology record ID.
     * @param _id Ontology record ID to search by
     * @return id Ontology record ID
     * @return recordType Credential Item type
     * @return recordName Credential Item name
     * @return recordVersion Credential Item version
     * @return reference Credential Item reference URL
     * @return referenceType Credential Item reference type
     * @return referenceHash Credential Item reference hash
     * @return deprecated Credential Item type deprecation flag
     */
    function getById(
        bytes32 _id
    ) public view onlyInitialized returns (
        bytes32 id,
        string recordType,
        string recordName,
        string recordVersion,
        string reference,
        string referenceType,
        bytes32 referenceHash,
        bool deprecated
    ) {
        referenceHash = getReferenceHash(_id);
        if (referenceHash != 0x0) {
            recordType = getType(_id);
            recordName = getName(_id);
            recordVersion = getVersion(_id);
            reference = getReference(_id);
            referenceType = getReferenceType(_id);
            deprecated = getDeprecated(_id);
            id = _id;
        }
    }

    /**
     * @dev Returns single Credential Item of specific type, name and version.
     * @param _type Credential Item type
     * @param _name Credential Item name
     * @param _version Credential Item version
     * @return id Ontology record ID
     * @return recordType Credential Item type
     * @return recordName Credential Item name
     * @return recordVersion Credential Item version
     * @return reference Credential Item reference URL
     * @return referenceType Credential Item reference type
     * @return referenceHash Credential Item reference hash
     * @return deprecated Credential Item type deprecation flag
     */
    function getByTypeNameVersion(
        string _type,
        string _name,
        string _version
    ) public view onlyInitialized returns (
        bytes32 id,
        string recordType,
        string recordName,
        string recordVersion,
        string reference,
        string referenceType,
        bytes32 referenceHash,
        bool deprecated
    ) {
        return getById(calculateId(_type, _name, _version));
    }

    /**
     * @dev Returns all records. Currently is supported only from internal calls.
     * @return CredentialItem[]
     */
    function getAll() public view onlyInitialized returns (CredentialItem[]) {
        uint256 count = getCount();
        bytes32 id;
        CredentialItem[] memory records = new CredentialItem[](count);
        for (uint256 i = 0; i < count; i++) {
            id = getRecordId(i);
            records[i] = CredentialItem(
                id,
                getType(id),
                getName(id),
                getVersion(id),
                getReference(id),
                getReferenceType(id),
                getReferenceHash(id)
            );
        }

        return records;
    }

    /**
     * @dev Returns all ontology record IDs.
     * Could be used from web3.js to retrieve the list of all records.
     * @return bytes32[]
     */
    function getAllIds() public view onlyInitialized returns(bytes32[]) {
        uint256 count = getCount();
        bytes32[] memory ids = new bytes32[](count);
        for (uint256 i = 0; i < count; i++) {
            ids[i] = getRecordId(i);
        }

        return ids;
    }

    /**
     * @dev Returns the number of registered ontology records.
     * @return uint256
     */
    function getCount() internal view returns (uint256) {
        // return recordsCount;
        return uintStorage[keccak256("records.count")];
    }

    /**
    * @dev Increments total record count.
    */
    function incrementCount() internal {
        // recordsCount = getCount().add(1);
        uintStorage[keccak256("records.count")] = getCount().add(1);
    }

    /**
     * @dev Returns the ontology record ID by numeric index.
     * @return bytes32
     */
    function getRecordId(uint256 _index) internal view returns (bytes32) {
        // return recordsIds[_index];
        return bytes32Storage[keccak256(abi.encodePacked("records.ids.", _index))];
    }

    /**
    * @dev Saves ontology record ID against the index.
    * @param _index Numeric index.
    * @param _id Ontology record ID.
    */
    function setRecordId(uint256 _index, bytes32 _id) internal {
        // recordsIds[_index] = _id;
        bytes32Storage[keccak256(abi.encodePacked("records.ids.", _index))] = _id;
    }

    /**
     * @dev Returns the Credential Item type.
     * @return string
     */
    function getType(bytes32 _id) internal view returns (string) {
        // return records[_id].type;
        return stringStorage[keccak256(abi.encodePacked("records.", _id, ".type"))];
    }

    /**
    * @dev Saves Credential Item type.
    * @param _id Ontology record ID.
    * @param _type Credential Item type.
    */
    function setType(bytes32 _id, string _type) internal {
        // records[_id].type = _type;
        stringStorage[keccak256(abi.encodePacked("records.", _id, ".type"))] = _type;
    }

    /**
     * @dev Returns the Credential Item name.
     * @return string
     */
    function getName(bytes32 _id) internal view returns (string) {
        // records[_id].name;
        return stringStorage[keccak256(abi.encodePacked("records.", _id, ".name"))];
    }

    /**
    * @dev Saves Credential Item name.
    * @param _id Ontology record ID.
    * @param _name Credential Item name.
    */
    function setName(bytes32 _id, string _name) internal {
        // records[_id].name = _name;
        stringStorage[keccak256(abi.encodePacked("records.", _id, ".name"))] = _name;
    }

    /**
     * @dev Returns the Credential Item version.
     * @return string
     */
    function getVersion(bytes32 _id) internal view returns (string) {
        // return records[_id].version;
        return stringStorage[keccak256(abi.encodePacked("records.", _id, ".version"))];
    }

    /**
    * @dev Saves Credential Item version.
    * @param _id Ontology record ID.
    * @param _version Credential Item version.
    */
    function setVersion(bytes32 _id, string _version) internal {
        // records[_id].version = _version;
        stringStorage[keccak256(abi.encodePacked("records.", _id, ".version"))] = _version;
    }

    /**
     * @dev Returns the Credential Item reference URL.
     * @return string
     */
    function getReference(bytes32 _id) internal view returns (string) {
        // return records[_id].reference;
        return stringStorage[keccak256(abi.encodePacked("records.", _id, ".reference"))];
    }

    /**
    * @dev Saves Credential Item reference URL.
    * @param _id Ontology record ID.
    * @param _reference Reference value.
    */
    function setReference(bytes32 _id, string _reference) internal {
        // records[_id].reference = _reference;
        stringStorage[keccak256(abi.encodePacked("records.", _id, ".reference"))] = _reference;
    }

    /**
     * @dev Returns the Credential Item reference type value.
     * @return string
     */
    function getReferenceType(bytes32 _id) internal view returns (string) {
        // return records[_id].referenceType;
        return stringStorage[keccak256(abi.encodePacked("records.", _id, ".referenceType"))];
    }

    /**
    * @dev Saves Credential Item reference type.
    * @param _id Ontology record ID.
    * @param _referenceType Reference type.
    */
    function setReferenceType(bytes32 _id, string _referenceType) internal {
        // records[_id].referenceType = _referenceType;
        stringStorage[keccak256(abi.encodePacked("records.", _id, ".referenceType"))] = _referenceType;
    }

    /**
     * @dev Returns the Credential Item reference hash value.
     * @return bytes32
     */
    function getReferenceHash(bytes32 _id) internal view returns (bytes32) {
        // return records[_id].referenceHash;
        return bytes32Storage[keccak256(abi.encodePacked("records.", _id, ".referenceHash"))];
    }

    /**
    * @dev Saves Credential Item reference hash.
    * @param _id Ontology record ID.
    * @param _referenceHash Reference hash.
    */
    function setReferenceHash(bytes32 _id, bytes32 _referenceHash) internal {
        // records[_id].referenceHash = _referenceHash;
        bytes32Storage[keccak256(abi.encodePacked("records.", _id, ".referenceHash"))] = _referenceHash;
    }

    /**
     * @dev Returns the Credential Item deprecation flag value.
     * @return bool
     */
    function getDeprecated(bytes32 _id) internal view returns (bool) {
        // return records[_id].deprecated;
        return boolStorage[keccak256(abi.encodePacked("records.", _id, ".deprecated"))];
    }

    /**
    * @dev Sets Credential Item deprecation flag value.
    * @param _id Ontology record ID.
    */
    function setDeprecated(bytes32 _id) internal {
        // records[_id].deprecated = true;
        boolStorage[keccak256(abi.encodePacked("records.", _id, ".deprecated"))] = true;
    }

    /**
    * @dev Calculates ontology record ID.
    * @param _type Credential Item type.
    * @param _name Credential Item name.
    * @param _version Credential Item version.
    */
    function calculateId(string _type, string _name, string _version) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_type, ".", _name, ".", _version));
    }
}
