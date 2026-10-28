import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';

// 按需注册：只打包统计页用到的图表与组件，控制包体积
echarts.use([
  LineChart,
  PieChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

interface EChartProps {
  option: EChartsCoreOption;
  className?: string;
  ariaLabel?: string;
}

/**
 * ECharts 容器组件：负责 init / dispose / 随容器尺寸变化 resize。
 * option 变化时全量重绘（notMerge），深浅色切换依赖调用方生成新 option。
 */
export function EChart({ option, className, ariaLabel }: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = echarts.init(container);
    chartRef.current = chart;

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <div ref={containerRef} className={className} role="img" aria-label={ariaLabel} />;
}
