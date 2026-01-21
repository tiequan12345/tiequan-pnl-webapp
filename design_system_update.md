# Void & Glass Design System Update
*Aesthetic Refinements for the Ultra High-End Interface*

This document catalogs the visual changes made to the **Holdings Page** that define the new "Void & Glass" design language. These patterns should be applied to the **Dashboard** and other key views to ensure a cohesive, premium experience.

## 1. Core Aesthetic Principles ("Void & Glass")
*   **Backgrounds:** Deep, rich darks (`bg-zinc-950`) with subtle "glass" overlays (`bg-zinc-900/40`, `backdrop-blur-xl`).
*   **Borders:** Extremely subtle, high-end borders (`border-white/5` or `border-zinc-800/50`). Avoid heavy outlines.
*   **Atmosphere:** Use large, blurred background gradients (e.g., `bg-blue-500/5 blur-3xl`) to create depth without noise.
*   **Typography:** Strict separation of purpose.
    *   **Sans-Serif (System/Inter):** Headers, labels, UI text. Clean, legible, distinct.
    *   **Monospace (System/SF Mono):** Restricted to **Hero Portfolio Values** only.
        *   *Update:* Tables and standard data grids should use **Sans-Serif** (Inter/System) for a cleaner, less "terminal" look.
    *   **Hero Typography:** The "Silicon Valley" aesthetic is defined by:
        *   `font-mono`
        *   `font-bold`
        *   `tracking-tighter` (Crucial for the premium look on large numbers)

## 2. Component-Specific Changes

### A. Portfolio Hero Section
*Replace standard summary cards with a "Hero" container.*
*   **Container Style:** `rounded-2xl border border-white/5 bg-zinc-900/40 backdrop-blur-xl p-8`
*   **Decor:** Absolute positioned, large blur blobs (Emerald/Blue) in corners.
*   **Primary Value:** Massive font sizing (`text-6xl` to `text-7xl`), `font-bold`, `tracking-tighter`.
*   **Metadata:** Small pill badges (`rounded-full bg-zinc-800/50 text-xs`) for status indicators (e.g., "Updated", "Auto-refresh").

### B. Data & Tables
*Refine data presentation for precision and readability.*
*   **Typography:** Use standard **Sans-Serif** for all table data numbers.
    *   *Rule:* Avoid `font-mono` in data tables to maintain a polished, non-technical aesthetic.
*   **Alignment:** Strictly right-align all financial columns.
*   **Visual Data Bars:** Add background progress bars to "Market Value" or "Weight" columns to visualizing relative size.
    *   *Style:* `bg-emerald-500/10` (or primary color), `rounded-sm`, `absolute inset-y-0 right-0`.
*   **P&L Colors:**
    *   **Positive:** `text-emerald-400`
    *   **Negative:** `text-rose-400`
    *   **Zero/Neutral:** `text-zinc-500` (Avoid high-contrast white for neutral).

### C. Data Visualization (Charts)
*Clean, unobstructed visualizations.*
*   **Treemaps / Heatmaps:**
    *   **No Stroke:** Remove borders around cells (`stroke="none"`) to prevent alias blurring on text.
    *   **Contrast:** Use `text-shadow: 0 1px 2px rgba(0,0,0,0.5)` for white text on colored cells.
    *   **Filtering:** Exclude `CASH_LIKE` assets (USDT, USDC) from performance/volatility views to prevent skewing.
    *   **View Toggles:** Use segmented controls (`bg-zinc-900/50 p-1 rounded-lg`) instead of standard tabs or dropdowns.

### D. Typography & Scaling
*   **Font Weights:** Use `font-medium` (500) or `font-semibold` (600) for labels to render sharply against dark backgrounds.
*   **Text Rendering:** Use `text-rendering: optimizeLegibility` for small SVG text.
*   **Sizing:** 
    *   **Labels:** `text-xs` (12px) `uppercase tracking-wider text-zinc-400`.
    *   **Body:** `text-sm` (14px) `text-zinc-200`.

## 3. Dashboard Application Strategy
*To be applied to the Dashboard view:*
1.  **Header:** Convert the top summary row into the **Portfolio Hero** component.
2.  **Equity Curve:** Ensure the main chart sits within a "Glass" container (`border-white/5 bg-zinc-900/40`) with the same background blur effects.
3.  **Recent Transactions / Tables:** Update to use `DataTable` with the **Monospace** and **Data Bar** enhancements.
4.  **Metric Cards:** If retaining smaller cards, ensure they share the `bg-zinc-900/40` backdrop and `border-white/5` styling, removing solid opaque backgrounds.
