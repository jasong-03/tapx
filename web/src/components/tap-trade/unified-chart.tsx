"use client"

import type React from "react"
import { useEffect, useRef, useState, useCallback } from "react"
import { calculateMultiplier, formatMultiplier, calculateLeveragedMultiplier } from "@/lib/tap-trade/multipliers"
import type { PriceTick } from "@/lib/tap-trade/binance"
import type { Bet } from "@/lib/tap-trade/betting"
import type { PredictionMode, PredictionRound, QuickTradeState } from "@/context/SwipeBookContext"
import { calculateLiquidationPrice } from "@/lib/deepbook/margin-config"

interface UnifiedChartProps {
  priceHistory: PriceTick[]
  currentPrice: number | null
  rows: number
  cols: number
  priceStep: number
  timeStepMs: number
  historyWindowMs: number
  bets: Bet[]
  canBuy?: boolean
  canSell?: boolean
  onCellClick: (
    row: number,
    col: number,
    priceMin: number,
    priceMax: number,
    expiresAt: number,
    betStartTime: number,
    multiplier: number,
    absolutePrice: number,
  ) => void
  // Margin overlay props
  activePrediction?: PredictionRound | null
  quickTradeState?: QuickTradeState
  // Grid mode props
  predictionMode?: PredictionMode
  selectedLeverage?: number
}

interface HitAnimation {
  betId: string
  x: number
  y: number
  startTime: number
  won: boolean
}

export function UnifiedChart({
  priceHistory,
  currentPrice,
  rows,
  cols,
  priceStep,
  timeStepMs,
  historyWindowMs,
  bets,
  canBuy = true,
  canSell = true,
  onCellClick,
  activePrediction,
  quickTradeState,
  predictionMode = 'quick',
  selectedLeverage = 2,
}: UnifiedChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)
  const twinklePhaseRef = useRef(0)
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number; absolutePrice: number } | null>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  const hitAnimationsRef = useRef<HitAnimation[]>([])
  const animatedBetsRef = useRef<Set<string>>(new Set())

  const displayPriceRef = useRef<number | null>(null)

  const extraRows = 4
  const baseHalfRows = Math.floor(rows / 2)
  const totalVisibleRows = rows + extraRows * 2
  // Responsive padding: smaller on narrow screens
  const isMobile = dimensions.width > 0 && dimensions.width < 500
  const padding = isMobile
    ? { top: 8, right: 58, bottom: 24, left: 12 }
    : { top: 30, right: 80, bottom: 40, left: 80 }

  const totalTimeMs = historyWindowMs + cols * timeStepMs
  const futureTimeMs = cols * timeStepMs

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (dimensions.width === 0) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let isActive = true

    const draw = () => {
      if (!isActive) return

      const dpr = window.devicePixelRatio || 1
      canvas.width = dimensions.width * dpr
      canvas.height = dimensions.height * dpr
      canvas.style.width = `${dimensions.width}px`
      canvas.style.height = `${dimensions.height}px`
      ctx.scale(dpr, dpr)

      ctx.clearRect(0, 0, dimensions.width, dimensions.height)

      const chartWidth = dimensions.width - padding.left - padding.right
      const chartHeight = dimensions.height - padding.top - padding.bottom

      const now = Date.now()

      if (!currentPrice) {
        animationRef.current = requestAnimationFrame(draw)
        return
      }

      if (displayPriceRef.current === null) {
        displayPriceRef.current = currentPrice
      } else {
        const diff = currentPrice - displayPriceRef.current
        displayPriceRef.current += diff * 0.08
        // Snap threshold proportional to price (0.0001% of price)
        if (Math.abs(diff) < currentPrice * 0.000001) {
          displayPriceRef.current = currentPrice
        }
      }

      const centerPrice = displayPriceRef.current

      const halfRange = (totalVisibleRows / 2) * priceStep
      const minPrice = centerPrice - halfRange
      const maxPrice = centerPrice + halfRange
      const priceRange = maxPrice - minPrice

      const minTime = now - historyWindowMs
      const nowX = padding.left + (historyWindowMs / totalTimeMs) * chartWidth

      const currentSlotStart = Math.floor(now / timeStepMs) * timeStepMs
      const slotProgress = (now - currentSlotStart) / timeStepMs

      const gridWidth = (futureTimeMs / totalTimeMs) * chartWidth
      const cellWidth = gridWidth / cols
      // cellHeight available: (priceStep / priceRange) * chartHeight

      const getX = (timestamp: number) => {
        const slotsFromCurrent = (timestamp - currentSlotStart) / timeStepMs
        return nowX + slotsFromCurrent * cellWidth - slotProgress * cellWidth
      }

      const priceToY = (price: number) => {
        return padding.top + ((maxPrice - price) / priceRange) * chartHeight
      }

      const lowestGridPrice = Math.floor(minPrice / priceStep) * priceStep
      const highestGridPrice = Math.ceil(maxPrice / priceStep) * priceStep

      // Draw horizontal grid lines at absolute price levels (cell borders)
      ctx.strokeStyle = "rgba(255, 100, 200, 0.08)"
      ctx.lineWidth = 1

      for (let price = lowestGridPrice; price <= highestGridPrice; price += priceStep) {
        const y = priceToY(price)
        if (y >= padding.top - 10 && y <= padding.top + chartHeight + 10) {
          ctx.beginPath()
          ctx.moveTo(padding.left, y)
          ctx.lineTo(dimensions.width - padding.right, y)
          ctx.stroke()
        }
      }

      // History vertical grid lines
      ctx.strokeStyle = "rgba(255, 100, 200, 0.06)"
      for (let i = 0; i <= 6; i++) {
        const x = padding.left + ((i * 10000) / totalTimeMs) * chartWidth
        if (x < nowX) {
          ctx.beginPath()
          ctx.moveTo(x, padding.top)
          ctx.lineTo(x, padding.top + chartHeight)
          ctx.stroke()
        }
      }

      // Future vertical grid lines (grid mode only)
      if (predictionMode === 'grid') {
        ctx.strokeStyle = "rgba(255, 100, 200, 0.15)"
        for (let i = 0; i <= cols + 1; i++) {
          const slotTime = currentSlotStart + i * timeStepMs
          const x = getX(slotTime)
          if (x >= nowX - 2 && x <= dimensions.width - padding.right + 2) {
            ctx.beginPath()
            ctx.moveTo(x, padding.top)
            ctx.lineTo(x, padding.top + chartHeight)
            ctx.stroke()
          }
        }

        // Twinkle dots at intersections
        twinklePhaseRef.current += 0.02
        let twinkleIndex = 0
        for (let price = lowestGridPrice; price <= highestGridPrice; price += priceStep) {
          const y = priceToY(price)
          if (y < padding.top - 5 || y > padding.top + chartHeight + 5) continue

          for (let col = 0; col <= cols + 1; col++) {
            const slotTime = currentSlotStart + col * timeStepMs
            const x = getX(slotTime)

            if (x >= nowX - 5 && x <= dimensions.width - padding.right + 5) {
              const twinkle = Math.sin(twinklePhaseRef.current + twinkleIndex * 0.3 + col * 0.5) * 0.3 + 0.5
              ctx.beginPath()
              ctx.arc(x, y, 2, 0, Math.PI * 2)
              ctx.fillStyle = `rgba(255, 150, 220, ${twinkle * 0.5})`
              ctx.fill()
            }
            twinkleIndex++
          }
        }
      }

      // Draw multipliers in grid cells (only in grid mode)
      if (predictionMode === 'grid') {
        ctx.font = isMobile ? "9px monospace" : "11px monospace"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"

        const MIN_BET_LEAD_TIME_MS = 5000

        for (let price = lowestGridPrice; price < highestGridPrice; price += priceStep) {
          const cellCenterPrice = price + priceStep / 2
          const cellTopY = priceToY(price + priceStep)
          const cellBottomY = priceToY(price)
          const cellCenterY = (cellTopY + cellBottomY) / 2

          if (cellCenterY < padding.top - 20 || cellCenterY > padding.top + chartHeight + 20) continue

          for (let col = 0; col < cols; col++) {
            const slotTime = currentSlotStart + col * timeStepMs
            const cellLeftX = getX(slotTime)
            const cellCenterX = cellLeftX + cellWidth / 2

            if (cellCenterX >= nowX && cellCenterX <= dimensions.width - padding.right) {
              const isTooClose = slotTime - now < MIN_BET_LEAD_TIME_MS

              const isHovered =
                hoveredCell &&
                Math.abs(hoveredCell.absolutePrice - cellCenterPrice) < priceStep / 2 &&
                hoveredCell.col === col

              // Determine if this cell's direction is affordable
              const isBuyCell = cellCenterPrice >= (currentPrice ?? 0)
              const isAffordable = isBuyCell ? canBuy : canSell

              if (!isTooClose && isAffordable) {
                // Grid mode: direction-based colored cells
                const direction = cellCenterPrice > (currentPrice ?? 0) ? 'long' : 'short';
                const leveragedMult = calculateLeveragedMultiplier(
                  currentPrice ?? 1,
                  cellCenterPrice,
                  selectedLeverage,
                );
                const intensity = Math.min(leveragedMult / 30, 1);
                const alpha = (0.1 + intensity * 0.4).toFixed(2);

                if (direction === 'long') {
                  ctx.fillStyle = `rgba(0, 255, 136, ${alpha})`;
                } else {
                  ctx.fillStyle = `rgba(255, 68, 68, ${alpha})`;
                }

                // Fill cell background
                const cellTopY2 = priceToY(price + priceStep);
                const cellBottomY2 = priceToY(price);
                const cellLeftX2 = getX(currentSlotStart + col * timeStepMs);
                ctx.fillRect(cellLeftX2, cellTopY2, cellWidth, cellBottomY2 - cellTopY2);

                // Multiplier label
                if (leveragedMult >= 1) {
                  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
                  ctx.font = isMobile ? "8px monospace" : "10px monospace";
                  ctx.textAlign = "center";
                  ctx.textBaseline = "middle";
                  ctx.fillText(`${leveragedMult.toFixed(1)}%`, cellCenterX, cellCenterY);
                }

                // Hover highlight for grid mode
                if (isHovered) {
                  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
                  ctx.lineWidth = 1.5;
                  const cellTopY3 = priceToY(price + priceStep);
                  const cellBottomY3 = priceToY(price);
                  const cellLeftX3 = getX(currentSlotStart + col * timeStepMs);
                  ctx.strokeRect(cellLeftX3, cellTopY3, cellWidth, cellBottomY3 - cellTopY3);
                }
              }
            }
          }
        }
      }

      // Draw price history line with smooth Catmull-Rom spline
      const visibleHistory = priceHistory.filter((t) => t.timestamp >= minTime - 5000)

      if (visibleHistory.length >= 2) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(padding.left, padding.top, chartWidth, chartHeight)
        ctx.clip()

        // Build raw screen points from price data
        const rawPoints = visibleHistory.map((t) => ({
          x: padding.left + ((t.timestamp - minTime) / totalTimeMs) * chartWidth,
          y: priceToY(t.price),
          price: t.price,
        }))

        // Add interpolated "now" point for smooth connection to price dot
        if (displayPriceRef.current !== null) {
          rawPoints.push({
            x: nowX,
            y: priceToY(displayPriceRef.current),
            price: displayPriceRef.current,
          })
        }

        // Deduplicate flat segments: keep first/last of each constant-price run
        // This lets the spline create smooth S-curves at transitions
        const screenPoints: { x: number; y: number }[] = []
        for (let i = 0; i < rawPoints.length; i++) {
          const isFirst = i === 0
          const isLast = i === rawPoints.length - 1
          const priceChanged = i > 0 && rawPoints[i].price !== rawPoints[i - 1].price
          const nextChanges = i < rawPoints.length - 1 && rawPoints[i].price !== rawPoints[i + 1].price
          if (isFirst || isLast || priceChanged || nextChanges) {
            screenPoints.push({ x: rawPoints[i].x, y: rawPoints[i].y })
          }
        }

        if (screenPoints.length < 2) {
          ctx.restore()
        } else {
          // Catmull-Rom spline: smooth curve that passes through every point
          const drawSpline = (pts: { x: number; y: number }[]) => {
            ctx.moveTo(pts[0].x, pts[0].y)
            if (pts.length === 2) {
              ctx.lineTo(pts[1].x, pts[1].y)
              return
            }
            for (let i = 0; i < pts.length - 1; i++) {
              const p0 = pts[Math.max(0, i - 1)]
              const p1 = pts[i]
              const p2 = pts[i + 1]
              const p3 = pts[Math.min(pts.length - 1, i + 2)]
              const cp1x = p1.x + (p2.x - p0.x) / 6
              const cp1y = p1.y + (p2.y - p0.y) / 6
              const cp2x = p2.x - (p3.x - p1.x) / 6
              const cp2y = p2.y - (p3.y - p1.y) / 6
              ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y)
            }
          }

          const firstPt = screenPoints[0]
          const lastPt = screenPoints[screenPoints.length - 1]

          // Gradient fill under the curve
          const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight)
          gradient.addColorStop(0, "rgba(255, 100, 200, 0.12)")
          gradient.addColorStop(1, "rgba(255, 100, 200, 0)")

          ctx.beginPath()
          drawSpline(screenPoints)
          ctx.lineTo(lastPt.x, padding.top + chartHeight)
          ctx.lineTo(firstPt.x, padding.top + chartHeight)
          ctx.closePath()
          ctx.fillStyle = gradient
          ctx.fill()

          // Stroke the line
          const lineGradient = ctx.createLinearGradient(firstPt.x, 0, lastPt.x, 0)
          lineGradient.addColorStop(0, "rgba(255, 100, 200, 0.3)")
          lineGradient.addColorStop(0.7, "rgba(255, 100, 200, 0.7)")
          lineGradient.addColorStop(1, "rgba(255, 220, 255, 1)")

          ctx.beginPath()
          drawSpline(screenPoints)
          ctx.strokeStyle = lineGradient
          ctx.lineWidth = 2.5
          ctx.lineCap = "round"
          ctx.lineJoin = "round"
          ctx.stroke()

          ctx.restore()
        }
      }

      for (const bet of bets) {
        const betStartTime = bet.betStartTime
        const betEndTime = bet.expiresAt

        const betLeftX = getX(betStartTime)
        const betRightX = getX(betEndTime)

        if (betRightX < padding.left - 100) continue
        if (betLeftX > dimensions.width - padding.right + 100) continue

        const betTopY = priceToY(bet.priceMax)
        const betBottomY = priceToY(bet.priceMin)

        if (betBottomY < padding.top - 50 || betTopY > padding.top + chartHeight + 50) continue

        // Trigger win animation
        if (bet.status === "won" && bet.hitAt && !animatedBetsRef.current.has(bet.id)) {
          animatedBetsRef.current.add(bet.id)
          const hitX = getX(bet.hitAt)
          const lastTick = priceHistory.find((t) => t.timestamp >= bet.hitAt!) || priceHistory[priceHistory.length - 1]
          const hitY = lastTick ? priceToY(lastTick.price) : betTopY + (betBottomY - betTopY) / 2
          hitAnimationsRef.current.push({
            betId: bet.id,
            x: Math.max(padding.left, Math.min(dimensions.width - padding.right, hitX)),
            y: Math.max(padding.top, Math.min(padding.top + chartHeight, hitY)),
            startTime: now,
            won: true,
          })
        }

        const tilePadding = 3
        const tileX = betLeftX + tilePadding
        const tileY = betTopY + tilePadding
        const tileW = Math.max(10, betRightX - betLeftX - tilePadding * 2)
        const tileH = Math.max(10, betBottomY - betTopY - tilePadding * 2)

        if (bet.status === "won") {
          ctx.shadowColor = "rgba(100, 255, 150, 0.9)"
          ctx.shadowBlur = 20
          const wonGradient = ctx.createLinearGradient(tileX, tileY, tileX + tileW, tileY + tileH)
          wonGradient.addColorStop(0, "#4ade80")
          wonGradient.addColorStop(1, "#22c55e")
          ctx.fillStyle = wonGradient
        } else if (bet.status === "lost") {
          ctx.shadowColor = "rgba(255, 100, 100, 0.3)"
          ctx.shadowBlur = 5
          ctx.fillStyle = "rgba(239, 68, 68, 0.4)"
        } else {
          ctx.shadowColor = "rgba(180, 255, 100, 0.6)"
          ctx.shadowBlur = 10
          const openGradient = ctx.createLinearGradient(tileX, tileY, tileX + tileW, tileY + tileH)
          openGradient.addColorStop(0, "rgba(180, 255, 100, 0.9)")
          openGradient.addColorStop(1, "rgba(255, 230, 80, 0.8)")
          ctx.fillStyle = openGradient
        }

        ctx.beginPath()
        ctx.roundRect(tileX, tileY, tileW, tileH, 6)
        ctx.fill()
        ctx.shadowBlur = 0

        // Adaptive text rendering based on tile size
        const centerX = tileX + tileW / 2
        const centerY = tileY + tileH / 2
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"

        if (tileW > 20 && tileH > 40) {
          // Large tile: three lines — status, stake, multiplier
          const textColor = bet.status === "lost" ? "rgba(255, 255, 255, 0.6)" : "#000"
          if (bet.status === "won") {
            ctx.fillStyle = "#000"
            ctx.font = "bold 11px sans-serif"
            ctx.fillText("WIN!", centerX, centerY - 12)
            ctx.fillStyle = "#000"
            ctx.font = "bold 10px sans-serif"
            ctx.fillText(`+$${(bet.stake * bet.multiplier).toFixed(1)}`, centerX, centerY + 2)
            ctx.font = "9px monospace"
            ctx.fillText(formatMultiplier(bet.multiplier), centerX, centerY + 14)
          } else if (bet.status === "lost") {
            ctx.fillStyle = "rgba(255, 255, 255, 0.7)"
            ctx.font = "bold 11px sans-serif"
            ctx.fillText("LOST", centerX, centerY - 8)
            ctx.font = "9px monospace"
            ctx.fillStyle = "rgba(255, 255, 255, 0.5)"
            ctx.fillText(`-$${bet.stake}`, centerX, centerY + 6)
          } else {
            ctx.fillStyle = textColor
            ctx.font = "bold 11px sans-serif"
            ctx.fillText(`$${bet.stake}`, centerX, centerY - 6)
            ctx.font = "9px monospace"
            ctx.fillText(formatMultiplier(bet.multiplier), centerX, centerY + 8)
          }
        } else if (tileW > 16 && tileH > 14) {
          // Small tile: one or two lines
          if (bet.status === "won") {
            ctx.fillStyle = "#000"
            ctx.font = "bold 9px sans-serif"
            ctx.fillText("WIN!", centerX, tileH > 24 ? centerY - 5 : centerY)
            if (tileH > 24) {
              ctx.font = "8px monospace"
              ctx.fillText(`+$${(bet.stake * bet.multiplier).toFixed(1)}`, centerX, centerY + 7)
            }
          } else if (bet.status === "lost") {
            ctx.fillStyle = "rgba(255, 255, 255, 0.7)"
            ctx.font = "bold 9px sans-serif"
            ctx.fillText("LOST", centerX, centerY)
          } else {
            ctx.fillStyle = "#000"
            ctx.font = "bold 9px sans-serif"
            if (tileH > 24) {
              ctx.fillText(`$${bet.stake}`, centerX, centerY - 5)
              ctx.font = "8px monospace"
              ctx.fillText(formatMultiplier(bet.multiplier), centerX, centerY + 7)
            } else {
              ctx.fillText(`$${bet.stake}`, centerX, centerY)
            }
          }
        }
      }

      // Draw hit animations
      hitAnimationsRef.current = hitAnimationsRef.current.filter((anim) => {
        const elapsed = now - anim.startTime
        const duration = 1200
        if (elapsed > duration) return false

        const progress = elapsed / duration

        for (let i = 0; i < 5; i++) {
          const ringProgress = Math.max(0, progress - i * 0.1)
          if (ringProgress <= 0) continue

          const maxRadius = 100 + i * 20
          const ringRadius = ringProgress * maxRadius
          const ringOpacity = (1 - ringProgress) * 0.8

          ctx.beginPath()
          ctx.arc(anim.x, anim.y, ringRadius, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(100, 255, 150, ${ringOpacity})`
          ctx.lineWidth = 4 - ringProgress * 3
          ctx.stroke()
        }

        if (progress < 0.5) {
          const flashProgress = progress / 0.5
          const flashOpacity = 1 - flashProgress
          const flashRadius = 20 + flashProgress * 40

          const flashGradient = ctx.createRadialGradient(anim.x, anim.y, 0, anim.x, anim.y, flashRadius)
          flashGradient.addColorStop(0, `rgba(255, 255, 255, ${flashOpacity})`)
          flashGradient.addColorStop(0.5, `rgba(100, 255, 150, ${flashOpacity * 0.7})`)
          flashGradient.addColorStop(1, `rgba(100, 255, 150, 0)`)

          ctx.beginPath()
          ctx.arc(anim.x, anim.y, flashRadius, 0, Math.PI * 2)
          ctx.fillStyle = flashGradient
          ctx.fill()
        }

        const numSparkles = 8
        for (let i = 0; i < numSparkles; i++) {
          const angle = (i / numSparkles) * Math.PI * 2
          const distance = progress * 80
          const sparkleX = anim.x + Math.cos(angle) * distance
          const sparkleY = anim.y + Math.sin(angle) * distance
          const sparkleOpacity = (1 - progress) * 0.9
          const sparkleSize = (1 - progress) * 4

          ctx.beginPath()
          ctx.arc(sparkleX, sparkleY, sparkleSize, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255, 255, 200, ${sparkleOpacity})`
          ctx.fill()
        }

        return true
      })

      // Draw NOW line
      ctx.strokeStyle = "rgba(255, 220, 255, 0.7)"
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      ctx.moveTo(nowX, padding.top)
      ctx.lineTo(nowX, padding.top + chartHeight)
      ctx.stroke()
      ctx.setLineDash([])

      ctx.fillStyle = "rgba(255, 220, 255, 0.8)"
      ctx.font = "bold 10px monospace"
      ctx.textAlign = "center"
      ctx.fillText("NOW", nowX, padding.top - 10)

      // Draw current price indicator
      if (currentPrice && priceHistory.length > 0) {
        const lastTick = priceHistory[priceHistory.length - 1]
        const y = priceToY(lastTick.price)
        const clampedY = Math.max(padding.top + 10, Math.min(padding.top + chartHeight - 10, y))

        const glowGradient = ctx.createRadialGradient(nowX, clampedY, 0, nowX, clampedY, 20)
        glowGradient.addColorStop(0, "rgba(255, 220, 255, 0.9)")
        glowGradient.addColorStop(1, "rgba(255, 100, 200, 0)")
        ctx.beginPath()
        ctx.arc(nowX, clampedY, 20, 0, Math.PI * 2)
        ctx.fillStyle = glowGradient
        ctx.fill()

        ctx.beginPath()
        ctx.arc(nowX, clampedY, 6, 0, Math.PI * 2)
        ctx.fillStyle = "#fff"
        ctx.fill()
        ctx.strokeStyle = "rgba(255, 100, 200, 0.8)"
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // Draw time labels — skip some on mobile to prevent overlap
      ctx.font = isMobile ? "8px monospace" : "10px monospace"
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)"
      ctx.textAlign = "center"
      const timeLabelStep = isMobile ? 3 : 1

      for (let i = 0; i <= 6; i += timeLabelStep) {
        const seconds = -60 + i * 10
        const t = now + seconds * 1000
        const x = padding.left + ((t - minTime) / totalTimeMs) * chartWidth
        if (x < nowX - 10) {
          ctx.fillText(`${seconds}s`, x, dimensions.height - 8)
        }
      }

      for (let i = 0; i <= cols; i += timeLabelStep) {
        const slotTime = currentSlotStart + i * timeStepMs
        const x = getX(slotTime)
        const secondsFromNow = Math.round((slotTime - now) / 1000)
        if (x >= nowX + 10 && x <= dimensions.width - padding.right) {
          ctx.fillText(`+${secondsFromNow}s`, x, dimensions.height - 8)
        }
      }

      // Dynamic precision based on priceStep so labels don't duplicate
      const stepDecimals = Math.max(2, Math.ceil(-Math.log10(priceStep)) + 1)
      const fmtPrice = (p: number) => `$${p.toFixed(stepDecimals)}`

      // Draw price labels (right side) - skip some if too dense
      const rightLabelStep = priceStep * Math.max(1, Math.ceil(14 / (chartHeight / totalVisibleRows)))
      ctx.textAlign = "right"
      for (let price = lowestGridPrice; price <= highestGridPrice; price += rightLabelStep) {
        const y = priceToY(price)

        if (y < padding.top - 5 || y > padding.top + chartHeight + 5) continue

        const x = dimensions.width - 5

        const isCurrentPriceRow = currentPrice && Math.abs(price - currentPrice) < priceStep / 2

        if (isCurrentPriceRow) {
          ctx.fillStyle = "rgba(255, 100, 200, 1)"
          ctx.font = isMobile ? "bold 9px monospace" : "bold 11px monospace"
        } else {
          ctx.fillStyle = "rgba(255, 255, 255, 0.4)"
          ctx.font = isMobile ? "8px monospace" : "10px monospace"
        }
        ctx.fillText(fmtPrice(price), x, y)
      }

      // Draw price labels (left side) — skip on mobile to save space
      if (!isMobile) {
        ctx.textAlign = "left"
        for (let price = lowestGridPrice; price <= highestGridPrice; price += rightLabelStep * 2) {
          const y = priceToY(price)

          if (y < padding.top - 5 || y > padding.top + chartHeight + 5) continue

          ctx.fillStyle = "rgba(255, 255, 255, 0.25)"
          ctx.font = "9px monospace"
          ctx.fillText(fmtPrice(price), 5, y)
        }
      }

      // === Margin Trade Overlays ===
      if (activePrediction && (quickTradeState === 'watching' || quickTradeState === 'closing' || quickTradeState === 'result')) {
        const entryY = priceToY(activePrediction.entryPrice)

        // Entry price line (dashed, neon green)
        ctx.save()
        ctx.setLineDash([8, 4])
        ctx.strokeStyle = "#00ff88"
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(padding.left, entryY)
        ctx.lineTo(dimensions.width - padding.right, entryY)
        ctx.stroke()
        ctx.setLineDash([])

        // Entry label
        ctx.fillStyle = "#00ff88"
        ctx.font = "bold 9px monospace"
        ctx.textAlign = "left"
        ctx.fillText(`Entry $${activePrediction.entryPrice.toFixed(4)}`, padding.left + 4, entryY - 4)

        // Liquidation price line (dashed, red)
        const liqPrice = calculateLiquidationPrice(
          activePrediction.entryPrice,
          activePrediction.leverage,
          activePrediction.direction === 'long',
        )
        const liqY = priceToY(liqPrice)

        ctx.setLineDash([4, 4])
        ctx.strokeStyle = "#ff4444"
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(padding.left, liqY)
        ctx.lineTo(dimensions.width - padding.right, liqY)
        ctx.stroke()
        ctx.setLineDash([])

        // Liq label
        ctx.fillStyle = "#ff4444"
        ctx.font = "bold 9px monospace"
        ctx.fillText(`Liq $${liqPrice.toFixed(4)}`, padding.left + 4, liqY - 4)

        // PnL overlay (centered)
        if (currentPrice) {
          const priceDiff = currentPrice - activePrediction.entryPrice
          const pnl = activePrediction.direction === 'long'
            ? priceDiff * activePrediction.collateral * activePrediction.leverage / activePrediction.entryPrice
            : -priceDiff * activePrediction.collateral * activePrediction.leverage / activePrediction.entryPrice
          const pnlText = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`
          ctx.fillStyle = pnl >= 0 ? "#00ff88" : "#ff4444"
          ctx.font = "bold 24px monospace"
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText(pnlText, dimensions.width / 2, dimensions.height / 2 - 20)

          // PnL percentage below
          const pnlPct = (pnl / activePrediction.collateral) * 100
          ctx.font = "14px monospace"
          ctx.fillText(`${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%`, dimensions.width / 2, dimensions.height / 2 + 8)
        }

        // Countdown ring (top-right)
        if (quickTradeState === 'watching') {
          const elapsed = (now - activePrediction.startedAt) / 1000
          const progress = Math.min(1, elapsed / activePrediction.timeframe)
          const remaining = Math.max(0, activePrediction.timeframe - elapsed)
          const cx = dimensions.width - padding.right - 30
          const cy = padding.top + 30
          const radius = 20

          // Background ring
          ctx.beginPath()
          ctx.arc(cx, cy, radius, 0, Math.PI * 2)
          ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"
          ctx.lineWidth = 3
          ctx.stroke()

          // Progress ring
          const angle = progress * Math.PI * 2
          ctx.beginPath()
          ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + angle)
          ctx.strokeStyle = progress > 0.8 ? "#ff4444" : "#00ff88"
          ctx.lineWidth = 3
          ctx.stroke()

          // Center text
          ctx.fillStyle = "rgba(255, 255, 255, 0.9)"
          ctx.font = "bold 12px monospace"
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText(`${Math.ceil(remaining)}`, cx, cy)
        }

        ctx.restore()
      }

      animationRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      isActive = false
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [
    dimensions,
    priceHistory,
    currentPrice,
    rows,
    cols,
    priceStep,
    timeStepMs,
    historyWindowMs,
    bets,
    hoveredCell,
    totalVisibleRows,
    totalTimeMs,
    futureTimeMs,
    canBuy,
    canSell,
    activePrediction,
    quickTradeState,
    predictionMode,
    selectedLeverage,
  ])

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top

      const now = Date.now()
      const currentSlotStart = Math.floor(now / timeStepMs) * timeStepMs
      const slotProgress = (now - currentSlotStart) / timeStepMs

      const chartWidth = dimensions.width - padding.left - padding.right
      const nowX = padding.left + (historyWindowMs / totalTimeMs) * chartWidth

      if (x < nowX) return

      const gridWidth = (futureTimeMs / totalTimeMs) * chartWidth
      const cellWidth = gridWidth / cols

      const centerPrice = displayPriceRef.current || currentPrice
      if (!centerPrice) return

      const halfRange = (totalVisibleRows / 2) * priceStep
      const minPrice = centerPrice - halfRange
      const maxPrice = centerPrice + halfRange
      const priceRange = maxPrice - minPrice

      const chartHeight = dimensions.height - padding.top - padding.bottom

      const getX = (timestamp: number) => {
        const slotsFromCurrent = (timestamp - currentSlotStart) / timeStepMs
        return nowX + slotsFromCurrent * cellWidth - slotProgress * cellWidth
      }

      let clickedCol = -1
      for (let col = 0; col < cols; col++) {
        const slotTime = currentSlotStart + col * timeStepMs
        const cellLeftX = getX(slotTime)
        const cellRightX = cellLeftX + cellWidth
        if (x >= cellLeftX && x < cellRightX) {
          clickedCol = col
          break
        }
      }

      if (clickedCol === -1) return

      const betStartTime = currentSlotStart + clickedCol * timeStepMs
      const MIN_BET_LEAD_TIME_MS = 5000
      if (betStartTime - now < MIN_BET_LEAD_TIME_MS) return

      const priceAtClick = maxPrice - ((y - padding.top) / chartHeight) * priceRange
      const cellBottomPrice = Math.floor(priceAtClick / priceStep) * priceStep
      const cellTopPrice = cellBottomPrice + priceStep
      const cellCenterPrice = cellBottomPrice + priceStep / 2

      const lowestGridPrice = Math.floor(minPrice / priceStep) * priceStep
      const clickedRow = Math.round((cellBottomPrice - lowestGridPrice) / priceStep)

      const expiresAt = betStartTime + timeStepMs

      const multiplier = calculateMultiplier(currentPrice!, cellCenterPrice)

      onCellClick(
        clickedRow,
        clickedCol,
        cellBottomPrice,
        cellTopPrice,
        expiresAt,
        betStartTime,
        multiplier,
        cellCenterPrice,
      )
    },
    [
      dimensions,
      currentPrice,
      cols,
      priceStep,
      timeStepMs,
      historyWindowMs,
      totalTimeMs,
      futureTimeMs,
      totalVisibleRows,
      onCellClick,
      isMobile,
    ],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const centerPrice = displayPriceRef.current
      if (!centerPrice || !containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      const chartWidth = dimensions.width - padding.left - padding.right
      const chartHeight = dimensions.height - padding.top - padding.bottom
      const nowX = padding.left + (historyWindowMs / totalTimeMs) * chartWidth

      const now = Date.now()
      const currentSlotStart = Math.floor(now / timeStepMs) * timeStepMs
      const slotProgress = (now - currentSlotStart) / timeStepMs

      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      if (mouseX < nowX || mouseX > dimensions.width - padding.right) {
        setHoveredCell(null)
        return
      }
      if (mouseY < padding.top || mouseY > padding.top + chartHeight) {
        setHoveredCell(null)
        return
      }

      const gridWidth = (futureTimeMs / totalTimeMs) * chartWidth
      const cellWidth = gridWidth / cols

      const getX = (timestamp: number) => {
        const slotsFromCurrent = (timestamp - currentSlotStart) / timeStepMs
        return nowX + slotsFromCurrent * cellWidth - slotProgress * cellWidth
      }

      let hoveredCol = -1
      for (let col = 0; col < cols; col++) {
        const slotStartTime = currentSlotStart + col * timeStepMs
        const slotEndTime = slotStartTime + timeStepMs
        const slotStartX = getX(slotStartTime)
        const slotEndX = getX(slotEndTime)

        if (mouseX >= slotStartX && mouseX < slotEndX) {
          hoveredCol = col
          break
        }
      }

      if (hoveredCol < 0) {
        setHoveredCell(null)
        return
      }

      const halfRange = (totalVisibleRows / 2) * priceStep
      const minPrice = centerPrice - halfRange
      const maxPrice = centerPrice + halfRange
      const priceRange = maxPrice - minPrice

      const relativeY = mouseY - padding.top
      const priceAtMouse = maxPrice - (relativeY / chartHeight) * priceRange

      const cellBottomPrice = Math.floor(priceAtMouse / priceStep) * priceStep
      const cellCenterPrice = cellBottomPrice + priceStep / 2

      const rowOffset = Math.round((cellCenterPrice - centerPrice) / priceStep)
      const logicalRow = baseHalfRows - rowOffset

      if (logicalRow >= 0 && logicalRow < rows) {
        setHoveredCell({ row: logicalRow, col: hoveredCol, absolutePrice: cellCenterPrice })
      } else {
        setHoveredCell(null)
      }
    },
    [
      dimensions,
      rows,
      cols,
      priceStep,
      timeStepMs,
      historyWindowMs,
      totalTimeMs,
      futureTimeMs,
      baseHalfRows,
      totalVisibleRows,
    ],
  )

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredCell(null)}
      />
    </div>
  )
}
