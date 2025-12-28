
export enum Role {
  USER = 'user',
  MODEL = 'model'
}

export type ReasoningMode = 'general' | 'math' | 'coding' | 'logic' | 'fengshui';

export interface Message {
  id: string;
  role: Role;
  text: string;
  reasoning?: string; // For DeepSeek reasoner content
  isStreaming?: boolean;
  timestamp: number;
  thinkingTime?: number; // Time to first token in ms
  mode?: ReasoningMode;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
}
