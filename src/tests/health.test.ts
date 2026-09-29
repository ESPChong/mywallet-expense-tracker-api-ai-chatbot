import { describe, it, expect } from 'vitest';
import { req } from './helpers';
import { GET as health } from '@/app/api/health/route';

describe('GET /api/health', () => {
  it('reports ok with database up, without authentication', async () => {
    const res = await health(req('GET', '/api/health'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.checks.database).toBe('up');
    expect(body.checks.chatbot).toBe('disabled'); // CHATBOT_LLM_DISABLED=true in tests
  });
});
