// In-memory per-user session/balance tracking for custodial grid trading.
// Acceptable for hackathon — not production-grade (no persistence).

export interface ActivePosition {
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
}

export interface DepositRecord {
  txDigest: string;
  amount: number;
  confirmedAt: number;
}

export interface BetRecord {
  betId: string;
  result: 'win' | 'loss';
  amount: number;
  recipient: string;
  txDigest: string;
  timestamp: number;
}

export interface UserSession {
  balance: number;
  totalDeposited: number;
  totalWithdrawn: number;
  totalLost: number;
  totalWon: number;
  activePosition: ActivePosition | null;
  deposits: DepositRecord[];
  bets: BetRecord[];
}

class SessionManager {
  private sessions = new Map<string, UserSession>();
  private confirmedDigests = new Set<string>();

  getSession(address: string): UserSession {
    let session = this.sessions.get(address);
    if (!session) {
      session = {
        balance: 0,
        totalDeposited: 0,
        totalWithdrawn: 0,
        totalLost: 0,
        totalWon: 0,
        activePosition: null,
        deposits: [],
        bets: [],
      };
      this.sessions.set(address, session);
    }
    return session;
  }

  creditDeposit(address: string, amount: number, txDigest: string): UserSession {
    if (this.confirmedDigests.has(txDigest)) {
      throw new Error('Deposit already confirmed');
    }
    this.confirmedDigests.add(txDigest);

    const session = this.getSession(address);
    session.balance += amount;
    session.totalDeposited += amount;
    session.deposits.push({
      txDigest,
      amount,
      confirmedAt: Date.now(),
    });
    return session;
  }

  debitForTrade(address: string, amount: number): void {
    const session = this.getSession(address);
    if (session.balance < amount) {
      throw new Error(`Insufficient session balance: have ${session.balance}, need ${amount}`);
    }
    if (session.activePosition) {
      throw new Error('Already have an active position. Close it first.');
    }
    session.balance -= amount;
  }

  setActivePosition(address: string, position: ActivePosition): void {
    const session = this.getSession(address);
    session.activePosition = position;
  }

  clearPosition(address: string, pnl: number): void {
    const session = this.getSession(address);
    // Return collateral + PnL to session balance
    const collateral = session.activePosition?.collateral ?? 0;
    session.balance += collateral + pnl;
    session.activePosition = null;
  }

  debitWithdrawal(address: string, amount: number): void {
    const session = this.getSession(address);
    if (session.balance < amount) {
      throw new Error(`Insufficient balance: have ${session.balance}, need ${amount}`);
    }
    if (session.activePosition) {
      throw new Error('Cannot withdraw while position is active');
    }
    session.balance -= amount;
    session.totalWithdrawn += amount;
  }

  recordWin(address: string, betId: string, payout: number, txDigest: string): BetRecord {
    const session = this.getSession(address);
    const record: BetRecord = {
      betId,
      result: 'win',
      amount: payout,
      recipient: address,
      txDigest,
      timestamp: Date.now(),
    };
    session.totalWon += payout;
    session.bets.push(record);
    return record;
  }

  recordLoss(address: string, betId: string, stake: number, houseAddress: string, txDigest: string): BetRecord {
    const session = this.getSession(address);
    const record: BetRecord = {
      betId,
      result: 'loss',
      amount: stake,
      recipient: houseAddress,
      txDigest,
      timestamp: Date.now(),
    };
    session.totalLost += stake;
    session.bets.push(record);
    return record;
  }

  hasActivePosition(address: string): boolean {
    return !!this.getSession(address).activePosition;
  }
}

export const sessionManager = new SessionManager();
