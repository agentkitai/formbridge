import { describe, it, expect } from 'vitest';
import { version } from '../index';

describe('@formbridge/core', () => {
  it('should export version', () => {
    expect(version).toBeDefined();
    expect(typeof version).toBe('string');
  });

  it('should have correct version format', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
