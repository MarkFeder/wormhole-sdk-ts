import { jest } from '@jest/globals';
import { AbiCoder, dataSlice } from 'ethers';
import { Wormhole } from '@wormhole-foundation/sdk-connect';
import { EvmCircleBridge } from '@wormhole-foundation/sdk-evm-cctp';

describe('EvmCircleBridge.getBurnLimit', () => {
  it('reads the per-message burn limit from the TokenMessenger', async () => {
    const BURN_LIMIT = 1_000_000_000n; // 1B USDC base units

    // Stub the provider: the only RPC call made is the static call to
    // burnLimitsPerMessage, which we answer with an encoded uint256.
    const provider = {
      _isProvider: true,
      call: jest.fn().mockResolvedValue(
        AbiCoder.defaultAbiCoder().encode(['uint256'], [BURN_LIMIT]),
      ),
    } as any;

    // Mainnet addresses (USDC, MessageTransmitter, TokenMessenger)
    const bridge = new EvmCircleBridge('Mainnet', 'Ethereum', provider, {
      cctp: {
        messageTransmitter: '0x0a992d191deec32afe36203ad87d7d289a007f26',
        tokenMessenger: '0xc4922d64a24675e16e1586e3e3aa56c06fabe907',
      },
    } as any);

    const limit = await bridge.getBurnLimit(
      Wormhole.chainAddress('Ethereum', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'),
    );
    expect(limit).toBe(BURN_LIMIT);

    // The token address is passed as the burnLimitsPerMessage argument
    // (strip the 4-byte function selector from the calldata)
    const callArgs = (provider.call as jest.Mock).mock.calls[0]![0];
    const [tokenArg] = AbiCoder.defaultAbiCoder().decode(['address'], dataSlice(callArgs.data, 4));
    expect(tokenArg).toBe(Wormhole.parseAddress('Ethereum', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48').toString());
  });
});
