#!/usr/bin/env bash
if [[ "${STAGE}" == "test" ]]; then
    HOST=$BLOCKCHAIN_NODE_HOST_TEST
else
    HOST=$BLOCKCHAIN_NODE_HOST_DEV
fi;

echo "Connecting to server ${HOST}"

ssh -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=no -L 9545:localhost:8545 -N ubuntu@${HOST} &
pid=$!

echo "Waiting a few seconds to establish the tunnel..."
sleep 5

# check if the tunnel exists and fail out if not
kill -0 $pid > /dev/null 2>&1 || exit 1;

"$@"
exitcode=$?
echo "Killing ssh tunnel $pid"
kill $pid
exit $exitcode
