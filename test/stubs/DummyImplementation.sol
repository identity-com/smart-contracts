pragma solidity ^0.4.24;


contract DummyImplementation {

    uint256 public value;

    function initialize(uint256 _value) public payable {
        value = _value;
    }

    function version() public pure returns (string) {
        return "V1";
    }
}


contract DummyImplementationV2 is DummyImplementation {
    function version() public pure returns (string) {
        return "V2";
    }
}


contract DummyImplementationV3 is DummyImplementationV2 {
    function version() public pure returns (string) {
        return "V3";
    }
}
