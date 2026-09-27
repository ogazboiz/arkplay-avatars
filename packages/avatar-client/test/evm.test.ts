import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  checksumAddress,
  decodeWords,
  encodeCall,
  eventTopic,
  formatUnits,
  fromQuantity,
  functionSelector,
  hexToBytes,
  bytesToHex,
  isAddress,
  isBaseUnits,
  keccak256,
  keccakText,
  MAX_UINT256,
  parseUnits,
  sameAddress,
  shopErrorName,
  toQuantity,
  TRANSFER_EVENT,
  wordToAddress,
} from '../src/index.ts'

test('keccak-256 matches the Ethereum test vectors', () => {
  assert.equal(keccak256(new Uint8Array()), '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470')
  assert.equal(eventTopic(TRANSFER_EVENT), '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef')
  assert.equal(keccakText('hello'), '0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8')
  // Well-known ERC-20 / ERC-721 selectors.
  assert.equal(functionSelector('approve(address,uint256)'), '0x095ea7b3')
  assert.equal(functionSelector('allowance(address,address)'), '0xdd62ed3e')
  assert.equal(functionSelector('balanceOf(address)'), '0x70a08231')
  assert.equal(functionSelector('ownerOf(uint256)'), '0x6352211e')
  assert.equal(functionSelector('transferFrom(address,address,uint256)'), '0x23b872dd')
})

test('EIP-55 checksums (the EIP test vectors)', () => {
  for (const a of ['0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359', '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB', '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb']) {
    assert.equal(checksumAddress(a.toLowerCase()), a)
    assert.ok(isAddress(a))
  }
  assert.ok(isAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed'))
  assert.ok(!isAddress('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD'), 'a bad checksum is refused')
  assert.ok(!isAddress('0x123'))
  assert.ok(sameAddress('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed'))
  assert.ok(!sameAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed', null))
})

test('ABI encoding of static calls', () => {
  const buy = encodeCall('buy(uint256,uint256)', [7n, 10n ** 18n])
  assert.equal(buy.slice(0, 10), functionSelector('buy(uint256,uint256)'))
  assert.equal(buy.length, 2 + 8 + 128)
  assert.deepEqual(decodeWords(`0x${buy.slice(10)}`), [7n, 10n ** 18n])
  const approve = encodeCall('approve(address,uint256)', ['0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', '1000'])
  assert.equal(approve, '0x095ea7b3' + '0'.repeat(24) + '5aaeb6053f3e94c9b9a09f33669435e7ef1beaed' + (1000).toString(16).padStart(64, '0'))
  assert.throws(() => encodeCall('buy(uint256,uint256)', [1n]), /takes 2/)
  assert.throws(() => encodeCall('buy(uint256)', [-1n]), /fit/)
  assert.throws(() => encodeCall('buy(uint256)', [MAX_UINT256 + 1n]), /fit/)
  assert.throws(() => encodeCall('buy(uint8)', [256]), /fit/)
  assert.throws(() => encodeCall('f(string)', ['x']), /Unsupported/)
  assert.throws(() => encodeCall('approve(address,uint256)', ['0x12', 1n]), /address/)
})

test('words, quantities and addresses decode strictly', () => {
  assert.equal(wordToAddress('0x0000000000000000000000005aaeb6053f3e94c9b9a09f33669435e7ef1beaed'), '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed')
  assert.throws(() => wordToAddress(`0x${'f'.repeat(64)}`), /address/)
  assert.equal(fromQuantity('0x1a'), 26n)
  assert.equal(toQuantity(26n), '0x1a')
  assert.throws(() => fromQuantity('26'))
  assert.throws(() => fromQuantity(null))
  assert.throws(() => decodeWords('0x1234'))
  assert.deepEqual(bytesToHex(hexToBytes('0x00ff10')), '0x00ff10')
  assert.throws(() => hexToBytes('0xabc'))
})

test('token amounts are bigint base units, never floats', () => {
  assert.equal(formatUnits(12_500000000000000000n, 18), '12.5')
  assert.equal(formatUnits(1n, 18), '0.000000000000000001')
  assert.equal(formatUnits(1234567n * 10n ** 18n, 18, { group: true }), '1,234,567')
  assert.equal(formatUnits(1_999999n, 6, { maxFraction: 2 }), '1.99')
  assert.equal(formatUnits(0n, 18), '0')
  assert.equal(formatUnits(5n, 0), '5')
  assert.equal(parseUnits('12.5', 18), 12_500000000000000000n)
  assert.equal(parseUnits('0.1', 18) + parseUnits('0.2', 18), parseUnits('0.3', 18), '0.1 + 0.2 is exactly 0.3 in base units')
  assert.equal(parseUnits('1.50', 1), 15n)
  assert.throws(() => parseUnits('1.05', 1), /decimals/)
  assert.throws(() => parseUnits('-1', 18))
  assert.throws(() => parseUnits('1e18', 18))
  assert.ok(isBaseUnits('0') && isBaseUnits(MAX_UINT256.toString()))
  assert.ok(!isBaseUnits((MAX_UINT256 + 1n).toString()) && !isBaseUnits('01') && !isBaseUnits('1.5') && !isBaseUnits(5))
})

test('custom errors are recognised from revert data', () => {
  assert.equal(shopErrorName(`${functionSelector('SoldOut(uint256)')}${'0'.repeat(63)}1`), 'SoldOut')
  assert.equal(shopErrorName(functionSelector('EnforcedPause()')), 'EnforcedPause')
  assert.equal(shopErrorName('0xdeadbeef'), null)
  assert.equal(shopErrorName(undefined), null)
})
