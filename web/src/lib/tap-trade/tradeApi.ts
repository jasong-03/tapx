// Thin fetch() wrapper for the session-based trading API backend.

const BASE_URL = process.env.NEXT_PUBLIC_TRADE_API_URL || 'http://localhost:3001';

export interface SessionInfo {
  balance: number;
  totalDeposited: number;
  totalWithdrawn: number;
  activePosition: {
    poolKey: string;
    direction: 'long' | 'short';
    collateral: number;
    leverage: number;
    entryPrice: number;
    baseQuantity: number;
    tpPrice: number;
    slPrice: number;
    tpOrderId: string;
    slOrderId: string;
    openDigest: string;
    openedAt: number;
  } | null;
  depositCount: number;
}

export interface OpenTradeRequest {
  senderAddress: string;
  direction: 'long' | 'short';
  poolKey: string;
  collateral: number;
  leverage: number;
  currentPrice: number;
  tpPrice: number;
  slPrice: number;
}

export interface OpenTradeResponse {
  success: boolean;
  digest: string;
  entryPrice: number;
  baseQuantity: number;
  tpOrderId: string;
  slOrderId: string;
}

export interface HealthInfo {
  status: string;
  botAddress: string;
  network: string;
  marginManagerId: string;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  const json = await resp.json();

  if (!resp.ok) {
    throw new Error(json.error || `API error: ${resp.status}`);
  }

  return json as T;
}

export const tradeApi = {
  health(): Promise<HealthInfo> {
    return apiFetch('/api/health');
  },

  getSession(address: string): Promise<SessionInfo> {
    return apiFetch(`/api/session/${address}`);
  },

  confirmDeposit(params: { txDigest: string; amount: number; senderAddress: string }): Promise<{
    success: boolean;
    balance: number;
    credited: number;
  }> {
    return apiFetch('/api/deposit/confirm', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  openTrade(params: OpenTradeRequest): Promise<OpenTradeResponse> {
    return apiFetch('/api/trade/open', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  settleTrade(senderAddress: string): Promise<{ success: boolean; digest: string }> {
    return apiFetch('/api/trade/settle', {
      method: 'POST',
      body: JSON.stringify({ senderAddress }),
    });
  },

  closeTrade(senderAddress: string, currentPrice: number): Promise<{ success: boolean; digest: string }> {
    return apiFetch('/api/trade/close', {
      method: 'POST',
      body: JSON.stringify({ senderAddress, currentPrice }),
    });
  },

  withdraw(senderAddress: string, amount: number): Promise<{ success: boolean; amount: number }> {
    return apiFetch('/api/withdraw', {
      method: 'POST',
      body: JSON.stringify({ senderAddress, amount }),
    });
  },
};
