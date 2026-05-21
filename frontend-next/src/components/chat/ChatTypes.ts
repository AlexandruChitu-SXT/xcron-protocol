export interface ChatMessage {
  id: string;
  role: 'user' | 'bot';
  content: string;
  timestamp: Date;
  action?: ActionCard;
  quickActions?: QuickAction[];
  isStreaming?: boolean;
}

export interface ActionCard {
  protocol: string;
  icon: string;
  color: string;
  description: string;
  details: { label: string; value: string }[];
  status: 'pending' | 'signing' | 'confirmed' | 'success' | 'failed';
  txHash?: string;
}

export interface QuickAction {
  label: string;
  value: string;
  icon?: string;
}

export interface ConversationState {
  intent: string | null;
  protocol: string | null;
  action: string | null;
  amount: string | null;
  interval: string | null;
  executions: number | null;
  awaitingField: string | null;
}

export interface CronMemory {
  lastWallet: string | null;
  lastProtocol: string | null;
  lastAction: string | null;
  totalInteractions: number;
  lastVisit: string;
  favoriteProtocol: string | null;
  txHistory: { hash: string; action: string; timestamp: string }[];
}
