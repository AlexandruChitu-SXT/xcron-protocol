export const callGroq = async (text: string, history: { role: string; content: string }[]): Promise<string> => {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ engine: 'groq', text, history }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || `Server error: ${res.status}`);
  }
  const data = await res.json();
  return data.reply || '';
};

export const callGemini = async (text: string, history: { role: string; content: string }[]): Promise<{
  reply: string; action?: { name: string; args: Record<string, string> };
}> => {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ engine: 'gemini', text, history }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || `Server error: ${res.status}`);
  }
  const data = await res.json();
  return { reply: data.reply || '', action: data.action };
};
export const DEFI_INTENTS = /\b(schedule|auto[- ]?compound|claim|stake|swap|cancel|hatom|xexchange|ashswap|stats|tasks|show|defi|egld|yield|farm|apy|compound|deposit|withdraw|borrow|lend|keeper|cron|shard|slashing)\b/i;
