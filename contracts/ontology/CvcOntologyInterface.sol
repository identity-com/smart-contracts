pragma solidity ^0.4.24;
pragma experimental ABIEncoderV2;

/**
 * @title CvcOntologyInterface
 * @dev This contract defines marketplace ontology registry interface.
 */
contract CvcOntologyInterface {

    struct CredentialItem {
        bytes32 id;
        string recordType;
        string recordName;
        string recordVersion;
        string reference;
        string referenceType;
        bytes32 referenceHash;
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
        ) external;

    /**
    * @dev Deprecates single Credential Item by external ID (type, name and version).
    * @param _type Record type to deprecate
    * @param _name Record name to deprecate
    * @param _version Record version to deprecate
    */
    function deprecate(string _type, string _name, string _version) public;

    /**
    * @dev Deprecates single Credential Item by ID.
    * @param _id Record ID to deprecate
    */
    function deprecateById(bytes32 _id) public;

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
    function getById(bytes32 _id) public view returns (
        bytes32 id,
        string recordType,
        string recordName,
        string recordVersion,
        string reference,
        string referenceType,
        bytes32 referenceHash,
        bool deprecated
        );

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
        ) public view returns (
            bytes32 id,
            string recordType,
            string recordName,
            string recordVersion,
            string reference,
            string referenceType,
            bytes32 referenceHash,
            bool deprecated
        );

    /**
     * @dev Returns all IDs of registered Credential Items.
     * @return bytes32[]
     */
    function getAllIds() public view returns (bytes32[]);

    /**
     * @dev Returns all registered Credential Items.
     * @return bytes32[]
     */
    function getAll() public view returns (CredentialItem[]);
}
