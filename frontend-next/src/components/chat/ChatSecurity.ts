export const SECURITY = {
  MAX_INPUT_LENGTH: 500,
  MAX_MESSAGES_PER_MINUTE: 15,
  RATE_LIMIT_WINDOW_MS: 60_000,
  COOLDOWN_MS: 2_000,
  MAX_HISTORY_ITEMS: 50,
  MAX_MEMORY_SIZE_BYTES: 50_000,
  VALID_PROTOCOLS: ['hatom', 'xexchange', 'ashswap'] as const,
  VALID_ACTIONS: ['auto-compound', 'claim-rewards', 'liquid-stake', 'swap'] as const,
  VALID_INTERVALS: ['daily', 'weekly', 'monthly'] as const,
  MAX_EGLD_AMOUNT: 1000,
  MIN_EGLD_AMOUNT: 0.001,
  MAX_VOICE_DURATION_MS: 15_000,
} as const;

// ── Rate Limiter ──
export class ChatRateLimiter {
  private timestamps: number[] = [];

  canSend(): boolean {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < SECURITY.RATE_LIMIT_WINDOW_MS);
    return this.timestamps.length < SECURITY.MAX_MESSAGES_PER_MINUTE;
  }

  record(): void {
    this.timestamps.push(Date.now());
  }

  getRemainingCooldown(): number {
    if (this.timestamps.length === 0) return 0;
    const last = this.timestamps[this.timestamps.length - 1];
    const elapsed = Date.now() - last;
    return Math.max(0, SECURITY.COOLDOWN_MS - elapsed);
  }

  getMessagesRemaining(): number {
    const now = Date.now();
    const recent = this.timestamps.filter(t => now - t < SECURITY.RATE_LIMIT_WINDOW_MS);
    return Math.max(0, SECURITY.MAX_MESSAGES_PER_MINUTE - recent.length);
  }
}

// ── Input Sanitizer ──
export const sanitizeInput = (input: string): string => {
  let clean = input;

  // 1. Strip HTML tags
  clean = clean.replace(/<[^>]*>/g, '');

  // 2. Remove script injection patterns
  clean = clean.replace(/javascript\s*:/gi, '');
  clean = clean.replace(/on\w+\s*=/gi, '');
  clean = clean.replace(/data\s*:\s*text\/html/gi, '');

  // 3. Remove null bytes and control characters (except newlines)
  clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 4. Normalize unicode to prevent homograph attacks
  clean = clean.normalize('NFC');

  // 5. Enforce max length
  clean = clean.slice(0, SECURITY.MAX_INPUT_LENGTH);

  // 6. Trim whitespace
  clean = clean.trim();

  return clean;
};

// ── Function Call Argument Validator ──
export const validateFunctionArgs = (name: string, args: Record<string, string>): { valid: boolean; reason?: string } => {
  switch (name) {
    case 'schedule_task': {
      const { protocol, action, interval, amount } = args;

      // Validate protocol against whitelist
      if (protocol && !(SECURITY.VALID_PROTOCOLS as readonly string[]).includes(protocol.toLowerCase())) {
        return { valid: false, reason: `Unknown protocol: ${protocol}` };
      }

      // Validate action against whitelist
      if (action && !(SECURITY.VALID_ACTIONS as readonly string[]).includes(action.toLowerCase())) {
        return { valid: false, reason: `Unknown action: ${action}` };
      }

      // Validate interval against whitelist
      if (interval && !(SECURITY.VALID_INTERVALS as readonly string[]).includes(interval.toLowerCase())) {
        return { valid: false, reason: `Invalid interval: ${interval}` };
      }

      // Validate amount is a safe number
      if (amount) {
        const num = parseFloat(amount);
        if (isNaN(num) || num < SECURITY.MIN_EGLD_AMOUNT || num > SECURITY.MAX_EGLD_AMOUNT) {
          return { valid: false, reason: `Amount must be between ${SECURITY.MIN_EGLD_AMOUNT} and ${SECURITY.MAX_EGLD_AMOUNT} EGLD` };
        }
        // Check for scientific notation abuse
        if (/[eE]/.test(amount) || amount.includes('Infinity') || amount.includes('NaN')) {
          return { valid: false, reason: 'Invalid amount format' };
        }
      }
      return { valid: true };
    }

    case 'cancel_task': {
      const { taskId } = args;
      if (taskId) {
        const id = parseInt(taskId);
        if (isNaN(id) || id < 0 || id > 1_000_000 || String(id) !== taskId.trim()) {
          return { valid: false, reason: 'Invalid task ID' };
        }
      }
      return { valid: true };
    }

    case 'show_stats':
    case 'show_tasks':
    case 'show_cross_shard':
      return { valid: true }; // No args to validate

    default:
      return { valid: false, reason: `Unknown function: ${name}` };
  }
};

// ── Explorer Hash Sanitizer ──
export const sanitizeExplorerHash = (hash: string): string | null => {
  // MultiversX tx hashes are 64-char hex strings
  const cleaned = hash.replace(/[^a-fA-F0-9]/g, '');
  if (cleaned.length !== 64) return null;
  return cleaned;
};

// ── Memory Integrity Validator ──
export const validateMemory = (data: unknown): data is Record<string, unknown> => {
  if (!data || typeof data !== 'object') return false;
  const str = JSON.stringify(data);
  // Reject oversized memory (prevents localStorage bombing)
  if (str.length > SECURITY.MAX_MEMORY_SIZE_BYTES) return false;
  // Reject if contains script or HTML
  if (/<script|javascript:|on\w+=/i.test(str)) return false;
  return true;
};
