import * as publicRpcMock from "./mocks/publicrpc.js"; // Should be first

import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { platform } from "@wormhole-foundation/sdk-base";
import { mocks } from "@wormhole-foundation/sdk-definitions/testing";

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
