import * as publicRpcMock from "./mocks/publicrpc.js"; // Should be first

import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { amount, platform } from "@wormhole-foundation/sdk-base";
import { mocks } from "@wormhole-foundation/sdk-definitions/testing";
import { MinAmountError } from "./../src/routes/types.js";

// Dynamic import so the axios mock in ./mocks/publicrpc.js (registered via
// jest.unstable_mockModule) is in place before connect loads axios.
const { Wormhole, networkPlatformConfigs } = await import("./../src/index.js");
const { AutomaticCCTPRoute } = await import("./../src/routes/cctp/automatic.js");
const { CircleTransfer } = await import("./../src/protocols/cctp/cctpTransfer.js");
const { TransferState } = await import("./../src/types.js");

const network: "Testnet" = "Testnet";
type TNet = typeof network;
const allPlatformCtrs = platform.platforms.map((p) =>
  mocks.mockPlatformFactory(p, networkPlatformConfigs(network, p)),
) as any;

// Silence the unused-import warning for the axios mock: its side effect
// (registering the fetch mock) is all that matters.
void publicRpcMock;

describe("AutomaticCCTPRoute.resume", () => {
  let wh: Wormhole<TNet>;
  let route: AutomaticCCTPRoute<TNet>;

  beforeEach(() => {
    wh = new Wormhole(network, allPlatformCtrs);
    route = new AutomaticCCTPRoute(wh);
  });

  test("rebuilds the receipt for an automatic transfer", async () => {
    const fromSpy = jest
      .spyOn(CircleTransfer, "from")
      .mockResolvedValue({ transfer: { automatic: true } } as any);
    const getReceiptSpy = jest
      .spyOn(CircleTransfer, "getReceipt")
      .mockReturnValue({
        from: "Ethereum",
        to: "Avalanche",
        state: TransferState.Attested,
      } as any);

    const txid = { chain: "Ethereum" as const, txid: "0xabc123" };
    await expect(route.resume(txid)).resolves.toEqual({
      from: "Ethereum",
      to: "Avalanche",
      state: TransferState.Attested,
    });

    // The source transaction must be used to reconstruct the transfer
    expect(fromSpy).toHaveBeenCalledWith(wh, txid, 10 * 1000);
    expect(getReceiptSpy).toHaveBeenCalledTimes(1);
  });

  test("throws when the resumed transfer is not automatic", async () => {
    jest
      .spyOn(CircleTransfer, "from")
      .mockResolvedValue({ transfer: { automatic: false } } as any);

    const txid = { chain: "Ethereum" as const, txid: "0xabc123" };
    await expect(route.resume(txid)).rejects.toThrow(
      "Can only resume automatic Circle transfers",
    );
  });
});

describe("AutomaticCCTPRoute.validate minimum amount", () => {
  let route: AutomaticCCTPRoute<"Testnet">;

  beforeEach(() => {
    const wh = new Wormhole("Testnet", allPlatformCtrs);
    route = new AutomaticCCTPRoute(wh);
  });

  // Regression for #711: a transfer where amount == relayer fee would revert
  // on-chain (nothing left to redeem). The SDK must reject it at validation.
  test("rejects a transfer whose amount equals the relayer fee", async () => {
    const request = {
      fromChain: {
        chain: "Ethereum",
        getAutomaticCircleBridge: async () => ({
          // $1.00 USDC relayer fee on 6-decimal USDC
          getRelayerFee: async () => 1_000_000n,
        }),
      },
      toChain: { chain: "Avalanche" },
      parseAmount: (amt: string) => amount.parse(amt, 6),
      amountFromBaseUnits: (units: bigint) => amount.fromBaseUnits(units, 6),
    } as any;

    const result = await route.validate(request, { amount: "1" } as any); // 1.00 USDC

    expect(result.valid).toBe(false);
    expect(result.error).toBeInstanceOf(MinAmountError);
  });

  test("accepts a transfer above the minimum amount", async () => {
    const request = {
      fromChain: {
        chain: "Ethereum",
        getAutomaticCircleBridge: async () => ({
          getRelayerFee: async () => 1_000_000n,
        }),
      },
      toChain: { chain: "Avalanche" },
      parseAmount: (amt: string) => amount.parse(amt, 6),
      amountFromBaseUnits: (units: bigint) => amount.fromBaseUnits(units, 6),
    } as any;

    // minAmount is fee * 1.05 = 1.05 USDC, so 1.50 USDC is valid
    const result = await route.validate(request, { amount: "1.5" } as any);

    expect(result.valid).toBe(true);
  });
});
