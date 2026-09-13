import * as publicRpcMock from "./mocks/publicrpc.js"; // Should be first

import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { platform } from "@wormhole-foundation/sdk-base";
import { UniversalAddress } from "@wormhole-foundation/sdk-definitions";
import { mocks } from "@wormhole-foundation/sdk-definitions/testing";

// Dynamic import so the axios mock in ./mocks/publicrpc.js (registered via
// jest.unstable_mockModule) is in place before connect loads axios.
const { Wormhole, networkPlatformConfigs } = await import("./../src/index.js");
const { CircleTransfer } = await import("./../src/protocols/cctp/cctpTransfer.js");
const { getDestinationTx } = await import("./../src/whscan-api.js");
const { TransferState } = await import("./../src/types.js");

const network: "Testnet" = "Testnet";
type TNet = typeof network;
const allPlatformCtrs = platform.platforms.map((p) =>
  mocks.mockPlatformFactory(p, networkPlatformConfigs(network, p)),
) as any;

// Silence the unused-import warning for the axios mock: its side effect
// (registering the fetch mock) is all that matters.
void publicRpcMock;

describe("CircleTransfer.track destinationTxs", () => {
  let wh: Wormhole<TNet>;

  // A WormholeScan status that has already indexed the destination tx
  const statusWithDestTx = {
    id: "1",
    txHash: "0x" + "a".repeat(64),
    emitterChain: 2,
    emitterAddress: "0x" + "b".repeat(40),
    payload: {},
    standardizedProperties: {},
    globalTx: {
      id: "1",
      originTx: { txHash: "0x" + "a".repeat(64) },
      destinationTx: {
        chainId: 6, // Avalanche (Wormhole chain id)
        status: "completed",
        method: "redeem",
        txHash: "0x" + "d".repeat(64),
      },
    },
  };
  // Same transfer, but WormholeScan has not indexed the destination tx yet
  const statusWithoutDestTx = { ...statusWithDestTx, globalTx: undefined };

  beforeEach(() => {
    wh = new Wormhole(network, allPlatformCtrs);
  });

  function attestedReceipt(): any {
    return {
      from: "Ethereum",
      to: "Avalanche",
      state: TransferState.Attested,
      originTxs: [{ chain: "Ethereum", txid: "0x" + "a".repeat(64) }],
      attestation: {
        id: {
          chain: "Ethereum",
          emitter: new UniversalAddress("0x" + "00".repeat(32)),
          sequence: 1n,
        },
        attestation: {},
      },
    };
  }

  test("keeps the destination tx found via the API when the transfer completes", async () => {
    publicRpcMock.givenTransactionStatusSequence([statusWithDestTx]);
    const isCompleteSpy = jest
      .spyOn(CircleTransfer, "isTransferComplete")
      .mockResolvedValue(true);

    const results: any[] = [];
    for await (const r of CircleTransfer.track(wh, attestedReceipt(), 10 * 1000)) {
      results.push(r);
    }

    const final = results[results.length - 1];
    expect(final.state).toBe(TransferState.DestinationFinalized);
    expect(final.destinationTxs).toEqual([
      { chain: "Avalanche", txid: "0x" + "d".repeat(64) },
    ]);
    expect(isCompleteSpy).toHaveBeenCalledTimes(1);
  });

  test("recovers the destination tx at finalization when the API was late", async () => {
    publicRpcMock.givenTransactionStatusSequence([statusWithoutDestTx, statusWithDestTx]);
    jest.spyOn(CircleTransfer, "isTransferComplete").mockResolvedValue(true);

    const results: any[] = [];
    for await (const r of CircleTransfer.track(wh, attestedReceipt(), 10 * 1000)) {
      results.push(r);
    }

    const final = results[results.length - 1];
    expect(final.state).toBe(TransferState.DestinationFinalized);
    expect(final.destinationTxs).toEqual([
      { chain: "Avalanche", txid: "0x" + "d".repeat(64) },
    ]);
  });

  test("getDestinationTx maps the status to a TransactionId", async () => {
    publicRpcMock.givenTransactionStatusSequence([statusWithDestTx]);

    const txid = {
      chain: "Ethereum",
      emitter: new UniversalAddress("0x" + "00".repeat(32)),
      sequence: 1n,
    };
    await expect(getDestinationTx(wh.config.api, txid)).resolves.toEqual({
      chain: "Avalanche",
      txid: "0x" + "d".repeat(64),
    });
  });

  test("getDestinationTx returns undefined while the dest tx is not indexed", async () => {
    publicRpcMock.givenTransactionStatusSequence([statusWithoutDestTx]);

    const txid = {
      chain: "Ethereum",
      emitter: new UniversalAddress("0x" + "00".repeat(32)),
      sequence: 1n,
    };
    await expect(getDestinationTx(wh.config.api, txid)).resolves.toBeUndefined();
  });
});
