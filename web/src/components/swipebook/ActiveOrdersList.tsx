"use client"

import { cn } from '@/lib/utils';
import type { ActiveOrder } from '@/lib/deepbook/orderTypes';

interface ActiveOrdersListProps {
  orders: ActiveOrder[];
  onCancelOrder?: (orderId: string) => void;
  isLoading?: boolean;
  isCancelling?: boolean;
}

function getStatusColor(status: ActiveOrder['status']): string {
  switch (status) {
    case 'open':
      return 'bg-blue-500/20 text-blue-400';
    case 'partial':
      return 'bg-yellow-500/20 text-yellow-400';
    case 'filled':
      return 'bg-green-500/20 text-green-400';
    case 'cancelled':
      return 'bg-slate-500/20 text-slate-400';
    default:
      return 'bg-slate-500/20 text-slate-400';
  }
}

function getStatusLabel(status: ActiveOrder['status']): string {
  switch (status) {
    case 'open':
      return 'Open';
    case 'partial':
      return 'Partial';
    case 'filled':
      return 'Filled';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

function OrderRow({
  order,
  onCancel,
  isCancelling,
}: {
  order: ActiveOrder;
  onCancel?: (orderId: string) => void;
  isCancelling?: boolean;
}) {
  const fillPercent = order.quantity > 0 ? (order.filled / order.quantity) * 100 : 0;
  const canCancel = order.status === 'open' || order.status === 'partial';

  return (
    <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "px-2 py-0.5 rounded text-xs font-medium",
              order.side === 'buy'
                ? "bg-green-500/20 text-green-400"
                : "bg-red-500/20 text-red-400"
            )}
          >
            {order.side.toUpperCase()}
          </span>
          <span className={cn("px-2 py-0.5 rounded text-xs font-medium", getStatusColor(order.status))}>
            {getStatusLabel(order.status)}
          </span>
        </div>
        <span className="text-xs text-slate-500">
          {formatTimestamp(order.createdAt)}
        </span>
      </div>

      {/* Order details */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-slate-400">Price</span>
          <p className="font-medium text-white">
            ${order.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
          </p>
        </div>
        <div>
          <span className="text-slate-400">Quantity</span>
          <p className="font-medium text-white">
            {order.quantity.toLocaleString(undefined, { maximumFractionDigits: 6 })}
          </p>
        </div>
      </div>

      {/* Fill progress */}
      {(order.status === 'open' || order.status === 'partial') && (
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Filled</span>
            <span>{fillPercent.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${fillPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Cancel button */}
      {canCancel && onCancel && (
        <button
          onClick={() => onCancel(order.orderId)}
          disabled={isCancelling}
          className={cn(
            "w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors",
            "bg-red-500/10 text-red-400 hover:bg-red-500/20",
            isCancelling && "opacity-50 cursor-not-allowed"
          )}
        >
          {isCancelling ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full" />
              Cancelling...
            </span>
          ) : (
            'Cancel Order'
          )}
        </button>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-16 h-16 mb-4 rounded-full bg-slate-800 flex items-center justify-center">
        <svg
          className="w-8 h-8 text-slate-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-white mb-1">No Active Orders</h3>
      <p className="text-sm text-slate-400">
        Your limit orders will appear here
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-slate-800/50 rounded-lg p-4 animate-pulse">
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-2">
              <div className="h-5 w-12 bg-slate-700 rounded" />
              <div className="h-5 w-16 bg-slate-700 rounded" />
            </div>
            <div className="h-4 w-16 bg-slate-700 rounded" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="h-3 w-12 bg-slate-700 rounded mb-2" />
              <div className="h-5 w-20 bg-slate-700 rounded" />
            </div>
            <div>
              <div className="h-3 w-16 bg-slate-700 rounded mb-2" />
              <div className="h-5 w-24 bg-slate-700 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ActiveOrdersList({
  orders,
  onCancelOrder,
  isLoading = false,
  isCancelling = false,
}: ActiveOrdersListProps) {
  if (isLoading) {
    return <LoadingState />;
  }

  if (orders.length === 0) {
    return <EmptyState />;
  }

  // Separate orders by status
  const activeOrders = orders.filter(
    (o) => o.status === 'open' || o.status === 'partial'
  );
  const completedOrders = orders.filter(
    (o) => o.status === 'filled' || o.status === 'cancelled'
  );

  return (
    <div className="space-y-6">
      {/* Active Orders */}
      {activeOrders.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-slate-400 mb-3">
            Active Orders ({activeOrders.length})
          </h3>
          <div className="space-y-3">
            {activeOrders.map((order) => (
              <OrderRow
                key={order.orderId}
                order={order}
                onCancel={onCancelOrder}
                isCancelling={isCancelling}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed Orders */}
      {completedOrders.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-slate-400 mb-3">
            Recent Orders ({completedOrders.length})
          </h3>
          <div className="space-y-3">
            {completedOrders.map((order) => (
              <OrderRow key={order.orderId} order={order} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact version for sidebar or widget display
 */
export function ActiveOrdersCompact({
  orders,
  onCancelOrder,
  maxDisplay = 3,
}: {
  orders: ActiveOrder[];
  onCancelOrder?: (orderId: string) => void;
  maxDisplay?: number;
}) {
  const activeOrders = orders
    .filter((o) => o.status === 'open' || o.status === 'partial')
    .slice(0, maxDisplay);

  if (activeOrders.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-slate-500">
        No active orders
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {activeOrders.map((order) => (
        <div
          key={order.orderId}
          className="flex items-center justify-between p-2 bg-slate-800/30 rounded-lg"
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                order.side === 'buy' ? "bg-green-400" : "bg-red-400"
              )}
            />
            <span className="text-xs text-white font-medium">
              ${order.price.toFixed(2)}
            </span>
            <span className="text-xs text-slate-500">
              x{order.quantity.toFixed(2)}
            </span>
          </div>
          {onCancelOrder && (
            <button
              onClick={() => onCancelOrder(order.orderId)}
              className="text-xs text-slate-400 hover:text-red-400 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      ))}
      {orders.filter((o) => o.status === 'open' || o.status === 'partial').length >
        maxDisplay && (
        <div className="text-center text-xs text-slate-500">
          +{orders.filter((o) => o.status === 'open' || o.status === 'partial').length - maxDisplay} more
        </div>
      )}
    </div>
  );
}
