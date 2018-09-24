pragma solidity ^0.4.24;
pragma experimental ABIEncoderV2;

import "../../contracts/pricing/CvcPricing.sol";


contract PricingAccessor {
    address internal pricing;

    constructor(address _pricing) public {//solhint-disable-line state-visibility
        pricing = _pricing; //solhint-disable-line state-visibility
    }

    function getOne(uint idx) public view returns (bytes32, uint256, address, string, string, string, bool) {
        CvcPricing.CredentialItemPrice memory price = CvcPricing(pricing).getAllPrices()[idx];
        return (
            price.id,
            price.price,
            price.idv,
            price.credentialItemType,
            price.credentialItemName,
            price.credentialItemVersion,
            price.deprecated
        );
    }
}
