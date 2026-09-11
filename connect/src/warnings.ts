export type DestinationCapacityWarning = {
  type: "DestinationCapacityWarning";
  delayDurationSec?: number;
};

export type GovernorLimitWarning = {
  type: "GovernorLimitWarning";
  reason: "ExceedsRemainingNotional" | "ExceedsLargeTransferLimit";
};

export type BurnLimitWarning = {
  type: "BurnLimitWarning";
  burnLimit: bigint;
};

export type QuoteWarning = DestinationCapacityWarning | GovernorLimitWarning | BurnLimitWarning;
