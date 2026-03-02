import * as echarts from "echarts";

export function lineChart(el: HTMLDivElement, title: string, dates: string[], series: Record<string, Array<number | null>>) {
  const chart = echarts.init(el);
  const names = Object.keys(series);

  chart.setOption({
    backgroundColor: "transparent",
    title: { text: title, left: "left", textStyle: { color: "#e4e4e7", fontSize: 14 } },
    tooltip: { trigger: "axis" },
    grid: { left: 40, right: 20, top: 50, bottom: 30 },
    xAxis: { type: "category", data: dates, axisLabel: { color: "#a1a1aa" } },
    yAxis: { type: "value", axisLabel: { color: "#a1a1aa" }, splitLine: { lineStyle: { color: "#27272a" } } },
    legend: { top: 24, textStyle: { color: "#a1a1aa" } },
    series: names.map((n) => ({
      name: n,
      type: "line",
      showSymbol: false,
      data: series[n],
      smooth: true,
      lineStyle: { width: 2 },
    })),
  });

  const onResize = () => chart.resize();
  window.addEventListener("resize", onResize);
  return () => {
    window.removeEventListener("resize", onResize);
    chart.dispose();
  };
}
