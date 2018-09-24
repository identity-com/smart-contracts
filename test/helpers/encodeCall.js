const abi = require('ethereumjs-abi');
const BN = require('bignumber.js');

function encodeCall(name, args = [], rawValues = []) {
  const formatValue = value => (typeof value === 'number' || value instanceof BN ? value.toString() : value);
  const methodId = abi.methodID(name, args).toString('hex');
  const params = abi.rawEncode(args, rawValues.map(formatValue)).toString('hex');
  return `0x${methodId}${params}`;
}

module.exports = encodeCall;
