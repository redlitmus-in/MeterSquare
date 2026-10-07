import { apiClient } from './config';

export interface AssistantTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantStatus {
  configured: boolean;
  guide_sections: number;
  role: string;
  suggestions: string[];
}

export interface AssistantAnswer {
  answer: string;
  sources: string[];
}

export const assistantApi = {
  async getStatus(): Promise<AssistantStatus> {
    const response = await apiClient.get('/assistant/status', { headers: { 'X-Skip-Cache': 'true' } });
    return response.data;
  },

  async ask(message: string, history: AssistantTurn[]): Promise<AssistantAnswer> {
    const response = await apiClient.post('/assistant/chat', { message, history }, { timeout: 60000 });
    return response.data;
  },
};

export default assistantApi;
