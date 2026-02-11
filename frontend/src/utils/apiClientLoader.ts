// ─── Shared lazy apiClient getter (avoids circular imports) ────────────
let _apiClient: any = null;

export async function getApiClient() {
  if (!_apiClient) {
    try {
      const mod = await import('@/api/config');
      _apiClient = mod.apiClient || (mod as any).default;
    } catch {
      const axiosMod = await import('axios');
      _apiClient = axiosMod.default;
    }
  }
  return _apiClient!;
}
