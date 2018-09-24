pragma solidity ^0.4.24;

import "../pricing/CvcPricingInterface.sol";


/**
 * @title CvcEscrowInterface
 * @dev This contract defines the escrow service interface.
 */
contract CvcEscrowInterface {

    /// Describes all possible states of the escrow placement:
    /// Empty - the placement with specific ID is unknown to the contract. i.e. was never placed.
    /// Placed - the placement is active, pending to be released or canceled.
    /// Released - the placement has been released and Identity Validator received payment.
    /// Canceled - the placement has been canceled and Identity Requester got refund, no payment was made to Identity Validator.
    enum PlacementState {Empty, Placed, Released, Canceled}

    /**
    * @dev The EscrowPlaced event is emitted when the placement is made and the corresponding amount of tokens
    * transferred from Identity Requester account to the escrow account.
    * The event is emitted individually for each placement item with unique scope request ID.
    *
    * @param idr ID Requester address.
    * @param idv Identity Validator address.
    * @param scopeRequestId Scope request identifier.
    * @param amount CVC token amount in creds (CVC x 10e-8).
    * @param credentialItemIds Array of credential item IDs.
    * @param placementId Escrow Placement Identifier
    */
    event EscrowPlaced(
        address indexed idr,
        address indexed idv,
        bytes32 indexed scopeRequestId,
        uint256 amount,
        bytes32[] credentialItemIds,
        bytes32 placementId
    );

    /**
    * @dev The EscrowMoved event is emitted for each placement item with unique scope request ID kept in escrow upon
    * placement partial release. It contains the old and new placement ID to track placement item lifecycle.
    * The placement ID from the latest EscrowMoved event effectively points to the active placement containing
    * specific scope request ID.
    *
    * @param idr ID Requester address.
    * @param idv Identity Validator address.
    * @param scopeRequestId Scope request identifier.
    * @param amount CVC token amount in creds (CVC x 10e-8).
    * @param credentialItemIds Array of credential item IDs.
    * @param oldPlacementId Escrow Placement Identifier of the partially released placement.
    * @param placementId Escrow Placement Identifier of new placement.
    */
    event EscrowMoved(
        address indexed idr,
        address indexed idv,
        bytes32 indexed scopeRequestId,
        uint256 amount,
        bytes32[] credentialItemIds,
        bytes32 oldPlacementId,
        bytes32 placementId
    );

    /**
    * @dev The EscrowReleased event is emitted when the placement is released and the corresponding amount of tokens
    * transferred from escrow account to Identity Validator account.
    * The event is emitted individually for each placement item with unique scope request ID.
    *
    * @param idr ID Requester address.
    * @param idv Identity Validator address.
    * @param scopeRequestId Scope request identifier.
    * @param platformFee CVC token amount transferred to the marketplace maintainer account as service fee.
    * @param idvFee CVC token amount transferred to the Identity Validator account.
    * @param credentialItemIds Array of credential item IDs.
    * @param placementId Escrow Placement Identifier
    */
    event EscrowReleased(
        address indexed idr,
        address indexed idv,
        bytes32 indexed scopeRequestId,
        uint256 platformFee,
        uint256 idvFee,
        bytes32[] credentialItemIds,
        bytes32 placementId
    );


    /**
    * @dev The EscrowCanceled event is emitted when the placement is canceled and the corresponding amount of tokens
    * refunded from escrow account to Identity Requester account.
    * The event is emitted individually for each placement item with unique scope request ID.
    *
    * @param idr ID Requester address.
    * @param idv Identity Validator address.
    * @param scopeRequestId Scope request identifier.
    * @param amount CVC token amount in creds (CVC x 10e-8) refunded to Identity Requester.
    * @param credentialItemIds Array of credential item IDs.
    * @param placementId Escrow Placement Identifier
    */
    event EscrowCanceled(
        address indexed idr,
        address indexed idv,
        bytes32 indexed scopeRequestId,
        uint256 amount,
        bytes32[] credentialItemIds,
        bytes32 placementId
    );

    /**
    * @dev Handles escrow placement for a single scope request.
    * @param _idv Address of Identity Validator
    * @param _scopeRequestId Scope request identifier
    * @param _amount CVC token amount in creds (CVC x 10e-8)
    * @param _credentialItemIds Array of credential item IDs
    * @return bytes32 New Placement ID
    */
    function place(address _idv, bytes32 _scopeRequestId, uint256 _amount, bytes32[] _credentialItemIds)
        external
        returns (bytes32);

    /**
    * @dev Handles escrow placement for multiple scope requests grouped by credential item IDs.
    * @param _idv Address of Identity Validator
    * @param _scopeRequestIds Array of scope request IDs
    * @param _amount CVC token amount in creds (CVC x 10e-8)
    * @param _credentialItemIds Array of credential item IDs
    * @return bytes32 New Placement ID
    */
    function placeBatch(address _idv, bytes32[] _scopeRequestIds, uint256 _amount, bytes32[] _credentialItemIds)
        external
        returns (bytes32);

    /**
    * @dev Releases escrow placement for a single scope request and distributes funds.
    * @param _idr Address of Identity Requester
    * @param _idv Address of Identity Validator
    * @param _scopeRequestId Scope request identifier
    */
    function release(address _idr, address _idv, bytes32 _scopeRequestId) external;

    /**
    * @dev Releases escrow placement for multiple scope requests and distributes funds.
    * @param _idr Address of Identity Requester
    * @param _idv Address of Identity Validator
    * @param _scopeRequestIdsToRelease Array of scope request IDs which will be released
    * @param _scopeRequestIdsToKeep Array of scope request IDs which will be kept in escrow
    * @return bytes32 Placement ID of remaining part of the batch. Empty when the placement was fully released
    */
    function releaseBatch(
        address _idr,
        address _idv,
        bytes32[] _scopeRequestIdsToRelease,
        bytes32[] _scopeRequestIdsToKeep
    )
        external
        returns (bytes32);

    /**
    * @dev Refunds escrowed tokens for a single scope request back to Identity Requester.
    * @param _idr Address of Identity Requester
    * @param _idv Address of Identity Validator
    * @param _scopeRequestId Scope request identifier
    */
    function refund(address _idr, address _idv, bytes32 _scopeRequestId) external;


    /**
    * @dev Refunds escrowed tokens for multiple scope requests back to Identity Requester.
    * @param _idr Address of Identity Requester
    * @param _idv Address of Identity Validator
    * @param _scopeRequestIds Array of scope request IDs
    */
    function refundBatch(address _idr, address _idv, bytes32[] _scopeRequestIds) external;

    /**
    * @dev Returns placement details.
    * @param _idr Address of Identity Requester
    * @param _idv Address of Identity Validator
    * @param _scopeRequestId Scope request identifier
    * @return uint256 CVC token amount in creds (CVC x 10e-8)
    * @return PlacementState One of the CvcEscrowInterface.PlacementState values.
    * @return bytes32[] Array of credential item IDs.
    * @return uint256 Block confirmations since escrow was placed.
    * @return bool True if placement can be refunded otherwise false
    */
    function verify(address _idr, address _idv, bytes32 _scopeRequestId)
        external
        view
        returns (
            uint256 placementAmount,
            PlacementState placementState,
            bytes32[] credentialItemIds,
            uint256 confirmations,
            bool refundable
        );

    /**
    * @dev Returns placement details.
    * @param _idr Address of Identity Requester
    * @param _idv Address of Identity Validator
    * @param _scopeRequestIds Array of scope request IDs
    * @return uint256 CVC token amount in creds (CVC x 10e-8)
    * @return PlacementState One of the CvcEscrowInterface.PlacementState values.
    * @return bytes32[] Array of credential item IDs.
    * @return uint256 Block confirmations since escrow was placed.
    * @return bool True if placement can be refunded otherwise false
    */
    function verifyBatch(address _idr, address _idv, bytes32[] _scopeRequestIds)
        external
        view
        returns (
            uint256 placementAmount,
            PlacementState placementState,
            bytes32[] credentialItemIds,
            uint256 confirmations,
            bool refundable
        );


    /**
    * @dev Returns placement details.
    * @param _placementId Escrow Placement identifier.
    * @return uint256 CVC token amount in creds (CVC x 10e-8)
    * @return PlacementState One of the CvcEscrowInterface.PlacementState values.
    * @return bytes32[] Array of credential item IDs.
    * @return uint256 Block confirmations since escrow was placed.
    * @return bool True if placement can be refunded otherwise false
    */
    function verifyPlacement(bytes32 _placementId)
        external
        view
        returns (
            uint256 placementAmount,
            PlacementState placementState,
            bytes32[] credentialItemIds,
            uint256 confirmations,
            bool refundable
        );


    /**
    * @dev Calculates escrow placement identifier.
    * @param _idr Address of Identity Requester
    * @param _idv Address of Identity Validator
    * @param _scopeRequestIds An array of scope request identifiers
    * @return bytes32 Placement ID
    */
    function calculatePlacementId(address _idr, address _idv, bytes32[] _scopeRequestIds)
        public
        pure
        returns (bytes32);

}
