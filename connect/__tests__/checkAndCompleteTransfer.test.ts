import { describe, expect, jest, test } from "@jest/globals";
import { TransferState } from "../src/types.js";
import { checkAndCompleteTransfer } from "../src/routes/common.js";

// Tracking an attested transfer talks to the destination chain, so the stub
// takes a moment like a real route would
const TRACK_DELAY = 300;

// The retry loop only sleeps between attempts, so these tests fail with a
// clear error rather than hanging the suite if the budget is not honoured
const MAX_TRACK_CALLS = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A route stub whose track returns whatever receipt it was given, the way a
// route whose destination completion is not yet observable behaves.
function routeStub(handlers: Record<string, unknown>, trackDelay = TRACK_DELAY): any {
  const route: any = {
    trackCalls: 0,
    async *track(receipt: any) {
      if (++route.trackCalls > MAX_TRACK_CALLS) {
        throw new Error("track called too many times, timeout budget not honoured");
      }
      if (trackDelay > 0) await delay(trackDelay);
      yield receipt;
    },
    ...handlers,
  };
  return route;
}

const signer = {
  chain: () => "Avalanche",
  address: () => "0x" + "c".repeat(40),
} as any;

const logger = () => {};

function attestedReceipt(): any {
  return {
    from: "Ethereum",
    to: "Avalanche",
    state: TransferState.Attested,
    originTxs: [{ chain: "Ethereum", txid: "0x" + "a".repeat(64) }],
    attestation: { id: {}, attestation: {} },
  };
}

function redeemedReceipt(): any {
  return {
    ...attestedReceipt(),
    state: TransferState.DestinationInitiated,
    destinationTxs: [{ chain: "Avalanche", txid: "0x" + "b".repeat(64) }],
  };
}

function completedReceipt(): any {
  return { ...attestedReceipt(), state: TransferState.DestinationFinalized };
}

describe("checkAndCompleteTransfer", () => {
  test("does not submit a second completion for the same attestation", async () => {
    const complete = jest.fn(async () => redeemedReceipt());
    const route = routeStub({ complete });

    // Enough budget for one tracking retry
    const result = await checkAndCompleteTransfer(route, attestedReceipt(), signer, 3000, logger);

    expect(route.trackCalls).toBe(2);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.state).toBe(TransferState.DestinationInitiated);
  });

  test("stops retrying once the remaining budget is spent", async () => {
    const complete = jest.fn(async () => redeemedReceipt());
    // A fast track, so the budget is only spent by the wait between attempts
    const route = routeStub({ complete }, 0);

    // Less than the wait between attempts, so there is no budget to retry
    const result = await checkAndCompleteTransfer(route, attestedReceipt(), signer, 100, logger);

    expect(route.trackCalls).toBe(1);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.state).toBe(TransferState.DestinationInitiated);
  });

  test("keeps the receipt returned by finalize", async () => {
    const finalize = jest.fn(async () => completedReceipt());
    const route = routeStub({ finalize });

    const result = await checkAndCompleteTransfer(route, redeemedReceipt(), signer, 0, logger);

    expect(finalize).toHaveBeenCalledTimes(1);
    expect(result.state).toBe(TransferState.DestinationFinalized);
  });

  test("returns early without completing a finalized transfer", async () => {
    const complete = jest.fn();
    const route = routeStub({ complete });

    const result = await checkAndCompleteTransfer(route, completedReceipt(), signer, 0, logger);

    expect(complete).not.toHaveBeenCalled();
    expect(result.state).toBe(TransferState.DestinationFinalized);
  });
});
