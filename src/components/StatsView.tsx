import { useMemo } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import type { Task, TaskType } from '../types';
import { completedLast7Days, hoursThisWeek, typeDistribution } from '../utils/stats';
import { TYPE_LABEL } from '../utils/taskDisplay';
import { EChart } from './EChart';

interface StatsViewProps {
  tasks: Task[];
  isDark: boolean;
}

/** 饼图配色：与 TYPE_STYLE 标签色系保持一致 */
const TYPE_COLORS: Record<TaskType, string> = {
  homework: '#6366f1',
  exam: '#f43f5e',
  club: '#10b981',
  other: '#94a3b8',
};

const CARD_CLASS =
  'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900';

export function StatsView({ tasks, isDark }: StatsViewProps) {
  const weekDone = useMemo(() => completedLast7Days(tasks), [tasks]);
  const typeDist = useMemo(() => typeDistribution(tasks), [tasks]);
  const weekHours = useMemo(() => hoursThisWeek(tasks), [tasks]);

  // 跟随深浅色的图表文本/分割线/提示框配色
  const axisColor = isDark ? '#94a3b8' : '#64748b';
  const splitColor = isDark ? '#1e293b' : '#e2e8f0';
  const tooltipBg = isDark ? '#1e293b' : '#ffffff';
  const tooltipText = isDark ? '#e2e8f0' : '#0f172a';

  const tooltipBase = {
    backgroundColor: tooltipBg,
    borderWidth: 0,
    textStyle: { color: tooltipText, fontSize: 12 },
  } as const;

  const weekTotal = weekDone.reduce((sum, day) => sum + day.count, 0);

  const lineOption: EChartsCoreOption = useMemo(
    () => ({
      grid: { left: 8, right: 16, top: 20, bottom: 4, containLabel: true },
      tooltip: { trigger: 'axis', ...tooltipBase },
      xAxis: {
        type: 'category',
        data: weekDone.map((day) => day.label),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: splitColor } },
        axisLabel: { color: axisColor, fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: splitColor } },
        axisLabel: { color: axisColor, fontSize: 11 },
      },
      series: [
        {
          type: 'line',
          name: '完成数',
          data: weekDone.map((day) => day.count),
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { width: 2.5, color: '#6366f1' },
          itemStyle: { color: '#6366f1' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(99,102,241,0.22)' },
                { offset: 1, color: 'rgba(99,102,241,0)' },
              ],
            },
          },
        },
      ],
    }),
    // tooltipBase 由主题色拼装，随 isDark 变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekDone, isDark],
  );

  const pieOption: EChartsCoreOption = useMemo(
    () => ({
      tooltip: { trigger: 'item', ...tooltipBase },
      legend: {
        bottom: 0,
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        itemGap: 16,
        textStyle: { color: axisColor, fontSize: 11 },
      },
      series: [
        {
          type: 'pie',
          radius: ['42%', '66%'],
          center: ['50%', '42%'],
          label: { formatter: '{d}%', fontSize: 11, color: axisColor },
          labelLine: { length: 8, length2: 6 },
          data: typeDist
            .filter((item) => item.count > 0)
            .map((item) => ({
              name: TYPE_LABEL[item.type],
              value: item.count,
              itemStyle: { color: TYPE_COLORS[item.type] },
            })),
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [typeDist, isDark],
  );

  const barOption: EChartsCoreOption = useMemo(
    () => ({
      grid: { left: 8, right: 16, top: 20, bottom: 32, containLabel: true },
      tooltip: { trigger: 'axis', ...tooltipBase, valueFormatter: (value: unknown) => `${value} 小时` },
      legend: {
        bottom: 0,
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        itemGap: 24,
        textStyle: { color: axisColor, fontSize: 11 },
      },
      xAxis: {
        type: 'category',
        data: weekHours.labels,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: splitColor } },
        axisLabel: { color: axisColor, fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: splitColor } },
        axisLabel: { color: axisColor, fontSize: 11 },
      },
      series: [
        {
          type: 'bar',
          name: '预计耗时',
          data: weekHours.estimated,
          barMaxWidth: 16,
          itemStyle: { color: '#94a3b8', borderRadius: [4, 4, 0, 0] },
        },
        {
          type: 'bar',
          name: '实际耗时',
          data: weekHours.actual,
          barMaxWidth: 16,
          itemStyle: { color: '#10b981', borderRadius: [4, 4, 0, 0] },
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekHours, isDark],
  );

  return (
    <div className="space-y-4">
      <section className={CARD_CLASS}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">近 7 天完成</h2>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">共 {weekTotal} 件</span>
        </div>
        <EChart option={lineOption} className="mt-1 h-48 w-full" ariaLabel="近 7 天每天完成任务数折线图" />
      </section>

      <section className={CARD_CLASS}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">任务类型占比</h2>
        <EChart option={pieOption} className="mt-1 h-56 w-full" ariaLabel="各类任务占比饼图" />
      </section>

      <section className={CARD_CLASS}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">本周耗时对比</h2>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            已完成 {weekHours.doneCount} 件 · 预计 {weekHours.totalEstimated}h · 实际{' '}
            {weekHours.totalActual}h
          </span>
        </div>
        <EChart option={barOption} className="mt-1 h-52 w-full" ariaLabel="本周预计耗时与实际耗时对比柱状图" />
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
          按完成时间统计本周已完成事项；实际耗时需在编辑事项时手动填写，未填按 0 计。
        </p>
      </section>
    </div>
  );
}
