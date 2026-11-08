/** Drag-to-resize header cell for antd Table columns (no extra dependency).
 *
 * 用法：
 *   const { widths, resizeCell, totalWidth } = useResizableCols(DEFAULTS, saved, onChange);
 *   <Table
 *     components={{ header: { cell: ResizableTitle } }}
 *     columns={[{ width: widths.name, onHeaderCell: resizeCell('name'), ... }]}
 *   />
 *
 * 只有同时提供 width 与 onResize 的列才会出现拖拽手柄。
 */

import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, RefObject, ThHTMLAttributes } from 'react';

/** 默认最小列宽（px），避免被拖到完全看不见内容。 */
export const MIN_COL_WIDTH = 60;

/**
 * 自适应时的安全余量（px）：竖向滚动条、边框、取整误差。
 * 宁可少算一点 —— 列宽总和略小于容器时，antd 的 min-width:100% 会把列拉伸填满；
 * 反过来多算一点就会多出一条横向滚动条。
 */
export const FIT_SAFETY = 20;

export interface ResizableHeaderCellProps extends ThHTMLAttributes<HTMLTableCellElement> {
  /** 当前列宽；未设置则不渲染拖拽手柄。 */
  width?: number;
  /** 拖拽结束时回调（拖拽过程中的预览直接改 DOM，不走 React）。 */
  onResize?: (width: number) => void;
  /** 该列允许的最小宽度，默认 MIN_COL_WIDTH。 */
  minWidth?: number;
}

export default function ResizableTitle({
  width,
  onResize,
  minWidth = MIN_COL_WIDTH,
  style,
  children,
  ...rest
}: ResizableHeaderCellProps) {
  const thRef = useRef<HTMLTableCellElement>(null);
  const start = useRef({ x: 0, width: 0 });
  const [hover, setHover] = useState(false);

  if (!width || !onResize) return <th style={style} {...rest}>{children}</th>;

  const handleMouseDown = (e: ReactMouseEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    start.current = { x: e.clientX, width };

    // ── 拖拽预览直接改 <col> 的宽度，不触发 React 渲染 ──
    // 表头表格和表体表格各有一份 colgroup（固定表头时是两个 table），都要改。
    // 表格总宽由 antd 的内联样式控制，改一列后浏览器会按 table-layout:fixed
    // 自动把多出来的宽度分摊给其它列 —— 与逐帧重渲染的效果一致，但快得多。
    const th = thRef.current;
    const scopes: Element[] = [];
    let wrapper: Element | null = null;
    if (th) {
      wrapper = th.closest('.ant-table-wrapper') || th.closest('.ant-table');
      const tr = th.parentElement;
      if (wrapper && tr) {
        const index = Array.from(tr.children).indexOf(th);
        wrapper.querySelectorAll('colgroup').forEach(cg => {
          const col = cg.children[index];
          if (col) scopes.push(col);
        });
      }
    }

    let latest = width;
    const applyWidth = (w: number) => {
      scopes.forEach(col => {
        (col as HTMLElement).style.width = `${w}px`;
        (col as HTMLElement).style.minWidth = `${w}px`;
      });
    };

    const canPatchDom = scopes.length > 0;
    let raf = 0;
    let pending: number | null = null;

    const onMove = (ev: MouseEvent) => {
      pending = Math.max(minWidth, Math.round(start.current.width + ev.clientX - start.current.x));
      if (!canPatchDom || pending === latest || raf) return;
      // 每帧最多改一次 DOM
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (pending === null) return;
        latest = pending;
        applyWidth(latest);
      });
    };

    const onUp = () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const finalWidth = pending ?? latest;
      if (canPatchDom) applyWidth(finalWidth);   // 保证与随后 React 提交的值一致
      onResize(finalWidth);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <th ref={thRef} style={{ ...style, position: 'relative' }} {...rest}>
      {/* zIndex 1：可排序列的表头有一层 .ant-table-column-sorters::after 铺满整格，
          不抬高就会被它挡住点不到。筛选图标距离右边缘 8px，不会被这 6px 覆盖。 */}
      <span
        onMouseDown={handleMouseDown}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: 0,
          insetInlineEnd: 0,
          height: '100%',
          width: 6,
          zIndex: 1,
          cursor: 'col-resize',
          userSelect: 'none',
          touchAction: 'none',
          borderInlineEnd: `2px solid ${hover ? '#4f46e5' : 'transparent'}`,
        }}
      />
      {children}
    </th>
  );
}

/**
 * 管理一组可拖拽列宽：默认值 + 上次保存的值，并让列宽随容器宽度自适应。
 *
 * @param defaults  各列默认宽度，key 自定（与 resizeCell 的 key 对应）
 * @param saved     上次保存的宽度（通常来自 store），可为空
 * @param onChange  拖拽时的变更回调，调用方负责持久化
 * @param minWidths 各列最小宽度，缺省用 MIN_COL_WIDTH
 * @param available 表格可用宽度（已扣除选择列/展开列等预留宽度）。
 *                  列宽总和超过它时等比缩小（只缩不放），
 *                  避免高屏幕缩放 / 小窗口下表格横向溢出、内容被挤出可视区。
 */
export function useResizableCols(
  defaults: Record<string, number>,
  saved: Record<string, number> | undefined,
  onChange: (widths: Record<string, number>) => void,
  minWidths: Record<string, number> = {},
  available = 0,
) {
  const base = { ...defaults, ...(saved || {}) };
  const baseSum = Object.keys(base).reduce((sum, k) => sum + (base[k] || 0), 0);

  const scale = available > 0 && baseSum > available
    ? available / baseSum
    : 1;

  const widths = scale >= 1
    ? base
    : Object.keys(base).reduce<Record<string, number>>((acc, k) => {
        acc[k] = Math.max(minWidths[k] ?? MIN_COL_WIDTH, Math.round(base[k] * scale));
        return acc;
      }, {});

  /** 生成 antd 列上的 onHeaderCell */
  const resizeCell = (key: string) => (): ResizableHeaderCellProps => ({
    width: widths[key],
    minWidth: minWidths[key] ?? MIN_COL_WIDTH,
    onResize: (w: number) => onChange(absorbResize(widths, key, w, available, minWidths)),
  });
  /** 所有可调列宽度之和（不含选择/展开等自动列） */
  const totalWidth = Object.keys(defaults).reduce((sum, k) => sum + (widths[k] || 0), 0);
  return { widths, resizeCell, totalWidth };
}

/**
 * 松手提交列宽：被拖的列保持用户设定的宽度，超出可用宽度的部分按比例从其它列扣回来。
 * 这样总和仍不超过可用宽度，下一帧不会被自适应缩放「弹回去」，
 * 视觉上与拖拽过程中的预览一致。
 */
function absorbResize(
  widths: Record<string, number>,
  key: string,
  w: number,
  available: number,
  minWidths: Record<string, number>,
) {
  const keys = Object.keys(widths);
  const othersSum = keys.reduce((sum, k) => sum + (k === key ? 0 : widths[k] || 0), 0);
  const budget = available - w;
  if (available <= 0 || budget <= 0 || othersSum <= budget) return { ...widths, [key]: w };

  const ratio = budget / othersSum;
  const next: Record<string, number> = {};
  keys.forEach(k => {
    next[k] = k === key
      ? w
      : Math.max(minWidths[k] ?? MIN_COL_WIDTH, Math.round((widths[k] || 0) * ratio));
  });
  return next;
}

/**
 * 观察元素宽度。配合 useResizableCols 的 available 参数做列宽自适应。
 * 用法：const [wrapRef, width] = useContainerWidth<HTMLDivElement>(); 然后 <div ref={wrapRef}>…
 */
export function useContainerWidth<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = (w: number) => setWidth(prev => (Math.abs(prev - w) > 1 ? w : prev));
    update(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === 'number') update(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}
