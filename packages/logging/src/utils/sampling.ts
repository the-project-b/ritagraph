/**
 * Sampling utilities for performance optimization
 */

/**
 * Check if an event should be sampled based on the sample rate
 * @param sampleRate - Rate between 0 and 1, where 1 means log everything
 * @returns true if the event should be logged
 */
export function shouldSample(sampleRate: number): boolean {
  // Always log if sample rate is 1 or higher
  if (sampleRate >= 1) {
    return true;
  }

  // Never log if sample rate is 0 or lower
  if (sampleRate <= 0) {
    return false;
  }

  // Random sampling for rates between 0 and 1
  return Math.random() < sampleRate;
}

/**
 * Parse sample rate from string
 * @param value - String value to parse
 * @returns Normalized sample rate between 0 and 1
 */
export function parseSampleRate(value?: string): number {
  if (!value) return 1; // Default to logging everything

  const rate = parseFloat(value);
  if (isNaN(rate)) return 1;

  // Clamp between 0 and 1
  return Math.max(0, Math.min(1, rate));
}
