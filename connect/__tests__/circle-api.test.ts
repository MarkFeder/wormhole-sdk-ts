import { describe, expect, jest, test } from "@jest/globals";

// Mock axios before importing circle-api so the mocked module is in place
// The `mock` prefix is required for the factory to reference outer variables
const mockGet = jest.fn();
jest.unstable_mockModule("axios", () => ({
  __esModule: true,
  default: {
    get: mockGet,
    isAxiosError: (error: any) => error?.isAxiosError === true,
  },
}));

const { getCircleMessages, getCirclePublicKeys } = await import("../src/circle-api.js");

// Matches the config value used for Testnet in connect/src/config.ts
const API = "https://iris-api-sandbox.circle.com/v1/attestations";

describe("Circle API Tests", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  test("getCirclePublicKeys fetches from the /v1 root", async () => {
    const keys = ["0x04fc192351b97838713efbc63351e3b71607cc7fc0a74fadaa12d39a693713529bf"];
    mockGet.mockResolvedValue({ data: { publicKeys: keys } });

    await expect(getCirclePublicKeys(API)).resolves.toEqual(keys);
    expect(mockGet).toHaveBeenCalledWith("https://iris-api-sandbox.circle.com/v1/publicKeys");
  });

  test("getCircleMessages fetches message for domain and tx", async () => {
    const messages = [
      { message: "0x0000000000000005", attestation: "0xdc485fb2", eventNonce: "9682" },
    ];
    mockGet.mockResolvedValue({ data: { messages } });

    await expect(getCircleMessages(API, 0, "0xhash")).resolves.toEqual(messages);
    expect(mockGet).toHaveBeenCalledWith(
      "https://iris-api-sandbox.circle.com/v1/messages/0/0xhash",
    );
  });

  test("getCircleMessages returns null when no message is found", async () => {
    const error = Object.assign(new Error("not found"), {
      isAxiosError: true,
      response: { status: 404 },
    });
    mockGet.mockRejectedValue(error);

    await expect(getCircleMessages(API, 0, "0xhash")).resolves.toBeNull();
  });
});
