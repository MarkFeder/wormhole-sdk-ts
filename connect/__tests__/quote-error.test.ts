import { describe, expect, test } from "@jest/globals";
import { amount } from "@wormhole-foundation/sdk-base";

import { MinAmountError, QuoteError, UnavailableError } from "../src/routes/types.js";

describe("QuoteError", () => {
  test("carries a machine-readable code", () => {
    const err = new QuoteError("Boom", "something went wrong");

    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("Boom");
    expect(err.message).toBe("something went wrong");
    expect(err.name).toBe("QuoteError");
  });
});

describe("MinAmountError", () => {
  test("keeps the minimum amount and its code", () => {
    const min = amount.fromBaseUnits(1000n, 6);
    const err = new MinAmountError(min);

    expect(err).toBeInstanceOf(QuoteError);
    expect(err.code).toBe("MinAmount");
    expect(err.minAmount()).toBe(min);
  });
});

describe("UnavailableError", () => {
  test("wraps the internal error and its code", () => {
    const internal = new Error("rpc down");
    const err = new UnavailableError(internal);

    expect(err).toBeInstanceOf(QuoteError);
    expect(err.code).toBe("Unavailable");
    expect(err.internalError).toBe(internal);
    expect(err.message).toBe("Unable to fetch a quote");
  });
});
