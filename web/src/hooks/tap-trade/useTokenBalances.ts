/**
 * Hook for fetching and formatting token balances
 */
import { useUserBalance } from '@/hooks/useUserBalance'
import { formatTokenAmount } from '@/lib/tap-trade/formatters'
import type { Pool } from '@/lib/swipebook/types'

export function useTokenBalances(pool: Pool) {
  const {
    data: quoteBalanceData,
    isLoading: quoteLoading
  } = useUserBalance(pool.quoteType)

  const {
    data: baseBalanceData,
    isLoading: baseLoading
  } = useUserBalance(pool.baseType)

  const quoteBalance = quoteBalanceData
    ? formatTokenAmount(Number(quoteBalanceData.totalBalance), pool.quoteDecimals)
    : 0

  const baseBalance = baseBalanceData
    ? formatTokenAmount(Number(baseBalanceData.totalBalance), pool.baseDecimals)
    : 0

  return {
    quoteBalance,
    baseBalance,
    isLoading: quoteLoading || baseLoading,
  }
}
