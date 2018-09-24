pragma solidity ^0.4.24;
pragma experimental ABIEncoderV2;

import "../../contracts/ontology/CvcOntology.sol";
import "../../contracts/ontology/CvcOntologyInterface.sol";


contract OntologyAccessor {
    address internal ontology;

    constructor(address _ontology) public {
        ontology = _ontology;
    }

    function getOne(uint256 idx) public view returns (bytes32, string, string, string, string, string, bytes32) {
        CvcOntologyInterface.CredentialItem memory credentialItem = CvcOntology(ontology).getAll()[idx];
        return (
            credentialItem.id,
            credentialItem.recordType,
            credentialItem.recordName,
            credentialItem.recordVersion,
            credentialItem.reference,
            credentialItem.referenceType,
            credentialItem.referenceHash
        );
    }
}
