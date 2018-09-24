pragma solidity ^0.4.24;


contract ClashingImplementation {

    function admin() external pure returns (address) {
        return 0x1111111111111111111111111111111111111111;
    }

    function delegatedFunction() external pure returns (bool) {
        return true;
    }
}
