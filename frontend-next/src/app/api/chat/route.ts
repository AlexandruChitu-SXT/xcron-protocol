import { NextResponse } from 'next/server';

// XCRON-PROTECT: Secure API Boundary
const SECURITY = {
  VALID_PROTOCOLS: ['hatom', 'xexchange', 'ashswap'] as const,
  VALID_ACTIONS: ['auto-compound', 'claim-rewards', 'liquid-stake', 'swap'] as const,
  VALID_INTERVALS: ['daily', 'weekly', 'monthly'] as const,
  MAX_EGLD_AMOUNT: 1000,
  MIN_EGLD_AMOUNT: 0.001,
} as const;

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(all\s+)?above/i,
  /disregard\s+(all\s+)?previous/i,
  /forget\s+(all\s+)?(your\s+)?instructions/i,
  /new\s+instructions?\s*:/i,
  /system\s*:\s*/i,
  /\bprompt\s+injection\b/i,
  /reveal\s+(your\s+)?(system\s+)?prompt/i,
  /show\s+(me\s+)?(your\s+)?(system\s+)?prompt/i,
  /what\s+(are|is)\s+your\s+(system\s+)?prompt/i,
  /print\s+(your\s+)?instructions/i,
  /output\s+(your\s+)?instructions/i,
  /repeat\s+(your\s+)?(initial|system)\s+prompt/i,
  /act\s+as\s+(if\s+)?(you\s+)?(are|were)\s+a\s+different/i,
  /you\s+are\s+now\s+/i,
  /pretend\s+(you\s+)?(are|to\s+be)\s+/i,
  /jailbreak/i,
  /DAN\s+mode/i,
  /developer\s+mode\s+(enabled|on|active)/i,
] as const;

const detectPromptInjection = (text: string): boolean => {
  return INJECTION_PATTERNS.some(pattern => pattern.test(text));
};

const validateActionParams = (action: any): { valid: boolean; error?: string } => {
  if (action.name === 'schedule_task') {
    const { protocol, action: taskAction, interval, amount } = action.args;
    if (!SECURITY.VALID_PROTOCOLS.includes(protocol as any)) return { valid: false, error: 'Invalid protocol' };
    if (!SECURITY.VALID_ACTIONS.includes(taskAction as any)) return { valid: false, error: 'Invalid action' };
    if (!SECURITY.VALID_INTERVALS.includes(interval as any)) return { valid: false, error: 'Invalid interval' };
    
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < SECURITY.MIN_EGLD_AMOUNT || numAmount > SECURITY.MAX_EGLD_AMOUNT) {
      return { valid: false, error: `Amount must be between ${SECURITY.MIN_EGLD_AMOUNT} and ${SECURITY.MAX_EGLD_AMOUNT} EGLD` };
    }
  }
  return { valid: true };
};

export async function POST(req: Request) {
  try {
    const { engine, text, history } = await req.json();

    // SECURITY: Enforce Prompt Guard on the SERVER
    if (detectPromptInjection(text)) {
      return NextResponse.json({ error: " SECURITY ALERT: Prompt injection detected and blocked by XCron Firewall." }, { status: 403 });
    }

    if (engine === 'groq') {
      const groqKey = process.env.GROQ_API_KEY; 
      if (!groqKey) return NextResponse.json({ error: 'Server configuration error: Missing API Key' }, { status: 500 });

      const groqSystemPrompt = `You are XCron AI, a smart AI assistant built into XCron Protocol on MultiversX...`;

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: groqSystemPrompt },
            ...history.map((m: any) => ({ role: m.role === 'model' ? 'assistant' : m.role, content: m.content })),
            { role: 'user', content: text }
          ],
          temperature: 0.8,
          max_tokens: 1024,
          top_p: 0.95,
        }),
      });

      if (!res.ok) throw new Error(`Groq error: ${res.status}`);
      const data = await res.json();
      return NextResponse.json({ reply: data.choices?.[0]?.message?.content || '' });

    } else if (engine === 'gemini') {
      const devApiKey = process.env.GEMINI_API_KEY;
      if (!devApiKey) return NextResponse.json({ error: 'Server configuration error: Missing API Key' }, { status: 500 });

      const systemPrompt = `You are **XCron AI**, the most advanced DeFi automation assistant on MultiversX...`;

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${devApiKey}`,
        {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Referer': 'https://xcron.io'
          },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [
              ...history.map((m: any) => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }],
              })),
              { role: 'user', parts: [{ text }] }
            ],
            tools: [{ function_declarations: [
              {
                name: 'schedule_task',
                description: 'Schedule an automated DeFi task on XCron Protocol.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    protocol: { type: 'STRING', enum: ['hatom', 'xexchange', 'ashswap'] },
                    action: { type: 'STRING', enum: ['auto-compound', 'claim-rewards', 'liquid-stake', 'swap'] },
                    interval: { type: 'STRING', enum: ['daily', 'weekly', 'monthly'] },
                    amount: { type: 'STRING', description: 'EGLD amount (e.g. "0.05")' },
                  },
                  required: ['protocol', 'action', 'interval', 'amount'],
                },
              },
              {
                name: 'cancel_task',
                description: 'Cancel a scheduled task by ID.',
                parameters: { type: 'OBJECT', properties: { taskId: { type: 'STRING' } }, required: ['taskId'] },
              },
              {
                name: 'show_stats',
                description: 'Show protocol statistics.',
                parameters: { type: 'OBJECT', properties: {} },
              },
              {
                name: 'show_tasks',
                description: 'Show user transaction history.',
                parameters: { type: 'OBJECT', properties: {} },
              },
              {
                name: 'show_cross_shard',
                description: 'Show cross-shard optimization stats.',
                parameters: { type: 'OBJECT', properties: {} },
              },
            ] }],
            tool_config: { function_calling_config: { mode: 'AUTO' } },
            generation_config: { temperature: 0.8, max_output_tokens: 2048, top_p: 0.95 },
          }),
        }
      );

      if (!geminiRes.ok) throw new Error(`Gemini API error: ${geminiRes.status}`);
      const geminiData = await geminiRes.json();
      const candidate = geminiData.candidates?.[0];
      if (!candidate?.content?.parts) throw new Error('Empty response');

      let reply = '';
      let action = undefined;

      for (const part of candidate.content.parts) {
        if (part.text) reply += part.text;
        if (part.functionCall) {
          const proposedAction = {
            name: part.functionCall.name,
            args: part.functionCall.args,
          };
          const validation = validateActionParams(proposedAction);
          if (!validation.valid) {
            return NextResponse.json({ reply: ` Error de Seguridad: ${validation.error}. Por favor, ajusta los parámetros.` });
          }
          action = proposedAction;
        }
      }

      return NextResponse.json({ reply, action });
    }

    return NextResponse.json({ error: 'Invalid engine' }, { status: 400 });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
